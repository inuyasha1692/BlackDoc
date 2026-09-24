mod storage;

use serde::Serialize;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Mutex,
};
use storage::{error, Draft, Result};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[derive(Clone, Serialize)]
struct Document {
    path: String,
    name: String,
    blocks: Value,
}

#[derive(Serialize)]
struct Bootstrap {
    document: Option<Document>,
    draft: Option<Draft>,
}

#[derive(Serialize)]
struct SavedDocument {
    path: String,
    name: String,
}

struct Session {
    id: String,
    path: Option<PathBuf>,
    last_export: Option<PathBuf>,
    document: Option<Document>,
    draft: Option<Draft>,
    baseline: Option<Vec<u8>>,
}

#[derive(Default)]
struct Desktop {
    sessions: BTreeMap<String, Session>,
    draft_directory: PathBuf,
    ready: bool,
    pending_launches: Vec<(Vec<String>, PathBuf)>,
}

#[derive(Default)]
struct Backend(Mutex<Desktop>);

impl Desktop {
    fn session(&self, label: &str) -> Result<&Session> {
        self.sessions
            .get(label)
            .ok_or_else(|| "Unknown or closed document window".into())
    }

    fn owner(&self, path: &Path) -> Option<&str> {
        let key = storage::path_key(path);
        self.sessions.iter().find_map(|(label, session)| {
            session
                .path
                .as_ref()
                .filter(|bound| storage::path_key(bound) == key)
                .map(|_| label.as_str())
        })
    }

    fn check_destination(&self, label: &str, path: &Path) -> Result<()> {
        if self.owner(path).is_some_and(|owner| owner != label) {
            Err("This file is already open in another window".into())
        } else {
            Ok(())
        }
    }

    fn try_reuse_document(
        &mut self,
        label: &str,
        path: &Path,
        reuse_current: bool,
    ) -> Result<Option<Document>> {
        let session = self.session(label)?;
        if !reuse_current
            || session.path.is_some()
            || session.document.is_some()
            || session.draft.is_some()
        {
            return Ok(None);
        }
        let path = storage::canonical_target(path)?;
        if self.owner(&path).is_some() {
            return Ok(None);
        }
        let (blocks, baseline) = storage::read_document(&path)?;
        let document = Document {
            path: path.to_string_lossy().into_owned(),
            name: name(&path),
            blocks,
        };
        // The caller holds the desktop lock through validation and binding.
        let session = self.sessions.get_mut(label).ok_or("Window closed")?;
        session.path = Some(path);
        session.document = Some(document.clone());
        session.baseline = Some(baseline);
        Ok(Some(document))
    }
}

// All state transitions and filesystem writes are serialized off the UI thread.
// Native pickers run outside this lock; their results are reauthorized afterwards.
async fn with_desktop<T: Send + 'static>(
    app: AppHandle,
    operation: impl FnOnce(&AppHandle, &mut Desktop) -> Result<T> + Send + 'static,
) -> Result<T> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Backend>();
        let mut desktop = state
            .0
            .lock()
            .map_err(|_| "Desktop session lock poisoned")?;
        operation(&app, &mut desktop)
    })
    .await
    .map_err(error)?
}

fn name(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned()
}

fn focus(app: &AppHandle, label: &str) -> Result<()> {
    let window = app
        .get_webview_window(label)
        .ok_or("Document window is unavailable")?;
    window.unminimize().map_err(error)?;
    window.show().map_err(error)?;
    window.set_focus().map_err(error)
}

