//! End-to-end tests against the docker database (`TABLEPP_TEST_DATABASE_URL`).

use tableplusplus_lib::db::catalog;
use tableplusplus_lib::db::connect::{ConnectionParams, SslMode};
use tableplusplus_lib::db::execute::{execute, execute_transaction};
use tableplusplus_lib::db::types::ValueKind;
use tableplusplus_lib::db::Session;
use tableplusplus_lib::error::ErrorKind;

fn params() -> Option<ConnectionParams> {
    let url = std::env::var("TABLEPP_TEST_DATABASE_URL").ok()?;
    let parsed = url::Url::parse(&url).ok()?;
    Some(ConnectionParams {
        host: parsed.host_str().unwrap_or("localhost").to_string(),
        port: parsed.port().unwrap_or(5432),
        database: parsed.path().trim_start_matches('/').to_string(),
        username: parsed.username().to_string(),
        password: parsed.password().map(str::to_string),
        ssl_mode: SslMode::Disable,
    })
}

async fn session() -> Option<Session> {
    let params = params()?;
    Some(params.connect().await.expect("connect"))
}

#[tokio::test]
async fn executes_queries_with_types_and_limits() {
    let Some(session) = session().await else {
        return;
    };
    let result = execute(
        &session,
        "SELECT id, email, balance, tags, created_at FROM customers ORDER BY id",
        Some(2),
    )
    .await
    .unwrap();
    assert_eq!(result.rows.len(), 2);
    assert!(result.truncated);
    assert_eq!(
        result.columns.iter().map(|c| c.kind).collect::<Vec<_>>(),
        vec![
            ValueKind::Integer,
            ValueKind::Text,
            ValueKind::Decimal,
            ValueKind::Array,
            ValueKind::Timestamp
        ]
    );
    assert_eq!(result.columns[3].type_name, "text[]");
    assert_eq!(result.rows[0][1].as_deref(), Some("ann@example.com"));
    assert_eq!(
        result.rows[0][3].as_deref(),
        Some("{vip,\"early adopter\"}")
    );

    let booleans = execute(
        &session,
        "SELECT true AS t, false AS f, NULL::bool AS n",
        None,
    )
    .await
    .unwrap();
    assert_eq!(booleans.columns[0].kind, ValueKind::Boolean);
    assert_eq!(
        booleans.rows[0],
        vec![Some("true".to_string()), Some("false".to_string()), None]
    );

    // The connection is still usable after an early stop.
    let next = execute(&session, "SELECT 1 AS one", None).await.unwrap();
    assert_eq!(next.rows, vec![vec![Some("1".to_string())]]);
    assert!(!next.truncated);
}

#[tokio::test]
async fn empty_results_keep_their_columns() {
    let Some(session) = session().await else {
        return;
    };
    let result = execute(
        &session,
        "SELECT id, email FROM customers WHERE false",
        None,
    )
    .await
    .unwrap();
    assert!(result.rows.is_empty());
    assert_eq!(
        result
            .columns
            .iter()
            .map(|c| c.name.as_str())
            .collect::<Vec<_>>(),
        vec!["id", "email"]
    );
}

#[tokio::test]
async fn reports_affected_rows_and_errors() {
    let Some(session) = session().await else {
        return;
    };
    execute(
        &session,
        "CREATE TEMP TABLE scratch (id int PRIMARY KEY, name text)",
        None,
    )
    .await
    .unwrap();
    let insert = execute(
        &session,
        "INSERT INTO scratch VALUES (1, 'a'), (2, 'b') RETURNING id",
        None,
    )
    .await
    .unwrap();
    assert_eq!(insert.affected_rows, Some(2));
    assert_eq!(insert.rows.len(), 2);
    let update = execute(&session, "UPDATE scratch SET name = 'z' WHERE id > 5", None)
        .await
        .unwrap();
    assert_eq!(update.affected_rows, Some(0));

    let error = execute(&session, "SELECT * FROM nowhere", None)
        .await
        .unwrap_err();
    assert_eq!(error.kind, ErrorKind::Server);
    assert_eq!(error.sql_state.as_deref(), Some("42P01"));
    assert_eq!(error.position, Some(15));

    let recovered = execute(&session, "SELECT count(*) FROM scratch", None)
        .await
        .unwrap();
    assert_eq!(recovered.rows[0][0].as_deref(), Some("2"));
}

