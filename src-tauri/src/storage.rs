use base64::Engine;
use regex::{Captures, Regex};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;

pub type Result<T> = std::result::Result<T, String>;

pub fn error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

pub fn validate_blocks(value: &Value) -> Result<()> {
    fn block(value: &Value, depth: usize) -> bool {
        if depth > 128 {
            return false;
        }
        let Some(object) = value.as_object() else {
            return false;
        };
        object.get("type").is_some_and(Value::is_string)
            && object.get("props").map_or(true, Value::is_object)
            && object.get("children").map_or(true, |children| {
                children
                    .as_array()
                    .is_some_and(|items| items.iter().all(|item| block(item, depth + 1)))
            })
    }
    if value
        .as_array()
        .is_some_and(|items| !items.is_empty() && items.iter().all(|item| block(item, 0)))
    {
        Ok(())
    } else {
        Err(
            "Expected a non-empty BlockNote block array with valid types, props and children"
                .into(),
        )
    }
}

pub fn is_document_path(path: &Path) -> bool {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    name.ends_with(".bdoc") || name.ends_with(".blackdoc")
}

pub fn read_document(path: &Path) -> Result<(Value, Vec<u8>)> {
    if !is_document_path(path) {
        return Err("Expected .bdoc or .blackdoc".into());
    }
    let bytes = fs::read(path).map_err(error)?;
    let value = serde_json::from_slice(&bytes).map_err(error)?;
    validate_blocks(&value)?;
    Ok((value, bytes))
}

#[derive(Debug, Serialize)]
pub struct ImportedMarkdown {
    pub name: String,
    pub markdown: String,
    pub warnings: Vec<String>,
}

fn asset_mime(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "avif" => Some("image/avif"),
        "mp4" => Some("video/mp4"),
        _ => None,
    }
}

fn embed_asset(
    source: &Path,
    reference: &str,
    cache: &mut HashMap<String, String>,
    warnings: &mut Vec<String>,
) -> String {
    if reference.starts_with("data:")
        || reference.starts_with("http://")
        || reference.starts_with("https://")
    {
        return reference.into();
    }
    if let Some(cached) = cache.get(reference) {
        return cached.clone();
    }
    let path = Path::new(reference);
    let path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        source.parent().unwrap_or(Path::new("")).join(path)
    };
    let result: Result<String> = (|| {
        let path = fs::canonicalize(&path).map_err(error)?;
        if !path.is_file() {
            return Err("Not a regular file".into());
        }
        let mime = asset_mime(&path).ok_or("Unsupported asset type")?;
        let bytes = fs::read(&path).map_err(error)?;
        Ok(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    })();
    match result {
        Ok(data_url) => {
            cache.insert(reference.into(), data_url.clone());
            data_url
        }
        Err(reason) => {
            warnings.push(format!("Could not embed {reference}: {reason}"));
            reference.into()
        }
    }
}

