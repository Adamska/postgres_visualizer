//! Local persistence: JSON documents in the app data directory and passwords in the keychain.

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

const KEYCHAIN_SERVICE: &str = "io.tableplusplus.app";

/// Directory holding the app's JSON documents.
pub fn data_directory() -> AppResult<PathBuf> {
    let base =
        dirs::data_dir().ok_or_else(|| AppError::storage("No application data directory"))?;
    Ok(base.join("Table++"))
}

/// Validates a document name so callers cannot escape the data directory.
fn document_path(directory: &Path, name: &str) -> AppResult<PathBuf> {
    let valid = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !valid {
        return Err(AppError::storage(format!("Invalid document name: {name}")));
    }
    Ok(directory.join(format!("{name}.json")))
}

/// Reads a JSON document, returning `None` when it does not exist yet.
pub fn read_document(directory: &Path, name: &str) -> AppResult<Option<serde_json::Value>> {
    let path = document_path(directory, name)?;
    match std::fs::read(&path) {
        Ok(bytes) => Ok(Some(serde_json::from_slice(&bytes)?)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// Writes a JSON document atomically.
pub fn write_document(directory: &Path, name: &str, value: &serde_json::Value) -> AppResult<()> {
    let path = document_path(directory, name)?;
    std::fs::create_dir_all(directory)?;
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, serde_json::to_vec_pretty(value)?)?;
    std::fs::rename(&temporary, &path)?;
    Ok(())
}

/// Reads a password from the keychain.
pub fn read_password(profile_id: &str) -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, profile_id)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

/// Stores or removes a password.
pub fn write_password(profile_id: &str, password: Option<&str>) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, profile_id)?;
    match password {
        Some(password) if !password.is_empty() => entry.set_password(password)?,
        _ => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(error.into()),
        },
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn documents_round_trip() {
        let directory = tempfile::tempdir().unwrap();
        assert_eq!(read_document(directory.path(), "profiles").unwrap(), None);
        let value = serde_json::json!({ "a": [1, 2, 3] });
        write_document(directory.path(), "profiles", &value).unwrap();
        assert_eq!(
            read_document(directory.path(), "profiles").unwrap(),
            Some(value)
        );
        assert!(read_document(directory.path(), "../etc").is_err());
        assert!(write_document(directory.path(), "", &serde_json::Value::Null).is_err());
    }
}
