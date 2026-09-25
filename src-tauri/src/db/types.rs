//! Classification of `PostgreSQL` types for the front end (alignment, editors, formatting).

use serde::Serialize;
use tokio_postgres::types::{Kind, Type};

/// Coarse value category.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ValueKind {
    Boolean,
    Integer,
    Decimal,
    Text,
    Uuid,
    Date,
    Time,
    Timestamp,
    Interval,
    Json,
    Binary,
    Array,
    Enumeration,
    Network,
    Geometric,
    BitString,
    Range,
    Composite,
    Other,
}

impl ValueKind {
    /// Derives the kind from a resolved `tokio-postgres` type.
    pub fn of(ty: &Type) -> Self {
        match ty.kind() {
            Kind::Array(_) => return Self::Array,
            Kind::Enum(_) => return Self::Enumeration,
            Kind::Domain(base) => return Self::of(base),
            Kind::Composite(_) => return Self::Composite,
            Kind::Range(_) | Kind::Multirange(_) => return Self::Range,
            _ => {}
        }
        Self::from_name(ty.name())
    }

    /// Derives the kind from a type name as written by `format_type`.
    pub fn from_name(name: &str) -> Self {
        let base = name
            .trim_end_matches("[]")
            .split('(')
            .next()
            .unwrap_or(name)
            .trim();
        if name.ends_with("[]") {
            return Self::Array;
        }
        match base {
            "bool" | "boolean" => Self::Boolean,
            "int2" | "int4" | "int8" | "smallint" | "integer" | "bigint" | "oid" | "xid"
            | "xid8" | "cid" | "smallserial" | "serial" | "bigserial" | "regclass" | "regtype"
            | "regproc" | "regnamespace" | "regrole" => Self::Integer,
            "float4" | "float8" | "real" | "double precision" | "numeric" | "decimal" | "money" => {
                Self::Decimal
            }
            "uuid" => Self::Uuid,
            "date" => Self::Date,
            "time" | "timetz" | "time without time zone" | "time with time zone" => Self::Time,
            "timestamp"
            | "timestamptz"
            | "timestamp without time zone"
            | "timestamp with time zone" => Self::Timestamp,
            "interval" => Self::Interval,
            "json" | "jsonb" => Self::Json,
            "bytea" => Self::Binary,
            "inet" | "cidr" | "macaddr" | "macaddr8" => Self::Network,
            "point" | "line" | "lseg" | "box" | "path" | "polygon" | "circle" => Self::Geometric,
            "bit" | "varbit" | "bit varying" => Self::BitString,
            "int4range" | "int8range" | "numrange" | "tsrange" | "tstzrange" | "daterange"
            | "int4multirange" | "int8multirange" | "nummultirange" | "tsmultirange"
            | "tstzmultirange" | "datemultirange" => Self::Range,
            "text" | "varchar" | "char" | "bpchar" | "name" | "citext" | "character varying"
            | "character" | "xml" => Self::Text,
            _ => Self::Other,
        }
    }
}

/// Display name of a type as users write it (`text`, `integer[]`, `myschema.status`).
pub fn display_name(ty: &Type) -> String {
    match ty.kind() {
        Kind::Array(element) => format!("{}[]", display_name(element)),
        _ => {
            if ty.schema() == "pg_catalog" || ty.schema() == "public" {
                ty.name().to_string()
            } else {
                format!("{}.{}", ty.schema(), ty.name())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_names() {
        assert_eq!(ValueKind::from_name("integer"), ValueKind::Integer);
        assert_eq!(ValueKind::from_name("numeric(12,2)"), ValueKind::Decimal);
        assert_eq!(
            ValueKind::from_name("character varying(50)"),
            ValueKind::Text
        );
        assert_eq!(
            ValueKind::from_name("timestamp with time zone"),
            ValueKind::Timestamp
        );
        assert_eq!(ValueKind::from_name("text[]"), ValueKind::Array);
        assert_eq!(ValueKind::from_name("jsonb"), ValueKind::Json);
        assert_eq!(ValueKind::from_name("mood"), ValueKind::Other);
    }

    #[test]
    fn classifies_builtin_types() {
        assert_eq!(ValueKind::of(&Type::INT4), ValueKind::Integer);
        assert_eq!(ValueKind::of(&Type::TEXT_ARRAY), ValueKind::Array);
        assert_eq!(ValueKind::of(&Type::TIMESTAMPTZ), ValueKind::Timestamp);
        assert_eq!(display_name(&Type::INT4_ARRAY), "int4[]");
    }
}