pub fn read_markdown(path: &Path) -> Result<ImportedMarkdown> {
    let path = canonical_target(path)?;
    if !path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Err("Expected a .md file".into());
    }
    let source = fs::read_to_string(&path).map_err(error)?;
    let mut warnings = Vec::new();
    let mut cache = HashMap::new();
    let markdown_image = Regex::new(r#"!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)"#).map_err(error)?;
    let html_image =
        Regex::new(r#"(?i)<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["'][^>]*>"#).map_err(error)?;
    let local_video = Regex::new(r#"(\[[^\]]+\]\()([^)\s]+\.mp4)(\))"#).map_err(error)?;

    let source = markdown_image.replace_all(&source, |captures: &Captures| {
        let url = captures.get(1).unwrap();
        let embedded = embed_asset(&path, url.as_str(), &mut cache, &mut warnings);
        captures[0].replacen(url.as_str(), &embedded, 1)
    });
    let source = html_image.replace_all(&source, |captures: &Captures| {
        let url = captures.get(1).unwrap();
        let embedded = embed_asset(&path, url.as_str(), &mut cache, &mut warnings);
        captures[0].replacen(url.as_str(), &embedded, 1)
    });
    let markdown = local_video
        .replace_all(&source, |captures: &Captures| {
            let embedded = embed_asset(&path, &captures[2], &mut cache, &mut warnings);
            format!("{}{}{}", &captures[1], embedded, &captures[3])
        })
        .into_owned();
    if !warnings.is_empty() {
        return Err(format!(
            "Markdown resources could not be embedded: {}",
            warnings.join("; ")
        ));
    }
    Ok(ImportedMarkdown {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        markdown,
        warnings,
    })
}

pub fn check_baseline(path: &Path, baseline: &[u8]) -> Result<()> {
    let current = fs::read(path)
        .map_err(|err| format!("Document changed or became unavailable; use Save As: {err}"))?;
    if current != baseline {
        Err("Document was modified outside BlackDoc; use Save As to preserve both versions".into())
    } else {
        Ok(())
    }
}

// Resolve the parent for new files as well, so symlinked directories cannot bypass ownership.
pub fn canonical_target(path: &Path) -> Result<PathBuf> {
    if !path.is_absolute() {
        return Err("Expected an absolute file path".into());
    }
    match fs::canonicalize(path) {
        Ok(path) if path.is_file() => Ok(path),
        Ok(_) => Err("Expected a regular file".into()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            let parent = path.parent().ok_or("Missing parent directory")?;
            let name = path.file_name().ok_or("Missing file name")?;
            Ok(fs::canonicalize(parent).map_err(error)?.join(name))
        }
        Err(err) => Err(error(err)),
    }
}

pub fn path_key(path: &Path) -> String {
    let key = path.to_string_lossy().into_owned();
    if cfg!(windows) {
        key.to_lowercase()
    } else {
        key
    }
}

pub fn authorize_path(bound: Option<&Path>, supplied: Option<&str>) -> Result<()> {
    match (bound, supplied) {
        (None, None) => Ok(()),
        (Some(bound), Some(supplied)) => {
            let actual = canonical_target(Path::new(supplied))?;
            if path_key(bound) == path_key(&actual) {
                Ok(())
            } else {
                Err("The supplied path does not belong to this window".into())
            }
        }
        _ => Err("The supplied path does not match this window session".into()),
    }
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or("Missing parent directory")?;
    let mut temporary = NamedTempFile::new_in(parent).map_err(error)?;
    temporary.write_all(bytes).map_err(error)?;
    temporary.as_file().sync_all().map_err(error)?;
    let mut retry_delays = [25, 50, 100, 200].into_iter();
    loop {
        // Retry the same flushed file; never delete or truncate the destination.
        match temporary.persist(path) {
            Ok(_) => return Ok(()),
            Err(failure) => {
                let readonly = fs::metadata(path)
                    .map(|metadata| metadata.permissions().readonly())
                    .unwrap_or(false);
                let transient =
                    cfg!(windows) && matches!(failure.error.raw_os_error(), Some(5 | 32 | 33));
                if transient && !readonly && !path.is_dir() {
                    if let Some(delay) = retry_delays.next() {
                        temporary = failure.file;
                        std::thread::sleep(std::time::Duration::from_millis(delay));
                        continue;
                    }
                }
                let advice = if readonly {
                    "The target is read-only; choose Save As or check its permissions."
                } else {
                    "Close applications holding the file, check folder permissions, or use Save As."
                };
                return Err(format!(
                    "Could not atomically save '{}'; the original file was not replaced. {advice} {failure}",
                    path.display()
                ));
            }
        }
    }
}

pub fn write_json(path: &Path, value: &impl Serialize) -> Result<()> {
    atomic_write(path, &json_bytes(value)?)
}

pub fn json_bytes(value: &impl Serialize) -> Result<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(value).map_err(error)?;
    bytes.push(b'\n');
    Ok(bytes)
}

pub fn suggested_name(input: &str, html: bool) -> String {
    let mut stem = input.trim().to_string();
    for suffix in [".blackdoc", ".bdoc", ".html"] {
        if stem.to_lowercase().ends_with(suffix) {
            stem.truncate(stem.len() - suffix.len());
            break;
        }
    }
    let stem: String = stem
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(120)
        .collect();
    let stem = stem.trim_matches([' ', '.']);
    let mut stem = if stem.is_empty() {
        "Untitled".into()
    } else {
        stem.to_string()
    };
    let base = stem.split('.').next().unwrap_or_default().to_uppercase();
    if ["CON", "PRN", "AUX", "NUL"].contains(&base.as_str())
        || (base.len() == 4
            && (base.starts_with("COM") || base.starts_with("LPT"))
            && matches!(base.as_bytes()[3], b'1'..=b'9'))
    {
        stem.insert(0, '_');
    }
    format!("{stem}{}", if html { ".html" } else { ".bdoc" })
}

pub fn save_target(mut path: PathBuf, html: bool) -> Result<PathBuf> {
    if path.extension().is_none() {
        path.set_extension(if html { "html" } else { "bdoc" });
    }
    if html {
        if !path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("html"))
        {
            return Err("HTML export requires the .html extension".into());
        }
    } else if !is_document_path(&path) {
        return Err("Save using .bdoc or .blackdoc".into());
    }
    canonical_target(&path)
}

