//! Statement execution. Column types come from a `prepare` round trip (so even empty results
//! have headers) and values come from the simple query protocol, which returns every value in
//! `PostgreSQL`'s canonical text form and needs no per-type decoding.

use std::time::Instant;

use futures_util::StreamExt;
use serde::Serialize;
use tokio_postgres::SimpleQueryMessage;

use crate::db::types::{display_name, ValueKind};
use crate::db::Session;
use crate::error::AppResult;

/// One column of a result set.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResultColumn {
    /// Column name (may repeat within a result).
    pub name: String,
    /// Type OID, 0 when unknown.
    pub type_oid: u32,
    /// Type name as users write it.
    pub type_name: String,
    /// Coarse category.
    pub kind: ValueKind,
}

/// Outcome of one statement.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    /// Columns, empty for statements without a result set.
    pub columns: Vec<ResultColumn>,
    /// Rows as text; `None` is SQL NULL.
    pub rows: Vec<Vec<Option<String>>>,
    /// Rows affected, for data modification statements.
    pub affected_rows: Option<u64>,
    /// Wall clock time in milliseconds.
    pub duration_ms: f64,
    /// True when the row limit stopped the fetch early.
    pub truncated: bool,
}

/// Leading keyword of a statement, lowercased, ignoring comments and parentheses.
pub fn leading_keyword(sql: &str) -> String {
    let mut rest = sql.trim_start();
    loop {
        if let Some(after) = rest.strip_prefix("--") {
            rest = after
                .split_once('\n')
                .map_or("", |(_, tail)| tail)
                .trim_start();
        } else if let Some(after) = rest.strip_prefix("/*") {
            rest = after
                .split_once("*/")
                .map_or("", |(_, tail)| tail)
                .trim_start();
        } else if let Some(after) = rest.strip_prefix('(') {
            rest = after.trim_start();
        } else {
            break;
        }
    }
    rest.chars()
        .take_while(|c| c.is_ascii_alphabetic() || *c == '_')
        .collect::<String>()
        .to_ascii_lowercase()
}

/// Whether the statement changes data, so its affected row count is meaningful.
pub fn is_data_modification(sql: &str) -> bool {
    matches!(
        leading_keyword(sql).as_str(),
        "insert" | "update" | "delete" | "merge"
    )
}

/// Runs one statement on the session. `row_limit` of `None` fetches everything.
pub async fn execute(
    session: &Session,
    sql: &str,
    row_limit: Option<usize>,
) -> AppResult<QueryResult> {
    let _gate = session.gate.lock().await;
    let start = Instant::now();

    // Column types via the extended protocol; ignored on failure so odd statements still run.
    let typed_columns: Option<Vec<ResultColumn>> = match session.client.prepare(sql).await {
        Ok(statement) => Some(
            statement
                .columns()
                .iter()
                .map(|column| ResultColumn {
                    name: column.name().to_string(),
                    type_oid: column.type_().oid(),
                    type_name: display_name(column.type_()),
                    kind: ValueKind::of(column.type_()),
                })
                .collect(),
        ),
        Err(_) => None,
    };

    let stream = session.client.simple_query_raw(sql).await?;
    futures_util::pin_mut!(stream);

    let mut columns: Vec<ResultColumn> = Vec::new();
    let mut rows: Vec<Vec<Option<String>>> = Vec::new();
    let mut affected: Option<u64> = None;
    let mut truncated = false;

    while let Some(message) = stream.next().await {
        match message? {
            SimpleQueryMessage::RowDescription(description) => {
                columns = description
                    .iter()
                    .enumerate()
                    .map(|(index, column)| {
                        typed_columns
                            .as_ref()
                            .and_then(|typed| typed.get(index))
                            .filter(|typed| typed.name == column.name())
                            .cloned()
                            .unwrap_or_else(|| ResultColumn {
                                name: column.name().to_string(),
                                type_oid: 0,
                                type_name: String::new(),
                                kind: ValueKind::Other,
                            })
                    })
                    .collect();
            }
            SimpleQueryMessage::Row(row) => {
                if row_limit.is_some_and(|limit| rows.len() >= limit) {
                    truncated = true;
                    // Dropping the stream discards the remaining rows.
                    break;
                }
                rows.push(
                    (0..row.len())
                        .map(|index| row.get(index).map(str::to_string))
                        .collect(),
                );
            }
            SimpleQueryMessage::CommandComplete(count) => {
                if is_data_modification(sql) {
                    affected = Some(count);
                }
            }
            _ => {}
        }
    }

    if columns.is_empty() {
        if let Some(typed) = typed_columns {
            columns = typed;
        }
    }

    Ok(QueryResult {
        columns,
        rows,
        affected_rows: affected,
        duration_ms: start.elapsed().as_secs_f64() * 1000.0,
        truncated,
    })
}

/// Runs statements inside one transaction, rolling back on the first failure.
pub async fn execute_transaction(
    session: &Session,
    statements: &[String],
) -> AppResult<Vec<QueryResult>> {
    execute(session, "BEGIN", None).await?;
    let mut results = Vec::with_capacity(statements.len());
    for statement in statements {
        match execute(session, statement, None).await {
            Ok(result) => results.push(result),
            Err(error) => {
                let _ = execute(session, "ROLLBACK", None).await;
                return Err(error);
            }
        }
    }
    execute(session, "COMMIT", None).await?;
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leading_keyword_skips_comments_and_parentheses() {
        assert_eq!(leading_keyword("  -- hi\n  /* x */ (SELECT 1)"), "select");
        assert_eq!(leading_keyword("Insert into t values (1)"), "insert");
        assert_eq!(leading_keyword(""), "");
    }

    #[test]
    fn classifies_modifications() {
        assert!(is_data_modification("update t set a = 1"));
        assert!(is_data_modification("/* c */ DELETE FROM t"));
        assert!(!is_data_modification("select 1"));
        assert!(!is_data_modification("create table t (a int)"));
    }
}
