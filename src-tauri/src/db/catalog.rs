//! Catalog introspection: schemas, relations, functions and table structure.

use serde::Serialize;

use crate::db::execute::{execute, QueryResult};
use crate::db::types::ValueKind;
use crate::db::Session;
use crate::error::AppResult;

const SEPARATOR: &str = "\u{1F}";

/// A schema.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchemaInfo {
    pub name: String,
    pub owner: String,
    pub is_system: bool,
}

/// Kind of relation, mirroring `pg_class.relkind`.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RelationKind {
    Table,
    View,
    MaterializedView,
    ForeignTable,
    PartitionedTable,
}

impl RelationKind {
    fn from_relkind(relkind: &str) -> Option<Self> {
        match relkind {
            "r" => Some(Self::Table),
            "v" => Some(Self::View),
            "m" => Some(Self::MaterializedView),
            "f" => Some(Self::ForeignTable),
            "p" => Some(Self::PartitionedTable),
            _ => None,
        }
    }
}

/// A table, view or similar relation.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RelationInfo {
    pub schema: String,
    pub name: String,
    pub kind: RelationKind,
    pub estimated_rows: Option<i64>,
    pub comment: Option<String>,
}

/// A function or procedure.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FunctionInfo {
    pub schema: String,
    pub name: String,
    pub arguments: String,
    pub return_type: String,
    pub language: String,
    pub is_procedure: bool,
}

/// A column of a table.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub ordinal: i32,
    pub type_name: String,
    pub type_oid: u32,
    pub kind: ValueKind,
    pub is_nullable: bool,
    pub default_value: Option<String>,
    pub is_primary_key: bool,
    pub is_identity: bool,
    pub is_generated: bool,
    pub comment: Option<String>,
    pub enum_values: Option<Vec<String>>,
}

/// An index.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfo {
    pub name: String,
    pub definition: String,
    pub is_unique: bool,
    pub is_primary: bool,
    pub columns: Vec<String>,
}

/// A constraint.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintInfo {
    pub name: String,
    pub kind: String,
    pub definition: String,
    pub columns: Vec<String>,
}

/// A foreign key.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub referenced_schema: String,
    pub referenced_table: String,
    pub referenced_columns: Vec<String>,
}

/// A foreign key of another table pointing at this one.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReferencingKey {
    pub name: String,
    /// Schema of the referencing table.
    pub schema: String,
    /// The referencing table.
    pub table: String,
    /// Columns of the referencing table.
    pub columns: Vec<String>,
    /// Columns of this table they point at.
    pub referenced_columns: Vec<String>,
}

/// Everything the UI needs to display and edit a relation.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TableStructure {
    pub schema: String,
    pub name: String,
    pub kind: RelationKind,
    pub comment: Option<String>,
    pub columns: Vec<ColumnInfo>,
    pub indexes: Vec<IndexInfo>,
    pub constraints: Vec<ConstraintInfo>,
    pub foreign_keys: Vec<ForeignKeyInfo>,
    /// Foreign keys of other tables that reference this one.
    pub referenced_by: Vec<ReferencingKey>,
}

/// A column as drawn in the schema diagram.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GraphColumn {
    pub name: String,
    pub type_name: String,
    pub is_primary_key: bool,
    pub is_nullable: bool,
}

/// A table as drawn in the schema diagram.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GraphTable {
    pub name: String,
    pub kind: RelationKind,
    pub estimated_rows: Option<i64>,
    pub columns: Vec<GraphColumn>,
}

/// A foreign key between tables of the diagram (the referenced table may live elsewhere).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GraphForeignKey {
    pub name: String,
    pub table: String,
    pub columns: Vec<String>,
    pub referenced_schema: String,
    pub referenced_table: String,
    pub referenced_columns: Vec<String>,
}

/// Tables of a schema with their columns and foreign keys, for the ER diagram.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchemaGraph {
    pub schema: String,
    pub tables: Vec<GraphTable>,
    pub foreign_keys: Vec<GraphForeignKey>,
}