pub fn external_url(input: &str) -> Result<String> {
    if input.chars().any(char::is_control) {
        return Err("Invalid URL".into());
    }
    let url = url::Url::parse(input).map_err(error)?;
    match url.scheme() {
        "http" | "https" if url.host_str().is_some() => Ok(url.into()),
        "mailto" if !url.path().is_empty() => Ok(url.into()),
        _ => Err("Only http, https and mailto URLs are allowed".into()),
    }
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub id: String,
    pub blocks: Value,
    pub updated_at: String,
}

pub fn draft_path(directory: &Path, id: &str) -> Result<PathBuf> {
    let parsed = uuid::Uuid::parse_str(id).map_err(error)?;
    if parsed.to_string() != id {
        return Err("Invalid draft ID".into());
    }
    Ok(directory.join(format!("{id}.json")))
}

pub fn read_drafts(directory: &Path) -> Result<(Vec<Draft>, Vec<String>)> {
    let mut drafts = Vec::new();
    let mut errors = Vec::new();
    for entry in fs::read_dir(directory).map_err(error)? {
        let entry = entry.map_err(error)?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let result: Result<Draft> = (|| {
            if !entry.file_type().map_err(error)?.is_file() {
                return Err("Not a regular draft file".into());
            }
            let draft: Draft =
                serde_json::from_slice(&fs::read(&path).map_err(error)?).map_err(error)?;
            if draft_path(directory, &draft.id)? != path {
                return Err("Draft ID does not match its filename".into());
            }
            validate_blocks(&draft.blocks)?;
            chrono::DateTime::parse_from_rfc3339(&draft.updated_at).map_err(error)?;
            Ok(draft)
        })();
        match result {
            Ok(draft) => drafts.push(draft),
            Err(err) => errors.push(format!("{}: {err}", path.display())),
        }
    }
    drafts.sort_by(|a, b| a.updated_at.cmp(&b.updated_at).then(a.id.cmp(&b.id)));
    Ok((drafts, errors))
}

pub fn delete_draft(directory: &Path, id: &str) -> Result<()> {
    match fs::remove_file(draft_path(directory, id)?) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(error(err)),
    }
}

pub fn argv_documents(args: impl IntoIterator<Item = String>, cwd: &Path) -> Vec<PathBuf> {
    args.into_iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .map(PathBuf::from)
        .filter(|path| is_document_path(path))
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            }
        })
        .collect()
}

#[cfg(test)]
mod tests;
