//! Local persistence: JSON documents in the app data directory and passwords in the keychain
//! or, when the user prefers no keychain prompts, in a file of the data directory.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use crate::error::{AppError, AppResult};

const KEYCHAIN_SERVICE: &str = "io.tableplusplus.app";
/// Document holding passwords when the file store is selected.
const SECRETS_DOCUMENT: &str = "secrets";

/// Where profile passwords live.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PasswordStorage {
    /// The macOS keychain (prompts until the app is trusted).
    Keychain,
    /// `secrets.json` in the data directory, readable only by the current user.
    File,
}

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

/// Reads a password from the selected store.
pub fn read_password(
    directory: &Path,
    storage: PasswordStorage,
    profile_id: &str,
) -> AppResult<Option<String>> {
    match storage {
        PasswordStorage::Keychain => read_keychain_password(profile_id),
        PasswordStorage::File => read_file_password(directory, profile_id),
    }
}

/// Stores (or removes, when empty) a password in the selected store.
pub fn write_password(
    directory: &Path,
    storage: PasswordStorage,
    profile_id: &str,
    password: Option<&str>,
) -> AppResult<()> {
    let password = password.filter(|p| !p.is_empty());
    match storage {
        PasswordStorage::Keychain => write_keychain_password(profile_id, password),
        PasswordStorage::File => write_file_password(directory, profile_id, password),
    }
}

fn read_keychain_password(profile_id: &str) -> AppResult<Option<String>> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, profile_id)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn write_keychain_password(profile_id: &str, password: Option<&str>) -> AppResult<()> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, profile_id)?;
    match password {
        Some(password) => entry.set_password(password)?,
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => {}
            Err(error) => return Err(error.into()),
        },
    }
    Ok(())
}

fn read_file_password(directory: &Path, profile_id: &str) -> AppResult<Option<String>> {
    let secrets = read_document(directory, SECRETS_DOCUMENT)?;
    Ok(secrets
        .as_ref()
        .and_then(|value| value.get(profile_id))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string))
}

fn write_file_password(
    directory: &Path,
    profile_id: &str,
    password: Option<&str>,
) -> AppResult<()> {
    let mut secrets = read_document(directory, SECRETS_DOCUMENT)?
        .and_then(|value| match value {
            serde_json::Value::Object(map) => Some(map),
            _ => None,
        })
        .unwrap_or_default();
    match password {
        Some(password) => {
            secrets.insert(
                profile_id.to_string(),
                serde_json::Value::String(password.to_string()),
            );
        }
        None => {
            secrets.remove(profile_id);
        }
    }
    write_document(
        directory,
        SECRETS_DOCUMENT,
        &serde_json::Value::Object(secrets),
    )?;
    restrict_permissions(&document_path(directory, SECRETS_DOCUMENT)?)
}

/// Makes a file readable and writable by its owner only.
#[cfg(unix)]
fn restrict_permissions(path: &Path) -> AppResult<()> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    Ok(())
}

#[cfg(not(unix))]
fn restrict_permissions(_path: &Path) -> AppResult<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_passwords_round_trip_and_stay_private() {
        let directory = tempfile::tempdir().unwrap();
        let storage = PasswordStorage::File;
        assert_eq!(read_password(directory.path(), storage, "a").unwrap(), None);
        write_password(directory.path(), storage, "a", Some("s3cret")).unwrap();
        write_password(directory.path(), storage, "b", Some("other")).unwrap();
        assert_eq!(
            read_password(directory.path(), storage, "a")
                .unwrap()
                .as_deref(),
            Some("s3cret")
        );
        write_password(directory.path(), storage, "a", Some("")).unwrap();
        assert_eq!(read_password(directory.path(), storage, "a").unwrap(), None);
        assert_eq!(
            read_password(directory.path(), storage, "b")
                .unwrap()
                .as_deref(),
            Some("other")
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(directory.path().join("secrets.json"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }

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
