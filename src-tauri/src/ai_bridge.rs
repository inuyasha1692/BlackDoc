use crate::storage::{atomic_write, error, Result};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, WebviewWindow};

#[derive(Default)]
pub struct AiBridge(pub Mutex<BTreeMap<String, PathBuf>>);

#[tauri::command]
pub fn desktop_ai_enable(window: WebviewWindow, enabled: bool) -> Result<Option<String>> {
    let state = window.state::<AiBridge>();
    let mut sessions = state.0.lock().map_err(error)?;
    if let Some(path) = sessions.remove(window.label()) {
        let _ = fs::remove_dir_all(path);
    }
    if !enabled {
        return Ok(None);
    }
    let path = std::env::temp_dir()
        .join("blackdoc-ai")
        .join(uuid::Uuid::new_v4().to_string());
    fs::create_dir_all(&path).map_err(error)?;
    sessions.insert(window.label().to_string(), path.clone());
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn desktop_ai_exchange(
    window: WebviewWindow,
    snapshot: Value,
    response: Option<Value>,
) -> Result<Option<Value>> {
    let state = window.state::<AiBridge>();
    let sessions = state.0.lock().map_err(error)?;
    let path = sessions
        .get(window.label())
        .ok_or("AI connection is disabled")?;
    exchange(path, snapshot, response)
}

fn exchange(path: &Path, snapshot: Value, response: Option<Value>) -> Result<Option<Value>> {
    let bytes = serde_json::to_vec(&snapshot).map_err(error)?;
    let snapshot_path = path.join("snapshot.json");
    if fs::read(&snapshot_path).ok().as_deref() != Some(bytes.as_slice()) {
        atomic_write(&snapshot_path, &bytes)?;
    }
    if let Some(response) = response {
        atomic_write(
            &path.join("response.json"),
            &serde_json::to_vec(&response).map_err(error)?,
        )?;
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
    serde_json::from_slice(&bytes).map(Some).map_err(error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn publishes_snapshot_consumes_request_once_and_returns_response() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path();
        let snapshot = json!({"revision": "v1", "blocks": []});
        assert_eq!(exchange(path, snapshot.clone(), None).unwrap(), None);
        assert_eq!(
            serde_json::from_slice::<Value>(&fs::read(path.join("snapshot.json")).unwrap())
                .unwrap(),
            snapshot
        );
        let request = json!({"id": "request", "revision": "v1"});
        atomic_write(
            &path.join("request.json"),
            &serde_json::to_vec(&request).unwrap(),
        )
        .unwrap();
        assert_eq!(
            exchange(path, snapshot.clone(), None).unwrap(),
            Some(request)
        );
        let response = json!({"id": "request", "ok": true});
        assert_eq!(
            exchange(path, snapshot, Some(response.clone())).unwrap(),
            None
        );
        assert_eq!(
            serde_json::from_slice::<Value>(&fs::read(path.join("response.json")).unwrap())
                .unwrap(),
            response
        );
    }

    #[test]
    fn malformed_request_is_consumed_and_does_not_change_snapshot() {
        let directory = tempfile::tempdir().unwrap();
        atomic_write(&directory.path().join("request.json"), b"invalid json").unwrap();
        assert!(exchange(directory.path(), json!({"revision": "v"}), None).is_err());
        assert!(!directory.path().join("request.json").exists());
        assert!(exchange(directory.path(), json!({"revision": "v"}), None)
            .unwrap()
            .is_none());
    }
}
