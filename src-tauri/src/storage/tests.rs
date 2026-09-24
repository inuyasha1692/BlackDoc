use super::*;
use serde_json::json;

fn blocks() -> Value {
    json!([{"type": "paragraph", "props": {}, "content": [], "children": []}])
}

#[test]
fn validates_recursive_block_arrays_without_restricting_future_block_types() {
    assert!(validate_blocks(&blocks()).is_ok());
    assert!(
        validate_blocks(&json!([{"type": "custom", "children": [{"type": "paragraph"}]}])).is_ok()
    );
    for invalid in [
        json!([]),
        json!({"blocks": blocks()}),
        json!([null]),
        json!([{"type": 3}]),
        json!([{"type": "paragraph", "props": []}]),
        json!([{"type": "paragraph", "children": [null]}]),
    ] {
        assert!(validate_blocks(&invalid).is_err(), "{invalid}");
    }
}

#[test]
fn atomic_write_replaces_existing_file_and_leaves_no_temporary_files() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("document.bdoc");
    atomic_write(&path, b"previous").unwrap();
    write_json(&path, &blocks()).unwrap();
    assert_eq!(read_document(&path).unwrap().0, blocks());
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    let folder = directory.path().join("folder");
    fs::create_dir(&folder).unwrap();
    assert!(atomic_write(&folder, b"cannot replace a directory").is_err());
    assert!(folder.is_dir());
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 2);
}

#[test]
fn external_edits_and_deletion_fail_baseline_check() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("document.bdoc");
    write_json(&path, &blocks()).unwrap();
    let (_, baseline) = read_document(&path).unwrap();
    check_baseline(&path, &baseline).unwrap();
    atomic_write(&path, b"external edit").unwrap();
    assert!(check_baseline(&path, &baseline).is_err());
    assert_eq!(fs::read(&path).unwrap(), b"external edit");
    fs::remove_file(&path).unwrap();
    assert!(check_baseline(&path, &baseline).is_err());
}

#[cfg(windows)]
#[test]
fn atomic_write_retries_temporary_windows_file_lock() {
    use std::os::windows::fs::OpenOptionsExt;
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("locked.bdoc");
    fs::write(&path, b"original").unwrap();
    let handle = fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .unwrap();
    let release = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(80));
        drop(handle);
    });
    let result = atomic_write(&path, b"replacement");
    release.join().unwrap();
    result.unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"replacement");
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
}

#[cfg(windows)]
#[test]
fn atomic_write_preserves_windows_locked_and_readonly_files() {
    use std::os::windows::fs::OpenOptionsExt;
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("protected.bdoc");
    fs::write(&path, b"original").unwrap();
    let handle = fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .unwrap();
    let failure = atomic_write(&path, b"replacement").unwrap_err();
    assert_eq!(fs::read(&path).unwrap(), b"original");
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    drop(handle);
    assert!(
        failure.contains("original file was not replaced"),
        "{failure}"
    );
    let permissions = fs::metadata(&path).unwrap().permissions();
    let mut readonly = permissions.clone();
    readonly.set_readonly(true);
    fs::set_permissions(&path, readonly).unwrap();
    let result = atomic_write(&path, b"replacement");
    let still_readonly = fs::metadata(&path).unwrap().permissions().readonly();
    fs::set_permissions(&path, permissions).unwrap();
    let failure = result.unwrap_err();
    assert!(failure.contains("read-only"), "{failure}");
    assert!(still_readonly);
    assert_eq!(fs::read(&path).unwrap(), b"original");
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
}