/// Quotes an identifier for SQL.
pub fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// Quotes a literal for SQL (`standard_conforming_strings` is on).
pub fn quote_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn qualified(schema: &str, name: &str) -> String {
    format!("{}.{}", quote_ident(schema), quote_ident(name))
}

/// Helper to read cells of a text result by column name.
struct Rows<'a>(&'a QueryResult);

impl Rows<'_> {
    fn index(&self, column: &str) -> Option<usize> {
        self.0.columns.iter().position(|c| c.name == column)
    }

    fn text(&self, row: usize, column: &str) -> Option<String> {
        let index = self.index(column)?;
        self.0.rows.get(row)?.get(index)?.clone()
    }

    fn boolean(&self, row: usize, column: &str) -> bool {
        matches!(self.text(row, column).as_deref(), Some("t" | "true"))
    }

    fn list(&self, row: usize, column: &str) -> Vec<String> {
        self.text(row, column)
            .map(|value| value.split(SEPARATOR).map(str::to_string).collect())
            .unwrap_or_default()
    }

    fn len(&self) -> usize {
        self.0.rows.len()
    }
}

/// `string_agg` of the attribute names for an `int2vector` of column numbers of a relation.
fn column_names_sql(numbers: &str, relation: &str) -> String {
    format!(
        "(SELECT string_agg(a.attname, '{SEPARATOR}' ORDER BY k.ord) \
         FROM unnest({numbers}) WITH ORDINALITY AS k(attnum, ord) \
         JOIN pg_attribute a ON a.attrelid = {relation} AND a.attnum = k.attnum)"
    )
}

/// Lists schemas, `public` first, system schemas last.
pub async fn schemas(session: &Session) -> AppResult<Vec<SchemaInfo>> {
    let sql = "SELECT n.nspname AS name, pg_get_userbyid(n.nspowner) AS owner \
               FROM pg_namespace n \
               WHERE n.nspname NOT LIKE 'pg\\_temp%' AND n.nspname NOT LIKE 'pg\\_toast%' \
               ORDER BY (n.nspname = 'public') DESC, \
                        (n.nspname LIKE 'pg\\_%' OR n.nspname = 'information_schema') ASC, n.nspname";
    let result = execute(session, sql, None).await?;
    let rows = Rows(&result);
    Ok((0..rows.len())
        .filter_map(|row| {
            let name = rows.text(row, "name")?;
            let is_system =
                name == "pg_catalog" || name == "information_schema" || name.starts_with("pg_");
            Some(SchemaInfo {
                owner: rows.text(row, "owner").unwrap_or_default(),
                name,
                is_system,
            })
        })
        .collect())
}

/// Lists relations of a schema.
pub async fn relations(session: &Session, schema: &str) -> AppResult<Vec<RelationInfo>> {
    let sql = format!(
        "SELECT c.relname AS name, c.relkind::text AS kind, c.reltuples::bigint AS estimated_rows, \
                obj_description(c.oid, 'pg_class') AS comment \
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
         WHERE n.nspname = {} AND c.relkind IN ('r', 'v', 'm', 'f', 'p') ORDER BY c.relname",
        quote_literal(schema)
    );
    let result = execute(session, &sql, None).await?;
    let rows = Rows(&result);
    Ok((0..rows.len())
        .filter_map(|row| {
            let estimate = rows
                .text(row, "estimated_rows")
                .and_then(|v| v.parse::<i64>().ok());
            Some(RelationInfo {
                schema: schema.to_string(),
                name: rows.text(row, "name")?,
                kind: RelationKind::from_relkind(&rows.text(row, "kind")?)?,
                estimated_rows: estimate.filter(|value| *value >= 0),
                comment: rows.text(row, "comment"),
            })
        })
        .collect())
}