fn create_window(
    app: &AppHandle,
    desktop: &mut Desktop,
    document: Option<Document>,
    draft: Option<Draft>,
    baseline: Option<Vec<u8>>,
) -> Result<()> {
    let id = match &draft {
        Some(draft) => draft.id.clone(),
        None => loop {
            let id = uuid::Uuid::new_v4().to_string();
            if !storage::draft_path(&desktop.draft_directory, &id)?.exists()
                && !desktop.sessions.contains_key(&format!("doc-{id}"))
            {
                break id;
            }
        },
    };
    let label = format!("doc-{id}");
    let title = document.as_ref().map_or("BlackDoc".to_string(), |doc| {
        format!("{} - BlackDoc", doc.name)
    });
    desktop.sessions.insert(
        label.clone(),
        Session {
            id,
            path: document.as_ref().map(|doc| PathBuf::from(&doc.path)),
            last_export: None,
            document,
            draft,
            baseline,
        },
    );
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(1280.0, 900.0)
        .min_inner_size(640.0, 480.0)
        .on_navigation(|url| {
            (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
                || (matches!(url.scheme(), "http" | "https")
                    && url.host_str() == Some("tauri.localhost"))
                || (cfg!(debug_assertions)
                    && url.scheme() == "http"
                    && url.host_str() == Some("127.0.0.1")
                    && url.port() == Some(1420))
        })
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .disable_drag_drop_handler()
        .build();
    match window {
        Ok(_) => Ok(()),
        Err(err) => {
            desktop.sessions.remove(&label);
            Err(error(err))
        }
    }
}

fn open_document(app: &AppHandle, desktop: &mut Desktop, path: &Path) -> Result<()> {
    let path = storage::canonical_target(path)?;
    if let Some(label) = desktop.owner(&path) {
        return focus(app, label);
    }
    let (blocks, baseline) = storage::read_document(&path)?;
    let document = Document {
        path: path.to_string_lossy().into_owned(),
        name: name(&path),
        blocks,
    };
    create_window(app, desktop, Some(document), None, Some(baseline))
}

fn launch_documents(
    app: &AppHandle,
    desktop: &mut Desktop,
    args: Vec<String>,
    cwd: &Path,
) -> Vec<String> {
    let paths = storage::argv_documents(args, cwd);
    let mut errors = Vec::new();
    for path in paths {
        if let Err(err) = open_document(app, desktop, &path) {
            errors.push(format!("{}: {err}", path.display()));
        }
    }
    errors
}

fn show_errors(app: &AppHandle, errors: Vec<String>) {
    if !errors.is_empty() {
        app.dialog()
            .message(errors.join("\n\n"))
            .title("BlackDoc")
            .kind(tauri_plugin_dialog::MessageDialogKind::Error)
            .show(|_| {});
    }
}

#[tauri::command]
async fn desktop_bootstrap(window: WebviewWindow) -> Result<Bootstrap> {
    with_desktop(window.app_handle().clone(), move |_, desktop| {
        let session = desktop.session(window.label())?;
        Ok(Bootstrap {
            document: session.document.clone(),
            draft: session.draft.clone(),
        })
    })
    .await
}

#[tauri::command]
async fn desktop_new_window(window: WebviewWindow) -> Result<()> {
    with_desktop(window.app_handle().clone(), move |app, desktop| {
        desktop.session(window.label())?;
        create_window(app, desktop, None, None, None)
    })
    .await
}

async fn check_session(window: &WebviewWindow) -> Result<()> {
    let label = window.label().to_string();
    with_desktop(window.app_handle().clone(), move |_, desktop| {
        desktop.session(&label).map(|_| ())
    })
    .await
}

#[tauri::command]
async fn desktop_open_window(
    window: WebviewWindow,
    reuse_current: bool,
) -> Result<Option<Document>> {
    check_session(&window).await?;
    let parent = window.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        parent
            .dialog()
            .file()
            .set_parent(&parent)
            .set_title("Open BlackDoc")
            .add_filter("BlackDoc", &["bdoc", "blackdoc"])
            .blocking_pick_file()
    })
    .await
    .map_err(error)?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(error)?;
    with_desktop(window.app_handle().clone(), move |app, desktop| {
        if let Some(document) = desktop.try_reuse_document(window.label(), &path, reuse_current)? {
            let _ = window.set_title(&format!("{} - BlackDoc", document.name));
            return Ok(Some(document));
        }
        open_document(app, desktop, &path)?;
        Ok(None)
    })
    .await
}

#[tauri::command]
async fn desktop_import_markdown(
    window: WebviewWindow,
) -> Result<Option<storage::ImportedMarkdown>> {
    check_session(&window).await?;
    let parent = window.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        parent
            .dialog()
            .file()
            .set_parent(&parent)
            .set_title("Import Markdown")
            .add_filter("Markdown", &["md"])
            .blocking_pick_file()
    })
    .await
    .map_err(error)?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(error)?;
    tauri::async_runtime::spawn_blocking(move || storage::read_markdown(&path))
        .await
        .map_err(error)?
        .map(Some)
}

