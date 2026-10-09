use crate::storage::{atomic_write, error, Result};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, WebviewWindow};

pub struct Session {
    pub path: PathBuf,
    token: String,
    document: Option<String>,
    document_key: Option<String>,
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
        owner: None,
    };
    session.owner = Some(owner_lock(&session.path.join("owner.lock"), true)?);
    atomic_write(
        &session.path.join("connection.json"),
        &serde_json::to_vec(&json!({
            "protocol": 2, "token": session.token, "path": session.document
        }))
        .map_err(error)?,
    )?;
    Ok(session)
}
#[tauri::command]
pub fn desktop_ai_pending(
    window: WebviewWindow,
    path: Option<String>,
    document_key: Option<String>,
) -> Result<bool> {
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
                "protocol": 2, "token": session.token, "path": session.document
            }))
            .map_err(error)?,
        )?;
    }
    Ok(sessions[&label].path.join("request.json").exists()
        || sessions[&label].path.join("awaiting-response").exists())
}
#[tauri::command]
pub fn desktop_ai_exchange(
    window: WebviewWindow,
    snapshot: Value,
    response: Option<Value>,
) -> Result<Option<Value>> {
    let state = window.state::<AiBridge>();
    let sessions = state.0.lock().map_err(error)?;
    let session = sessions
        .get(window.label())
        .ok_or("AI connection is unavailable")?;
    exchange(session, snapshot, response)
}
fn exchange(session: &Session, snapshot: Value, response: Option<Value>) -> Result<Option<Value>> {
    let path = &session.path;
    if let Some(response) = response {
        atomic_write(
            &path.join("response.json"),
            &serde_json::to_vec(&response).map_err(error)?,
        )?;
        let _ = fs::remove_file(path.join("awaiting-response"));
    }
    let request = path.join("request.json");
    if !request.exists() {
        return Ok(None);
    }
    if fs::metadata(&request).map_err(error)?.len() > 16 * 1024 * 1024 {
        fs::remove_file(&request).map_err(error)?;
        return Err("AI request exceeds 16 MB".into());
    }
    let bytes = fs::read(&request).map_err(error)?;
    fs::remove_file(&request).map_err(error)?;
    let mut request: Value = serde_json::from_slice(&bytes).map_err(error)?;
    if request.get("token").and_then(Value::as_str) != Some(session.token.as_str()) {
        return Err("Invalid AI connection credential".into());
    }
    request
        .as_object_mut()
        .ok_or("Invalid AI request")?
        .remove("token");
    match request.get("operation").and_then(Value::as_str) {
        Some("read") => {
            atomic_write(
                &path.join("response.json"),
                &serde_json::to_vec(&json!({
                    "id": request["id"], "ok": true, "snapshot": snapshot
                }))
                .map_err(error)?,
            )?;
        }
        Some("apply") => {
            atomic_write(&path.join("awaiting-response"), b"")?;
        }
        _ => return Err("Unknown AI operation".into()),
    }
    Ok(Some(request))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lazy_snapshot_and_authenticated_read_apply() {
        let session = create_session(Some("test.bdoc".into()), None).unwrap();
        assert!(!session.path.join("snapshot.json").exists());
        let snapshot = json!({"revision": "v1", "blocks": []});
        atomic_write(
            &session.path.join("request.json"),
            br#"{"token":"wrong","operation":"read"}"#,
        )
        .unwrap();
        assert!(exchange(&session, snapshot.clone(), None).is_err());
        assert!(!session.path.join("response.json").exists());
        for operation in ["read", "apply"] {
            atomic_write(
                &session.path.join("request.json"),
                &serde_json::to_vec(&json!({
                    "id": operation, "token": session.token, "operation": operation,
                    "revision": "v1", "blocks": []
                }))
                .unwrap(),
            )
            .unwrap();
            let request = exchange(&session, snapshot.clone(), None).unwrap().unwrap();
            assert!(request.get("token").is_none());
        }
        assert!(session.path.join("awaiting-response").exists());
        exchange(&session, snapshot, Some(json!({"id":"apply","ok":true}))).unwrap();
        assert!(!session.path.join("awaiting-response").exists());
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