/// Lists functions and procedures of a schema.
pub async fn functions(session: &Session, schema: &str) -> AppResult<Vec<FunctionInfo>> {
    let sql = format!(
        "SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments, \
                pg_get_function_result(p.oid) AS return_type, l.lanname AS language, (p.prokind = 'p') AS is_procedure \
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang \
         WHERE n.nspname = {} AND p.prokind IN ('f', 'p') ORDER BY p.proname, arguments",
        quote_literal(schema)
    );
    let result = execute(session, &sql, None).await?;
    let rows = Rows(&result);
    Ok((0..rows.len())
        .filter_map(|row| {
            Some(FunctionInfo {
                schema: schema.to_string(),
                name: rows.text(row, "name")?,
                arguments: rows.text(row, "arguments").unwrap_or_default(),
                return_type: rows.text(row, "return_type").unwrap_or_default(),
                language: rows.text(row, "language").unwrap_or_default(),
                is_procedure: rows.boolean(row, "is_procedure"),
            })
        })
        .collect())
}

/// Loads the full structure of a relation.
#[allow(clippy::too_many_lines)]
pub async fn structure(session: &Session, schema: &str, name: &str) -> AppResult<TableStructure> {
    let target = quote_literal(&qualified(schema, name));

    let header_sql = format!(
        "SELECT c.relkind::text AS kind, obj_description(c.oid, 'pg_class') AS comment \
         FROM pg_class c WHERE c.oid = {target}::regclass"
    );
    let header = execute(session, &header_sql, None).await?;
    let header_rows = Rows(&header);

    let columns_sql = format!(
        "SELECT a.attname AS name, a.attnum AS ordinal, format_type(a.atttypid, a.atttypmod) AS type_name, \
                a.atttypid AS type_oid, NOT a.attnotnull AS is_nullable, pg_get_expr(d.adbin, d.adrelid) AS default_value, \
                (a.attidentity <> '') AS is_identity, (a.attgenerated <> '') AS is_generated, \
                col_description(a.attrelid, a.attnum) AS comment, \
                EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = a.attrelid AND i.indisprimary \
                        AND a.attnum = ANY (i.indkey)) AS is_primary_key, \
                (SELECT string_agg(e.enumlabel, '{SEPARATOR}' ORDER BY e.enumsortorder) FROM pg_enum e \
                 WHERE e.enumtypid = a.atttypid) AS enum_values \
         FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum \
         WHERE a.attrelid = {target}::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum"
    );
    let columns = execute(session, &columns_sql, None).await?;
    let column_rows = Rows(&columns);

    let indexes_sql = format!(
        "SELECT c.relname AS name, pg_get_indexdef(i.indexrelid) AS definition, i.indisunique AS is_unique, \
                i.indisprimary AS is_primary, \
                (SELECT string_agg(a.attname, '{SEPARATOR}' ORDER BY k.ord) \
                 FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord) \
                 JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS columns \
         FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid \
         WHERE i.indrelid = {target}::regclass ORDER BY i.indisprimary DESC, c.relname"
    );
    let indexes = execute(session, &indexes_sql, None).await?;
    let index_rows = Rows(&indexes);

    let constraints_sql = format!(
        "SELECT con.conname AS name, con.contype::text AS kind, pg_get_constraintdef(con.oid) AS definition, \
                (SELECT string_agg(a.attname, '{SEPARATOR}' ORDER BY k.ord) \
                 FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) \
                 JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS columns, \
                fn.nspname AS ref_schema, fc.relname AS ref_table, \
                (SELECT string_agg(a.attname, '{SEPARATOR}' ORDER BY k.ord) \
                 FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord) \
                 JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum) AS ref_columns \
         FROM pg_constraint con LEFT JOIN pg_class fc ON fc.oid = con.confrelid \
         LEFT JOIN pg_namespace fn ON fn.oid = fc.relnamespace \
         WHERE con.conrelid = {target}::regclass ORDER BY con.contype, con.conname"
    );
    let constraints = execute(session, &constraints_sql, None).await?;
    let constraint_rows = Rows(&constraints);

    let referencing_sql = format!(
        "SELECT con.conname AS name, n.nspname AS schema, c.relname AS table_name, \
                {} AS columns, {} AS ref_columns \
         FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid \
         JOIN pg_namespace n ON n.oid = c.relnamespace \
         WHERE con.contype = 'f' AND con.confrelid = {target}::regclass \
         ORDER BY n.nspname, c.relname, con.conname",
        column_names_sql("con.conkey", "con.conrelid"),
        column_names_sql("con.confkey", "con.confrelid"),
    );
    let referencing = execute(session, &referencing_sql, None).await?;
    let referencing_rows = Rows(&referencing);
    let referenced_by = (0..referencing_rows.len())
        .filter_map(|row| {
            Some(ReferencingKey {
                name: referencing_rows.text(row, "name")?,
                schema: referencing_rows.text(row, "schema")?,
                table: referencing_rows.text(row, "table_name")?,
                columns: referencing_rows.list(row, "columns"),
                referenced_columns: referencing_rows.list(row, "ref_columns"),
            })
        })
        .collect();

    let mut parsed_constraints = Vec::new();
    let mut foreign_keys = Vec::new();
    for row in 0..constraint_rows.len() {
        let Some(name) = constraint_rows.text(row, "name") else {
            continue;
        };
        let kind = match constraint_rows.text(row, "kind").as_deref() {
            Some("p") => "primaryKey",
            Some("f") => "foreignKey",
            Some("u") => "unique",
            Some("c") => "check",
            Some("x") => "exclusion",
            _ => "other",
        };
        let columns = constraint_rows.list(row, "columns");
        if kind == "foreignKey" {
            if let (Some(ref_schema), Some(ref_table)) = (
                constraint_rows.text(row, "ref_schema"),
                constraint_rows.text(row, "ref_table"),
            ) {
                foreign_keys.push(ForeignKeyInfo {
                    name: name.clone(),
                    columns: columns.clone(),
                    referenced_schema: ref_schema,
                    referenced_table: ref_table,
                    referenced_columns: constraint_rows.list(row, "ref_columns"),
                });
            }
        }
        parsed_constraints.push(ConstraintInfo {
            name,
            kind: kind.to_string(),
            definition: constraint_rows.text(row, "definition").unwrap_or_default(),
            columns,
        });
    }

    Ok(TableStructure {
        schema: schema.to_string(),
        name: name.to_string(),
        kind: header_rows
            .text(0, "kind")
            .and_then(|kind| RelationKind::from_relkind(&kind))
            .unwrap_or(RelationKind::Table),
        comment: header_rows.text(0, "comment"),
        columns: (0..column_rows.len())
            .filter_map(|row| {
                let type_name = column_rows.text(row, "type_name").unwrap_or_default();
                Some(ColumnInfo {
                    name: column_rows.text(row, "name")?,
                    ordinal: column_rows
                        .text(row, "ordinal")
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0),
                    kind: if column_rows.text(row, "enum_values").is_some() {
                        ValueKind::Enumeration
                    } else {
                        ValueKind::from_name(&type_name)
                    },
                    type_oid: column_rows
                        .text(row, "type_oid")
                        .and_then(|v| v.parse().ok())
                        .unwrap_or(0),
                    type_name,
                    is_nullable: column_rows.boolean(row, "is_nullable"),
                    default_value: column_rows.text(row, "default_value"),
                    is_primary_key: column_rows.boolean(row, "is_primary_key"),
                    is_identity: column_rows.boolean(row, "is_identity"),
                    is_generated: column_rows.boolean(row, "is_generated"),
                    comment: column_rows.text(row, "comment"),
                    enum_values: column_rows
                        .text(row, "enum_values")
                        .map(|_| column_rows.list(row, "enum_values")),
                })
            })
            .collect(),
        indexes: (0..index_rows.len())
            .filter_map(|row| {
                Some(IndexInfo {
                    name: index_rows.text(row, "name")?,
                    definition: index_rows.text(row, "definition").unwrap_or_default(),
                    is_unique: index_rows.boolean(row, "is_unique"),
                    is_primary: index_rows.boolean(row, "is_primary"),
                    columns: index_rows.list(row, "columns"),
                })
            })
            .collect(),
        constraints: parsed_constraints,
        foreign_keys,
        referenced_by,
    })
}