#[test]
fn session_paths_cannot_authorize_arbitrary_files() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("a.bdoc");
    let other = directory.path().join("b.bdoc");
    write_json(&path, &blocks()).unwrap();
    let bound = canonical_target(&path).unwrap();
    assert!(authorize_path(Some(&bound), path.to_str()).is_ok());
    assert!(authorize_path(Some(&bound), other.to_str()).is_err());
    assert!(authorize_path(None, path.to_str()).is_err());
    assert!(authorize_path(Some(&bound), None).is_err());
    assert!(authorize_path(None, None).is_ok());
    assert!(canonical_target(Path::new("relative.bdoc")).is_err());
    assert!(canonical_target(directory.path()).is_err());
    assert_eq!(
        canonical_target(&other).unwrap().parent(),
        Some(bound.parent().unwrap())
    );
}

#[cfg(windows)]
#[test]
fn canonical_windows_paths_are_case_insensitive() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("MixedCase.bdoc");
    write_json(&path, &blocks()).unwrap();
    let bound = canonical_target(&path).unwrap();
    let upper = path.to_string_lossy().to_uppercase();
    assert!(authorize_path(Some(&bound), Some(&upper)).is_ok());
    assert_eq!(
        path_key(&bound),
        path_key(&PathBuf::from(bound.to_string_lossy().to_uppercase()))
    );
}

#[test]
fn default_extension_and_opening_are_supported() {
    let directory = tempfile::tempdir().unwrap();
    let path = save_target(directory.path().join("new"), false).unwrap();
    assert_eq!(path.extension().unwrap(), "bdoc");
    for filename in ["a.bdoc", "a.BDOC"] {
        let path = directory.path().join(filename);
        write_json(&path, &blocks()).unwrap();
        assert!(read_document(&path).is_ok());
        assert!(save_target(path, false).is_ok());
    }
    for filename in ["legacy.blackdoc", "legacy.BLACKDOC"] {
        let path = directory.path().join(filename);
        write_json(&path, &blocks()).unwrap();
        assert!(read_document(&path).is_err());
        assert!(save_target(path, false).is_err());
    }
    assert!(save_target(directory.path().join("a.json"), false).is_err());
    assert!(save_target(directory.path().join("a.bdoc"), true).is_err());

    assert_eq!(suggested_name("New.bdoc", false), "New.bdoc");
    assert_eq!(suggested_name("Title.bdoc", true), "Title.html");
    assert_eq!(suggested_name("CON", false), "_CON.bdoc");
    assert_eq!(suggested_name(" ../a:b ", false), "_a_b.bdoc");
}

#[test]
fn drafts_are_independent_idempotent_and_invalid_files_are_preserved() {
    let directory = tempfile::tempdir().unwrap();
    let first = Draft {
        id: uuid::Uuid::new_v4().to_string(),
        blocks: blocks(),
        updated_at: "2026-09-22T00:00:00.000Z".into(),
    };
    let second = Draft {
        id: uuid::Uuid::new_v4().to_string(),
        blocks: json!([{"type": "heading"}]),
        updated_at: "2026-09-22T01:00:00.000Z".into(),
    };
    for draft in [&first, &second] {
        write_json(&draft_path(directory.path(), &draft.id).unwrap(), draft).unwrap();
    }
    let invalid = directory.path().join("invalid.json");
    atomic_write(&invalid, b"bad json").unwrap();
    for _ in 0..2 {
        let (recovered, errors) = read_drafts(directory.path()).unwrap();
        assert_eq!(recovered.len(), 2);
        assert_eq!(recovered[0].id, first.id);
        assert_eq!(recovered[1].blocks, second.blocks);
        assert_eq!(errors.len(), 1);
        assert!(invalid.exists());
    }
    delete_draft(directory.path(), &first.id).unwrap();
    delete_draft(directory.path(), &first.id).unwrap();
    assert!(draft_path(directory.path(), &second.id).unwrap().exists());
    assert!(draft_path(directory.path(), "../../escape").is_err());
    let value = serde_json::to_value(&second).unwrap();
    assert_eq!(value["updatedAt"], second.updated_at);
    assert!(value.get("updated_at").is_none());
}