#[tokio::test]
async fn transactions_roll_back() {
    let Some(session) = session().await else {
        return;
    };
    execute(&session, "CREATE TEMP TABLE tx (id int PRIMARY KEY)", None)
        .await
        .unwrap();
    let failed = execute_transaction(
        &session,
        &[
            "INSERT INTO tx VALUES (1)".into(),
            "INSERT INTO tx VALUES (1)".into(),
        ],
    )
    .await;
    assert!(failed.is_err());
    let count = execute(&session, "SELECT count(*) FROM tx", None)
        .await
        .unwrap();
    assert_eq!(count.rows[0][0].as_deref(), Some("0"));

    // An error raised while planning (here a bad literal) reports its own cause, not the
    // "transaction is aborted" that follows it.
    let Err(planning) = execute_transaction(
        &session,
        &[
            "INSERT INTO tx VALUES (1)".into(),
            "UPDATE tx SET id = '' WHERE id = 1".into(),
        ],
    )
    .await
    else {
        panic!("expected a failure")
    };
    assert_eq!(planning.sql_state.as_deref(), Some("22P02"));
    assert!(planning.message.contains("invalid input syntax"));
    let count = execute(&session, "SELECT count(*) FROM tx", None)
        .await
        .unwrap();
    assert_eq!(count.rows[0][0].as_deref(), Some("0"));
    // Several commands in one string cannot be prepared but still run.
    let several = execute(&session, "SELECT 1; SELECT 2", None).await.unwrap();
    assert_eq!(several.rows.len(), 2);
    let ok = execute_transaction(
        &session,
        &[
            "INSERT INTO tx VALUES (1)".into(),
            "INSERT INTO tx VALUES (2)".into(),
        ],
    )
    .await
    .unwrap();
    assert_eq!(
        ok.iter().map(|r| r.affected_rows).collect::<Vec<_>>(),
        vec![Some(1), Some(1)]
    );
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn introspects_the_catalog() {
    let Some(session) = session().await else {
        return;
    };
    let schemas = catalog::schemas(&session).await.unwrap();
    assert_eq!(schemas[0].name, "public");
    assert!(schemas.iter().any(|s| s.name == "analytics"));
    assert!(schemas
        .iter()
        .any(|s| s.name == "pg_catalog" && s.is_system));

    let relations = catalog::relations(&session, "public").await.unwrap();
    let names: Vec<&str> = relations.iter().map(|r| r.name.as_str()).collect();
    assert_eq!(
        names,
        vec![
            "active_customers",
            "audit_log",
            "customer_totals",
            "customers",
            "order_items",
            "orders"
        ]
    );
    assert_eq!(
        relations
            .iter()
            .find(|r| r.name == "customers")
            .unwrap()
            .comment
            .as_deref(),
        Some("People who buy things")
    );

    let functions = catalog::functions(&session, "public").await.unwrap();
    assert!(functions
        .iter()
        .any(|f| f.name == "customer_count" && f.return_type == "bigint" && !f.is_procedure));
    assert!(functions
        .iter()
        .any(|f| f.name == "archive_orders" && f.is_procedure));

    let customers = catalog::structure(&session, "public", "customers")
        .await
        .unwrap();
    assert_eq!(customers.comment.as_deref(), Some("People who buy things"));
    let id = customers.columns.iter().find(|c| c.name == "id").unwrap();
    assert!(id.is_primary_key && id.is_identity && !id.is_nullable);
    let mood = customers.columns.iter().find(|c| c.name == "mood").unwrap();
    assert_eq!(mood.kind, ValueKind::Enumeration);
    assert_eq!(
        mood.enum_values.as_deref(),
        Some(&["sad".to_string(), "ok".to_string(), "happy".to_string()][..])
    );
    assert_eq!(mood.default_value.as_deref(), Some("'ok'::mood"));
    assert!(
        customers
            .columns
            .iter()
            .find(|c| c.name == "search_name")
            .unwrap()
            .is_generated
    );
    assert_eq!(
        customers
            .columns
            .iter()
            .find(|c| c.name == "tags")
            .unwrap()
            .kind,
        ValueKind::Array
    );
    assert_eq!(
        customers
            .columns
            .iter()
            .find(|c| c.name == "preferences")
            .unwrap()
            .kind,
        ValueKind::Json
    );
    assert!(customers
        .indexes
        .iter()
        .any(|i| i.is_primary && i.columns == ["id"]));

    let orders = catalog::structure(&session, "public", "orders")
        .await
        .unwrap();
    assert_eq!(orders.foreign_keys.len(), 1);
    assert_eq!(orders.foreign_keys[0].referenced_table, "customers");
    assert_eq!(orders.foreign_keys[0].columns, vec!["customer_id"]);
    assert!(orders
        .indexes
        .iter()
        .any(|i| i.name == "orders_customer_idx" && i.columns == ["customer_id", "placed_at"]));

    let items = catalog::structure(&session, "public", "order_items")
        .await
        .unwrap();
    let keys: Vec<&str> = items
        .columns
        .iter()
        .filter(|c| c.is_primary_key)
        .map(|c| c.name.as_str())
        .collect();
    assert_eq!(keys, vec!["order_id", "line"]);

    let view = catalog::structure(&session, "public", "active_customers")
        .await
        .unwrap();
    assert_eq!(view.kind, catalog::RelationKind::View);
}

#[tokio::test]
async fn rejects_bad_credentials() {
    let Some(mut params) = params() else { return };
    params.password = Some("wrong".to_string());
    let Err(error) = params.connect().await else {
        panic!("expected a failure")
    };
    assert_eq!(error.kind, ErrorKind::Authentication);
}