#[tauri::command]
async fn desktop_detach_document(window: WebviewWindow) -> Result<()> {
    with_desktop(window.app_handle().clone(), move |_, desktop| {
        let session = desktop
            .sessions
            .get_mut(window.label())
            .ok_or("Window closed")?;
        session.path = None;
        session.document = None;
        session.baseline = None;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn desktop_save_document(
    window: WebviewWindow,
    blocks: Value,
    path: Option<String>,
    suggested_name: String,
    save_as: bool,
) -> Result<Option<SavedDocument>> {
    storage::validate_blocks(&blocks)?;
    let label = window.label().to_string();
    let supplied = path.clone();
    let bound = with_desktop(window.app_handle().clone(), move |_, desktop| {
        let session = desktop.session(&label)?;
        storage::authorize_path(session.path.as_deref(), supplied.as_deref())?;
        Ok(session.path.clone())
    })
    .await?;
    let target = if save_as || bound.is_none() {
        let parent = window.clone();
        let selected = tauri::async_runtime::spawn_blocking(move || {
            let mut dialog = parent
                .dialog()
                .file()
                .set_parent(&parent)
                .set_title("Save BlackDoc")
                .add_filter("BlackDoc", &["bdoc", "blackdoc"])
                .set_file_name(storage::suggested_name(&suggested_name, false));
            if let Some(directory) = bound.as_ref().and_then(|path| path.parent()) {
                dialog = dialog.set_directory(directory);
            }
            dialog.blocking_save_file()
        })
        .await
        .map_err(error)?;
        let Some(selected) = selected else {
            return Ok(None);
        };
        storage::save_target(selected.into_path().map_err(error)?, false)?
    } else {
        bound.ok_or("Missing session path")?
    };
    with_desktop(window.app_handle().clone(), move |_, desktop| {
        let session = desktop.session(window.label())?;
        storage::authorize_path(session.path.as_deref(), path.as_deref())?;
        let target = storage::canonical_target(&target)?;
        desktop.check_destination(window.label(), &target)?;
        if session
            .path
            .as_ref()
            .is_some_and(|bound| storage::path_key(bound) == storage::path_key(&target))
        {
            storage::check_baseline(
                &target,
                session
                    .baseline
                    .as_deref()
                    .ok_or("Missing document baseline")?,
            )?;
        }
        let bytes = storage::json_bytes(&blocks)?;
        storage::atomic_write(&target, &bytes)?;
        let saved = SavedDocument {
            path: target.to_string_lossy().into_owned(),
            name: name(&target),
        };
        let session = desktop
            .sessions
            .get_mut(window.label())
            .ok_or("Window closed")?;
        session.path = Some(target);
        session.baseline = Some(bytes);
        session.document = Some(Document {
            path: saved.path.clone(),
            name: saved.name.clone(),
            blocks,
        });
        let _ = window.set_title(&format!("{} - BlackDoc", saved.name));
        Ok(Some(saved))
    })
    .await
}

#[tauri::command]
async fn desktop_write_draft(window: WebviewWindow, blocks: Value) -> Result<()> {
    storage::validate_blocks(&blocks)?;
    with_desktop(window.app_handle().clone(), move |_, desktop| {
        let session = desktop.session(window.label())?;
        let draft = Draft {
            id: session.id.clone(),
            blocks,
            updated_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        };
        storage::write_json(
            &storage::draft_path(&desktop.draft_directory, &draft.id)?,
            &draft,
        )?;
        desktop
            .sessions
            .get_mut(window.label())
            .ok_or("Window closed")?
            .draft = Some(draft);
        Ok(())
    })
    .await
}

#[tauri::command]
async fn desktop_delete_draft(window: WebviewWindow) -> Result<()> {
    with_desktop(window.app_handle().clone(), move |_, desktop| {
        let session = desktop.session(window.label())?;
        storage::delete_draft(&desktop.draft_directory, &session.id)?;
        desktop
            .sessions
            .get_mut(window.label())
            .ok_or("Window closed")?
            .draft = None;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn desktop_export_html(
    window: WebviewWindow,
    html: String,
    suggested_name: String,
) -> Result<Option<SavedDocument>> {
    check_session(&window).await?;
    let parent = window.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        parent
            .dialog()
            .file()
            .set_parent(&parent)
            .set_title("Export HTML")
            .add_filter("HTML", &["html"])
            .set_file_name(storage::suggested_name(&suggested_name, true))
            .blocking_save_file()
    })
    .await
    .map_err(error)?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(error)?;
    with_desktop(window.app_handle().clone(), move |_, desktop| {
        desktop.session(window.label())?;
        let target = storage::save_target(path, true)?;
        if desktop.owner(&target).is_some() {
            return Err("Cannot export over an open document".into());
        }
        storage::atomic_write(&target, html.as_bytes())?;
        desktop
            .sessions
            .get_mut(window.label())
            .ok_or("Window closed")?
            .last_export = Some(target.clone());
        Ok(Some(SavedDocument {
            path: target.to_string_lossy().into_owned(),
            name: name(&target),
        }))
    })
    .await
}

#[tauri::command]
async fn desktop_open_export(window: WebviewWindow) -> Result<()> {
    with_desktop(window.app_handle().clone(), move |app, desktop| {
        let path = desktop
            .session(window.label())?
            .last_export
            .as_ref()
            .ok_or("No exported HTML in this window")?;
        if !path.is_file() {
            return Err("Exported HTML is no longer available".into());
        }
        let current = std::fs::canonicalize(path).map_err(error)?;
        if storage::path_key(&current) != storage::path_key(path) {
            return Err("Exported HTML path has changed".into());
        }
        app.opener()
            .open_path(path.to_string_lossy().into_owned(), None::<&str>)
            .map_err(error)
    })
    .await
}

#[tauri::command]
async fn desktop_close_window(window: WebviewWindow) -> Result<()> {
    with_desktop(window.app_handle().clone(), move |_, desktop| {
        desktop.session(window.label())?;
        window.destroy().map_err(error)?;
        desktop.sessions.remove(window.label());
        Ok(())
    })
    .await
}

#[tauri::command]
async fn desktop_prepare_update(window: WebviewWindow) -> Result<()> {
    with_desktop(window.app_handle().clone(), move |_, desktop| {
        desktop.session(window.label())?;
        if desktop.sessions.len() != 1 {
            return Err("请先关闭其他文档窗口，再安装更新。".into());
        }
        Ok(())
    })
    .await
}

#[tauri::command]
async fn desktop_open_external(window: WebviewWindow, url: String) -> Result<()> {
    let url = storage::external_url(&url)?;
    with_desktop(window.app_handle().clone(), move |app, desktop| {
        desktop.session(window.label())?;
        app.opener().open_url(url, None::<&str>).map_err(error)
    })
    .await
}

pub fn run() {
    tauri::Builder::default()
        .manage(Backend::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let result = with_desktop(app.clone(), move |app, desktop| {
                    if !desktop.ready {
                        desktop.pending_launches.push((args, PathBuf::from(cwd)));
                        return Ok(());
                    }
                    let errors = launch_documents(app, desktop, args, Path::new(&cwd));
                    if desktop.sessions.is_empty() {
                        create_window(app, desktop, None, None, None)?;
                    }
                    if let Some(label) = desktop.sessions.keys().next() {
                        // Individual document opens already focus their own target.
                        if app
                            .webview_windows()
                            .values()
                            .all(|w| !w.is_focused().unwrap_or(false))
                        {
                            let _ = focus(app, label);
                        }
                    }
                    show_errors(app, errors);
                    Ok(())
                })
                .await;
                if let Err(err) = result {
                    show_errors(&app, vec![err]);
                }
            });
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            desktop_bootstrap,
            desktop_new_window,
            desktop_open_window,
            desktop_import_markdown,
            desktop_detach_document,
            desktop_save_document,
            desktop_write_draft,
            desktop_delete_draft,
            desktop_export_html,
            desktop_open_export,
            desktop_close_window,
            desktop_prepare_update,
            desktop_open_external,
        ])
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.emit_to(window.label(), "desktop-close-requested", ());
            }
            tauri::WindowEvent::Destroyed => {
                let app = window.app_handle().clone();
                let label = window.label().to_string();
                tauri::async_runtime::spawn(async move {
                    let _ = with_desktop(app, move |_, desktop| {
                        desktop.sessions.remove(&label);
                        Ok(())
                    })
                    .await;
                });
            }
            _ => {}
        })
        .setup(|app| {
            let directory = app.path().app_data_dir()?.join("drafts");
            std::fs::create_dir_all(&directory)?;
            let args = std::env::args().collect::<Vec<_>>();
            let cwd = std::env::current_dir()?;
            let app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let result = with_desktop(app.clone(), move |app, desktop| {
                    desktop.draft_directory = directory;
                    let mut errors = Vec::new();
                    match storage::read_drafts(&desktop.draft_directory) {
                        Ok((drafts, warnings)) => {
                            errors.extend(warnings);
                            for draft in drafts {
                                if let Err(err) =
                                    create_window(app, desktop, None, Some(draft), None)
                                {
                                    errors.push(err);
                                }
                            }
                        }
                        Err(err) => errors.push(err),
                    }
                    errors.extend(launch_documents(app, desktop, args, &cwd));
                    for (args, cwd) in std::mem::take(&mut desktop.pending_launches) {
                        errors.extend(launch_documents(app, desktop, args, &cwd));
                    }
                    if desktop.sessions.is_empty() {
                        create_window(app, desktop, None, None, None)?;
                    }
                    desktop.ready = true;
                    show_errors(app, errors);
                    Ok(())
                })
                .await;
                if let Err(err) = result {
                    show_errors(&app, vec![err]);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("BlackDoc desktop runtime failed");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_session() -> Session {
        Session {
            id: uuid::Uuid::new_v4().to_string(),
            path: None,
            last_export: None,
            document: None,
            draft: None,
            baseline: None,
        }
    }

    #[test]
    fn reuse_requires_opt_in_and_no_path_document_or_draft() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("example.bdoc");
        let blocks = serde_json::json!([{"type": "paragraph"}]);
        storage::write_json(&path, &blocks).unwrap();
        for flags in 0..16 {
            let mut session = empty_session();
            if flags & 1 != 0 {
                session.path = Some(path.clone());
            }
            if flags & 2 != 0 {
                session.document = Some(Document {
                    path: path.to_string_lossy().into_owned(),
                    name: name(&path),
                    blocks: blocks.clone(),
                });
            }
            if flags & 4 != 0 {
                session.draft = Some(Draft {
                    id: session.id.clone(),
                    blocks: blocks.clone(),
                    updated_at: "2026-09-22T00:00:00Z".into(),
                });
            }
            let before_path = session.path.clone();
            let before_document = serde_json::to_value(&session.document).unwrap();
            let before_draft = serde_json::to_value(&session.draft).unwrap();
            let mut desktop = Desktop::default();
            desktop.sessions.insert("current".into(), session);
            let result = desktop
                .try_reuse_document("current", &path, flags & 8 != 0)
                .unwrap();
            assert_eq!(result.is_some(), flags == 8, "flags: {flags}");
            if flags != 8 {
                let session = desktop.session("current").unwrap();
                assert_eq!(session.path, before_path);
                assert_eq!(
                    serde_json::to_value(&session.document).unwrap(),
                    before_document
                );
                assert_eq!(serde_json::to_value(&session.draft).unwrap(), before_draft);
                assert!(session.baseline.is_none());
            }
        }
    }

    #[test]
    fn reuse_binds_canonical_path_document_and_exact_baseline() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("example.bdoc");
        let bytes = b"[ { \"type\": \"paragraph\", \"content\": \"hello\" } ]\r\n";
        std::fs::write(&path, bytes).unwrap();
        let canonical = storage::canonical_target(&path).unwrap();
        let mut desktop = Desktop::default();
        let session = empty_session();
        let id = session.id.clone();
        desktop.sessions.insert("current".into(), session);

        let document = desktop
            .try_reuse_document("current", &path, true)
            .unwrap()
            .unwrap();

        assert_eq!(desktop.sessions.len(), 1);
        let session = desktop.session("current").unwrap();
        assert_eq!(session.id, id);
        assert_eq!(session.path.as_ref(), Some(&canonical));
        assert_eq!(session.baseline.as_deref(), Some(bytes.as_slice()));
        assert!(session.draft.is_none());
        assert_eq!(document.path, canonical.to_string_lossy());
        assert_eq!(document.name, "example.bdoc");
        assert_eq!(
            document.blocks,
            serde_json::from_slice::<Value>(bytes).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&session.document).unwrap(),
            serde_json::to_value(&document).unwrap()
        );
        assert_eq!(desktop.owner(&canonical), Some("current"));
        assert!(desktop.check_destination("other", &canonical).is_err());
    }

    #[test]
    fn reuse_errors_leave_session_unbound() {
        let directory = tempfile::tempdir().unwrap();
        let mut desktop = Desktop::default();
        let session = empty_session();
        let id = session.id.clone();
        desktop.sessions.insert("current".into(), session);
        for (file, bytes) in [
            ("invalid.bdoc", Some("not json")),
            ("invalid-blocks.bdoc", Some("[]")),
            ("wrong-extension.json", Some("[{\"type\":\"paragraph\"}]")),
            ("missing.bdoc", None),
        ] {
            let path = directory.path().join(file);
            if let Some(bytes) = bytes {
                std::fs::write(&path, bytes).unwrap();
            }
            assert!(desktop.try_reuse_document("current", &path, true).is_err());
            let session = desktop.session("current").unwrap();
            assert_eq!(session.id, id);
            assert!(session.path.is_none());
            assert!(session.document.is_none());
            assert!(session.draft.is_none());
            assert!(session.baseline.is_none());
        }
        assert!(desktop
            .try_reuse_document("closed", &directory.path().join("missing.bdoc"), true)
            .is_err());
        assert_eq!(desktop.sessions.len(), 1);
    }

    #[test]
    fn reuse_defers_owned_path_without_reading_or_binding() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("owned.bdoc");
        std::fs::write(&path, b"invalid json").unwrap();
        let canonical = storage::canonical_target(&path).unwrap();
        let mut desktop = Desktop::default();
        desktop.sessions.insert("current".into(), empty_session());
        let mut owner = empty_session();
        owner.path = Some(canonical.clone());
        desktop.sessions.insert("owner".into(), owner);

        assert!(desktop
            .try_reuse_document("current", &path, true)
            .unwrap()
            .is_none());

        assert_eq!(desktop.owner(&canonical), Some("owner"));
        assert_eq!(desktop.sessions.len(), 2);
        let session = desktop.session("current").unwrap();
        assert!(session.path.is_none());
        assert!(session.document.is_none());
        assert!(session.draft.is_none());
        assert!(session.baseline.is_none());
    }

    #[test]
    fn ownership_rejects_other_windows_and_releases_after_close() {
        let mut desktop = Desktop::default();
        let path = PathBuf::from("example.bdoc");
        desktop.sessions.insert(
            "doc-a".into(),
            Session {
                id: uuid::Uuid::new_v4().to_string(),
                path: Some(path.clone()),
                last_export: None,
                document: None,
                draft: None,
                baseline: None,
            },
        );
        assert!(desktop.check_destination("doc-a", &path).is_ok());
        assert!(desktop.check_destination("doc-b", &path).is_err());
        desktop.sessions.remove("doc-a");
        assert!(desktop.check_destination("doc-b", &path).is_ok());
        assert!(desktop.session("doc-a").is_err());
    }

    #[test]
    fn bootstrap_and_saved_document_have_frontend_shape() {
        let bootstrap = serde_json::to_value(Bootstrap {
            document: None,
            draft: None,
        })
        .unwrap();
        assert_eq!(
            bootstrap,
            serde_json::json!({"document": null, "draft": null})
        );
        let saved = serde_json::to_value(SavedDocument {
            path: "p".into(),
            name: "n".into(),
        })
        .unwrap();
        assert_eq!(saved, serde_json::json!({"path": "p", "name": "n"}));
    }
}
