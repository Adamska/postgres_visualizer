//! Error type shared by every command. Serialised to the front end as a plain object so the UI
//! can show the server's message, detail, hint and error position.

use serde::Serialize;

/// Coarse category used by the UI to pick an icon and a recovery path.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    /// Could not reach or handshake with the server.
    Connection,
    /// The server rejected the credentials.
    Authentication,
    /// The server reported an error while running a statement.
    Server,
    /// Local storage or keychain failure.
    Storage,
    /// The request was cancelled.
    Cancelled,
    /// Anything else.
    Internal,
}

/// Structured error returned by every command.
#[derive(Debug, Clone, Serialize, thiserror::Error)]
#[serde(rename_all = "camelCase")]
#[error("{message}")]
pub struct AppError {
    /// Category of the failure.
    pub kind: ErrorKind,
    /// Human readable message.
    pub message: String,
    /// Optional secondary detail from the server.
    pub detail: Option<String>,
    /// Optional hint from the server.
    pub hint: Option<String>,
    /// SQLSTATE code, when the server reported one.
    pub sql_state: Option<String>,
    /// 1-based character offset into the statement, when the server reported one.
    pub position: Option<u32>,
}

impl AppError {
    /// Builds an error of the given kind with only a message.
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            detail: None,
            hint: None,
            sql_state: None,
            position: None,
        }
    }

    /// Shorthand for an internal error.
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Internal, message)
    }

    /// Shorthand for a storage error.
    pub fn storage(message: impl Into<String>) -> Self {
        Self::new(ErrorKind::Storage, message)
    }
}

impl From<tokio_postgres::Error> for AppError {
    fn from(error: tokio_postgres::Error) -> Self {
        if let Some(db_error) = error.as_db_error() {
            let sql_state = db_error.code().code().to_string();
            let kind = if sql_state.starts_with("28") {
                ErrorKind::Authentication
            } else {
                ErrorKind::Server
            };
            let position = match db_error.position() {
                Some(tokio_postgres::error::ErrorPosition::Original(offset)) => Some(*offset),
                _ => None,
            };
            return Self {
                kind,
                message: db_error.message().to_string(),
                detail: db_error.detail().map(str::to_string),
                hint: db_error.hint().map(str::to_string),
                sql_state: Some(sql_state),
                position,
            };
        }
        if error.is_closed() {
            return Self::new(ErrorKind::Connection, "The connection was closed.");
        }
        let text = error.to_string();
        let detail = std::error::Error::source(&error).map(ToString::to_string);
        let message = if text == "error connecting to server" {
            "Could not connect to the server.".to_string()
        } else {
            text
        };
        Self {
            kind: ErrorKind::Connection,
            message,
            detail,
            hint: None,
            sql_state: None,
            position: None,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(error: std::io::Error) -> Self {
        Self::storage(error.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        Self::storage(format!("Invalid JSON: {error}"))
    }
}

impl From<keyring::Error> for AppError {
    fn from(error: keyring::Error) -> Self {
        Self::storage(format!("Keychain: {error}"))
    }
}

impl From<native_tls::Error> for AppError {
    fn from(error: native_tls::Error) -> Self {
        Self::new(ErrorKind::Connection, format!("TLS: {error}"))
    }
}

/// Result alias used by commands.
pub type AppResult<T> = Result<T, AppError>;