/// Loads the tables of a schema with their columns and foreign keys.
pub async fn schema_graph(session: &Session, schema: &str) -> AppResult<SchemaGraph> {
    let schema_literal = quote_literal(schema);
    let tables_sql = format!(
        "SELECT c.relname AS table_name, c.relkind::text AS kind, c.reltuples::bigint AS estimated_rows, \
                a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type_name, \
                NOT a.attnotnull AS is_nullable, \
                EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid = c.oid AND i.indisprimary \
                        AND a.attnum = ANY (i.indkey)) AS is_primary_key \
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace \
         LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped \
         WHERE n.nspname = {schema_literal} AND c.relkind IN ('r', 'p', 'f') AND NOT c.relispartition \
         ORDER BY c.relname, a.attnum"
    );
    let tables_result = execute(session, &tables_sql, None).await?;
    let rows = Rows(&tables_result);
    let mut tables: Vec<GraphTable> = Vec::new();
    for row in 0..rows.len() {
        let Some(name) = rows.text(row, "table_name") else {
            continue;
        };
        if tables.last().is_none_or(|table| table.name != name) {
            let Some(kind) = rows
                .text(row, "kind")
                .and_then(|kind| RelationKind::from_relkind(&kind))
            else {
                continue;
            };
            tables.push(GraphTable {
                name: name.clone(),
                kind,
                estimated_rows: rows
                    .text(row, "estimated_rows")
                    .and_then(|v| v.parse::<i64>().ok())
                    .filter(|value| *value >= 0),
                columns: Vec::new(),
            });
        }
        if let (Some(table), Some(column)) = (tables.last_mut(), rows.text(row, "column_name")) {
            table.columns.push(GraphColumn {
                name: column,
                type_name: rows.text(row, "type_name").unwrap_or_default(),
                is_primary_key: rows.boolean(row, "is_primary_key"),
                is_nullable: rows.boolean(row, "is_nullable"),
            });
        }
    }

    let keys_sql = format!(
        "SELECT con.conname AS name, c.relname AS table_name, fn.nspname AS ref_schema, \
                fc.relname AS ref_table, {} AS columns, {} AS ref_columns \
         FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid \
         JOIN pg_namespace n ON n.oid = c.relnamespace \
         JOIN pg_class fc ON fc.oid = con.confrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace \
         WHERE con.contype = 'f' AND n.nspname = {schema_literal} AND NOT c.relispartition \
         ORDER BY c.relname, con.conname",
        column_names_sql("con.conkey", "con.conrelid"),
        column_names_sql("con.confkey", "con.confrelid"),
    );
    let keys_result = execute(session, &keys_sql, None).await?;
    let key_rows = Rows(&keys_result);
    let foreign_keys = (0..key_rows.len())
        .filter_map(|row| {
            Some(GraphForeignKey {
                name: key_rows.text(row, "name")?,
                table: key_rows.text(row, "table_name")?,
                columns: key_rows.list(row, "columns"),
                referenced_schema: key_rows.text(row, "ref_schema")?,
                referenced_table: key_rows.text(row, "ref_table")?,
                referenced_columns: key_rows.list(row, "ref_columns"),
            })
        })
        .collect();

    Ok(SchemaGraph {
        schema: schema.to_string(),
        tables,
        foreign_keys,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quoting() {
        assert_eq!(quote_ident("we\"ird"), "\"we\"\"ird\"");
        assert_eq!(quote_literal("it's"), "'it''s'");
        assert_eq!(qualified("public", "users"), "\"public\".\"users\"");
    }
}
