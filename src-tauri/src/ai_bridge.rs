use crate::storage::{atomic_write, error, Result};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, WebviewWindow};

// Full-document AI edits include embedded media, so their requests can be large.
const MAX_AI_REQUEST_BYTES: u64 = 128 * 1024 * 1024;

pub struct Session {
    pub path: PathBuf,
    token: String,
    document: Option<String>,
    document_key: Option<String>,
    pending_id: Option<String>,
    owner: Option<fs::File>,
}
impl Drop for Session {
    fn drop(&mut self) {
        self.owner.take();
        let _ = fs::remove_dir_all(&self.path);
    }
}
#[derive(Default)]
pub struct AiBridge(pub Mutex<BTreeMap<String, Session>>);

fn root() -> PathBuf {
    std::env::temp_dir().join("blackdoc-ai")
}
fn owner_lock(path: &Path, create: bool) -> Result<fs::File> {
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create(create);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0);
    }
    let file = options.open(path).map_err(error)?;
    #[cfg(not(windows))]
    file.try_lock().map_err(error)?;
    Ok(file)
}
// Exclusive ownership prevents cleanup from deleting another live window's session.
pub fn cleanup_stale() {
    let Ok(entries) = fs::read_dir(root()) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !entry.file_type().is_ok_and(|kind| kind.is_dir()) {
            continue;
        }
        if uuid::Uuid::parse_str(&entry.file_name().to_string_lossy()).is_err() {
            continue;
        }
        let owner = path.join("owner.lock");
        if owner.exists() {
            let Ok(lock) = owner_lock(&owner, false) else {
                continue;
            };
            drop(lock);
        }
        let _ = fs::remove_dir_all(path);
    }
}
fn create_session(document: Option<String>, document_key: Option<String>) -> Result<Session> {
    let path = root().join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).map_err(error)?;
    let mut session = Session {
        path,
        token: uuid::Uuid::new_v4().to_string(),
        document,
        document_key,
        pending_id: None,
        owner: None,
    };
    session.owner = Some(owner_lock(&session.path.join("owner.lock"), true)?);
    atomic_write(
        &session.path.join("connection.json"),
        &serde_json::to_vec(&json!({
            "protocol": 2, "token": session.token, "path": session.document, "textEdits": true
        }))
        .map_err(error)?,
    )?;
    Ok(session)
}
#[tauri::command]
pub fn desktop_ai_take_request(
    window: WebviewWindow,
    path: Option<String>,
    document_key: Option<String>,
) -> Result<Option<Value>> {
    let state = window.state::<AiBridge>();
    let mut sessions = state.0.lock().map_err(error)?;
    let label = window.label().to_string();
    if sessions
        .get(&label)
        .is_some_and(|session| session.document_key != document_key)
    {
        sessions.remove(&label);
    }
    if !sessions.contains_key(&label) {
        sessions.insert(label.clone(), create_session(path.clone(), document_key)?);
    }
    let session = sessions.get_mut(&label).unwrap();
    if session.document != path {
        session.document = path;
        atomic_write(
            &session.path.join("connection.json"),
            &serde_json::to_vec(&json!({
                "protocol": 2, "token": session.token, "path": session.document, "textEdits": true
            }))
            .map_err(error)?,
        )?;
    }
    take_request(session)
}
#[tauri::command]
pub fn desktop_ai_respond(
    window: WebviewWindow,
    document_key: Option<String>,
    response: Value,
) -> Result<()> {
    let state = window.state::<AiBridge>();
    let mut sessions = state.0.lock().map_err(error)?;
    let Some(session) = sessions
        .get_mut(window.label())
        .filter(|session| session.document_key == document_key)
    else {
        return Ok(()); // The originating document session has closed.
    };
    write_response(session, response)
}
fn write_response(session: &mut Session, response: Value) -> Result<()> {
    let id = session
        .pending_id
        .as_deref()
        .ok_or("AI connection is unavailable")?;
    if response.get("id").and_then(Value::as_str) != Some(id) {
        return Err("AI response does not match the request".into());
    }
    atomic_write(
        &session.path.join("response.json"),
        &serde_json::to_vec(&response).map_err(error)?,
    )?;
    session.pending_id = None;
    Ok(())
}
fn take_request(session: &mut Session) -> Result<Option<Value>> {
    let request = session.path.join("request.json");
    let metadata = match fs::metadata(&request) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(error(err)),
    };
    if metadata.len() > MAX_AI_REQUEST_BYTES {
        fs::remove_file(&request).map_err(error)?;
        return Err("AI request exceeds 128 MB".into());
    }
    let bytes = fs::read(&request).map_err(error)?;
    fs::remove_file(&request).map_err(error)?;
    let mut request: Value = serde_json::from_slice(&bytes).map_err(error)?;
    if request.get("token").and_then(Value::as_str) != Some(session.token.as_str()) {
        return Err("Invalid AI connection credential".into());
    }
    let id = request
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or("Invalid AI request ID")?
        .to_owned();
    request
        .as_object_mut()
        .ok_or("Invalid AI request")?
        .remove("token");
    session.pending_id = Some(id);
    Ok(Some(request))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn read_and_apply_take_only_authenticated_requests_and_match_responses() {
        let mut session = create_session(Some("test.bdoc".into()), None).unwrap();
        assert!(!session.path.join("snapshot.json").exists());
        let snapshot = json!({"revision": "v1", "blocks": []});
        let connection: Value =
            serde_json::from_slice(&fs::read(session.path.join("connection.json")).unwrap())
                .unwrap();
        assert_eq!(connection["protocol"], 2);
        assert_eq!(connection["textEdits"], true);
        assert!(take_request(&mut session).unwrap().is_none());
        atomic_write(
            &session.path.join("request.json"),
            br#"{"token":"wrong","operation":"read"}"#,
        )
        .unwrap();
        assert!(take_request(&mut session).is_err());
        assert!(!session.path.join("response.json").exists());
        for operation in ["read", "apply"] {
            let mut request = json!({
                "id": operation, "token": session.token, "operation": operation,
            });
            if operation == "apply" {
                request["revision"] = json!("v1");
                request["changes"] = json!([{"op":"updateContent","blockId":"p","content":[]}]);
            }
            atomic_write(
                &session.path.join("request.json"),
                &serde_json::to_vec(&request).unwrap(),
            )
            .unwrap();
            let received = take_request(&mut session).unwrap().unwrap();
            request.as_object_mut().unwrap().remove("token");
            assert_eq!(received, request);
            assert!(take_request(&mut session).unwrap().is_none());
            assert!(write_response(&mut session, json!({"id":"wrong","ok":true})).is_err());
            let response = if operation == "read" {
                json!({"id":operation,"ok":true,"snapshot":snapshot})
            } else {
                json!({"id":operation,"ok":true,"revision":"v2"})
            };
            write_response(&mut session, response.clone()).unwrap();
            let written: Value =
                serde_json::from_slice(&fs::read(session.path.join("response.json")).unwrap())
                    .unwrap();
            assert_eq!(written, response);
            assert!(session.pending_id.is_none());
        }
        let path = session.path.clone();
        drop(session);
        assert!(!path.exists());
    }
    #[test]
    fn cleanup_preserves_live_sessions() {
        let session = create_session(None, None).unwrap();
        let stale = root().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&stale).unwrap();
        fs::write(stale.join("response.json"), b"private").unwrap();
        cleanup_stale();
        assert!(session.path.exists());
        assert!(!stale.exists());
    }
}
