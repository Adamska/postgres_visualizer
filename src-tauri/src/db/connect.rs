//! Opening connections from a profile.

use serde::{Deserialize, Serialize};
use tokio_postgres::config::SslMode as PgSslMode;

use crate::db::Session;
use crate::error::{AppError, AppResult, ErrorKind};

/// TLS behaviour, mirroring libpq's `sslmode` values that the app supports.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SslMode {
    /// Plain TCP.
    Disable,
    /// TLS without certificate verification.
    Require,
    /// TLS with certificate and host name verification.
    VerifyFull,
}

/// Connection parameters sent by the front end. The password travels separately.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionParams {
    /// Host name or IP.
    pub host: String,
    /// TCP port.
    pub port: u16,
    /// Database name.
    pub database: String,
    /// Role name.
    pub username: String,
    /// Password, if any.
    pub password: Option<String>,
    /// TLS mode.
    pub ssl_mode: SslMode,
}

impl ConnectionParams {
    fn config(&self) -> tokio_postgres::Config {
        let mut config = tokio_postgres::Config::new();
        config
            .host(&self.host)
            .port(self.port)
            .dbname(&self.database)
            .user(&self.username)
            .application_name("Table++")
            .connect_timeout(std::time::Duration::from_secs(15))
            .ssl_mode(match self.ssl_mode {
                SslMode::Disable => PgSslMode::Disable,
                SslMode::Require | SslMode::VerifyFull => PgSslMode::Require,
            });
        if let Some(password) = &self.password {
            config.password(password);
        }
        config
    }

    /// Opens a connection and spawns the task that drives it.
    pub async fn connect(&self) -> AppResult<Session> {
        if self.host.trim().is_empty() {
            return Err(AppError::new(ErrorKind::Connection, "Host is required."));
        }
        let config = self.config();
        let (client, driver) = match self.ssl_mode {
            SslMode::Disable => {
                let (client, connection) = config.connect(tokio_postgres::NoTls).await?;
                let driver = tokio::spawn(async move {
                    if let Err(error) = connection.await {
                        eprintln!("connection closed: {error}");
                    }
                });
                (client, driver)
            }
            SslMode::Require | SslMode::VerifyFull => {
                let mut builder = native_tls::TlsConnector::builder();
                if self.ssl_mode == SslMode::Require {
                    builder.danger_accept_invalid_certs(true);
                    builder.danger_accept_invalid_hostnames(true);
                }
                let connector = postgres_native_tls::MakeTlsConnector::new(builder.build()?);
                let (client, connection) = config.connect(connector).await?;
                let driver = tokio::spawn(async move {
                    if let Err(error) = connection.await {
                        eprintln!("connection closed: {error}");
                    }
                });
                (client, driver)
            }
        };
        Ok(Session {
            client,
            gate: tokio::sync::Mutex::new(()),
            driver,
        })
    }
}