#[test]
fn draft_cannot_impersonate_another_draft_id() {
    let directory = tempfile::tempdir().unwrap();
    let draft = Draft {
        id: uuid::Uuid::new_v4().to_string(),
        blocks: blocks(),
        updated_at: "2026-09-22T00:00:00Z".into(),
    };
    let other = uuid::Uuid::new_v4().to_string();
    write_json(&draft_path(directory.path(), &other).unwrap(), &draft).unwrap();
    let (drafts, errors) = read_drafts(directory.path()).unwrap();
    assert!(drafts.is_empty());
    assert_eq!(errors.len(), 1);
    assert!(draft_path(directory.path(), &other).unwrap().exists());
}

#[test]
fn external_links_are_scheme_restricted() {
    for url in [
        "https://example.com/a?q=b",
        "http://localhost:8080",
        "mailto:user@example.com",
    ] {
        assert!(external_url(url).is_ok());
    }
    for url in [
        "file:///C:/secret",
        "javascript:alert(1)",
        "data:text/html,x",
        "ms-settings:",
        "C:\\app.exe",
        "https://a\nb",
        "mailto:",
    ] {
        assert!(external_url(url).is_err(), "{url}");
    }
}

#[test]
fn argv_resolves_relative_documents_from_launch_directory() {
    let directory = tempfile::tempdir().unwrap();
    let args = [
        "blackdoc.exe",
        "new.bdoc",
        "a.bdoc",
        "b.bdoc",
        "--flag",
        "unrelated.json",
    ]
    .into_iter()
    .map(str::to_string);
    assert_eq!(
        argv_documents(args, directory.path()),
        vec![
            directory.path().join("new.bdoc"),
            directory.path().join("a.bdoc"),
            directory.path().join("b.bdoc")
        ]
    );
}

#[test]
fn markdown_import_embeds_local_images_and_video_without_changing_sources() {
    let directory = tempfile::tempdir().unwrap();
    let assets = directory.path().join("assets");
    fs::create_dir(&assets).unwrap();
    let image = assets.join("map.png");
    let video = directory.path().join("demo.mp4");
    fs::write(&image, b"png-data").unwrap();
    fs::write(&video, b"video-data").unwrap();
    let markdown_path = directory.path().join("map.md");
    let original = "| 图 | 说明 |\n| --- | --- |\n| <img src=\"./assets/map.png\" /> | ![map](./assets/map.png) |\n[视频](demo.mp4)\n";
    fs::write(&markdown_path, original).unwrap();

    let imported = read_markdown(&markdown_path).unwrap();
    assert_eq!(imported.name, "map.md");
    assert_eq!(
        imported.markdown.matches("data:image/png;base64,").count(),
        2
    );
    assert!(imported.markdown.contains("data:video/mp4;base64,"));
    assert!(imported.warnings.is_empty());
    assert_eq!(fs::read_to_string(&markdown_path).unwrap(), original);
    assert_eq!(fs::read(&image).unwrap(), b"png-data");
    assert_eq!(fs::read(&video).unwrap(), b"video-data");
}

#[test]
fn markdown_import_rejects_missing_resources_and_other_extensions() {
    let directory = tempfile::tempdir().unwrap();
    let markdown_path = directory.path().join("map.md");
    fs::write(&markdown_path, "![map](./assets/missing.png)").unwrap();
    assert!(read_markdown(&markdown_path)
        .unwrap_err()
        .contains("missing.png"));
    let other_path = directory.path().join("map.txt");
    fs::write(&other_path, "# Map").unwrap();
    assert!(read_markdown(&other_path).is_err());
}

#[test]
fn provided_markdown_sample_embeds_every_local_asset_when_available() {
    let Ok(path) = std::env::var("BLACKDOC_IMPORT_SAMPLE") else {
        return;
    };
    let imported = read_markdown(Path::new(&path)).unwrap();
    assert_eq!(imported.markdown.matches("data:image/").count(), 118);
    assert_eq!(
        imported.markdown.matches("data:video/mp4;base64,").count(),
        1
    );
    assert!(!imported.markdown.contains("./assets/"));
}
