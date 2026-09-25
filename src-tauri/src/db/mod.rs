//! Database sessions: one `tokio-postgres` connection per session, kept in a registry keyed by
//! an opaque id handed to the front end.

pub mod catalog;
pub mod connect;
pub mod execute;
pub mod types;

use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;
use tokio_postgres::Client;

use crate::error::{AppError, AppResult, ErrorKind};

/// A live connection plus a lock that serialises statements on it.
pub struct Session {
    /// The connection.
    pub client: Client,
    /// Serialises statements so results never interleave.
    pub gate: Mutex<()>,
    /// Task driving the socket; aborted when the session closes.
    pub driver: tokio::task::JoinHandle<()>,
}

impl Session {
    /// Whether the server still answers on this session. Cheap when the socket is already
    /// closed; otherwise a `SELECT 1` bounded by a short timeout, run outside the gate so a
    /// long statement does not make the check wait.
    pub async fn ping(&self) -> bool {
        if self.client.is_closed() {
            return false;
        }
        let probe = self.client.simple_query("SELECT 1");
        matches!(
            tokio::time::timeout(std::time::Duration::from_secs(5), probe).await,
            Ok(Ok(_))
        )
    }

    /// Cancels the statement currently running on this session, if any.
    pub async fn cancel(&self) -> AppResult<()> {
        let token = self.client.cancel_token();
        token.cancel_query(tokio_postgres::NoTls).await?;
        Ok(())
    }
}

/// All open sessions, shared through Tauri managed state.
#[derive(Default)]
pub struct SessionRegistry {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

impl SessionRegistry {
    /// Stores a session and returns its id.
    pub async fn insert(&self, session: Session) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        self.sessions
            .lock()
            .await
            .insert(id.clone(), Arc::new(session));
        id
    }

    /// Looks a session up by id.
    pub async fn get(&self, id: &str) -> AppResult<Arc<Session>> {
        self.sessions
            .lock()
            .await
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::new(ErrorKind::Connection, "The session is closed."))
    }

    /// Removes and closes a session.
    pub async fn remove(&self, id: &str) {
        if let Some(session) = self.sessions.lock().await.remove(id) {
            session.driver.abort();
        }
    }

    /// Number of open sessions, for diagnostics.
    pub async fn count(&self) -> usize {
        self.sessions.lock().await.len()
    }
}
