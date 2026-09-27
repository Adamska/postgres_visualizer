//! Tauri commands: the whole surface used by the front end.
//!
//! Command arguments are owned values by Tauri's design.
#![allow(clippy::needless_pass_by_value)]

use tauri::State;

use crate::db::catalog::{
    self, FunctionInfo, RelationInfo, SchemaGraph, SchemaInfo, TableStructure,
};
use crate::db::connect::ConnectionParams;
use crate::db::execute::{self, QueryResult};
use crate::db::SessionRegistry;
use crate::error::AppResult;
use crate::storage::{self, PasswordStorage};

/// Opens a session and returns its id.
#[tauri::command]
pub async fn connect(
    registry: State<'_, SessionRegistry>,
    params: ConnectionParams,
) -> AppResult<String> {
    let session = params.connect().await?;
    Ok(registry.insert(session).await)
}

/// Opens a connection, reads the server version and closes it.
#[tauri::command]
pub async fn test_connection(params: ConnectionParams) -> AppResult<String> {
    let session = params.connect().await?;
    let result = execute::execute(&session, "SHOW server_version", Some(1)).await?;
    session.driver.abort();
    Ok(result
        .rows
        .first()
        .and_then(|row| row.first())
        .and_then(Clone::clone)
        .unwrap_or_default())
}

/// Closes a session.
#[tauri::command]
pub async fn disconnect(registry: State<'_, SessionRegistry>, session_id: String) -> AppResult<()> {
    registry.remove(&session_id).await;
    Ok(())
}

/// Reports the server version of a session.
#[tauri::command]
pub async fn server_version(
    registry: State<'_, SessionRegistry>,
    session_id: String,
) -> AppResult<String> {
    let session = registry.get(&session_id).await?;
    let result = execute::execute(&session, "SHOW server_version", Some(1)).await?;
    Ok(result
        .rows
        .first()
        .and_then(|row| row.first())
        .and_then(Clone::clone)
        .unwrap_or_default())
}

/// Runs one statement.
#[tauri::command]
pub async fn execute_sql(
    registry: State<'_, SessionRegistry>,
    session_id: String,
    sql: String,
    row_limit: Option<usize>,
) -> AppResult<QueryResult> {
    let session = registry.get(&session_id).await?;
    execute::execute(&session, &sql, row_limit).await
}

/// Runs statements in one transaction.
#[tauri::command]
pub async fn execute_transaction(
    registry: State<'_, SessionRegistry>,
    session_id: String,
    statements: Vec<String>,
) -> AppResult<Vec<QueryResult>> {
    let session = registry.get(&session_id).await?;
    execute::execute_transaction(&session, &statements).await
}

/// Whether a session still answers; `false` for unknown sessions too.
#[tauri::command]
pub async fn ping(registry: State<'_, SessionRegistry>, session_id: String) -> AppResult<bool> {
    match registry.get(&session_id).await {
        Ok(session) => Ok(session.ping().await),
        Err(_) => Ok(false),
    }
}

/// Cancels the running statement of a session.
#[tauri::command]
pub async fn cancel_query(
    registry: State<'_, SessionRegistry>,
    session_id: String,
) -> AppResult<()> {
    let session = registry.get(&session_id).await?;
    session.cancel().await
}

/// Lists schemas.
#[tauri::command]
pub async fn list_schemas(
    registry: State<'_, SessionRegistry>,
    session_id: String,
) -> AppResult<Vec<SchemaInfo>> {
    let session = registry.get(&session_id).await?;
    catalog::schemas(&session).await
}

/// Lists relations of a schema.
#[tauri::command]
pub async fn list_relations(
    registry: State<'_, SessionRegistry>,
    session_id: String,
    schema: String,
) -> AppResult<Vec<RelationInfo>> {
    let session = registry.get(&session_id).await?;
    catalog::relations(&session, &schema).await
}

/// Lists functions of a schema.
#[tauri::command]
pub async fn list_functions(
    registry: State<'_, SessionRegistry>,
    session_id: String,
    schema: String,
) -> AppResult<Vec<FunctionInfo>> {
    let session = registry.get(&session_id).await?;
    catalog::functions(&session, &schema).await
}

/// Loads the structure of a relation.
#[tauri::command]
pub async fn table_structure(
    registry: State<'_, SessionRegistry>,
    session_id: String,
    schema: String,
    name: String,
) -> AppResult<TableStructure> {
    let session = registry.get(&session_id).await?;
    catalog::structure(&session, &schema, &name).await
}

/// Loads the tables and foreign keys of a schema for the ER diagram.
#[tauri::command]
pub async fn schema_graph(
    registry: State<'_, SessionRegistry>,
    session_id: String,
    schema: String,
) -> AppResult<SchemaGraph> {
    let session = registry.get(&session_id).await?;
    catalog::schema_graph(&session, &schema).await
}

/// Reads a JSON document from the app data directory.
#[tauri::command]
pub fn load_document(name: String) -> AppResult<Option<serde_json::Value>> {
    storage::read_document(&storage::data_directory()?, &name)
}

/// Writes a JSON document to the app data directory.
#[tauri::command]
pub fn save_document(name: String, value: serde_json::Value) -> AppResult<()> {
    storage::write_document(&storage::data_directory()?, &name, &value)
}

/// Reads a profile password from the selected store.
#[tauri::command]
pub fn get_password(profile_id: String, storage: PasswordStorage) -> AppResult<Option<String>> {
    storage::read_password(&storage::data_directory()?, storage, &profile_id)
}

/// Stores (or removes, when empty) a profile password in the selected store.
#[tauri::command]
pub fn set_password(
    profile_id: String,
    password: Option<String>,
    storage: PasswordStorage,
) -> AppResult<()> {
    storage::write_password(
        &storage::data_directory()?,
        storage,
        &profile_id,
        password.as_deref(),
    )
}
