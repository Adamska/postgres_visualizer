# Table++

A native macOS client for PostgreSQL: browse, query and edit tables with a clean, Compass-inspired
interface. Several connections can be open at once, and each table or query lives in its own tab.

## Requirements

- macOS 26 or later, Xcode 27 (Swift 6)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) and [SwiftLint](https://github.com/realm/SwiftLint): `brew install xcodegen swiftlint`
- Docker, for the integration tests and a sample database

## Getting started

```sh
make project   # generate TablePlusPlus.xcodeproj from project.yml
make run       # build and launch Table++
```

Or open the generated project in Xcode and run the `TablePlusPlus` scheme.

A sample database with a few tables lives in `docker-compose.yml`:

```sh
make db-up     # postgres://tablepp:tablepp@localhost:54329/tablepp
```

## Features

- Connections: saved profiles with colour and group, passwords in the keychain, TLS modes
  (disabled, required, verify-full), import from `postgres://` URLs, connection test.
- Sidebar: schemas, tables, views, materialized views and functions with instant filtering.
- Table tabs: paginated rows, sort by header, visual filter builder plus raw `WHERE`, column hiding,
  row inspector, follow foreign keys, export to CSV / JSON / SQL.
- Editing: inline cell edits, NULL / DEFAULT, add, duplicate and delete rows. Changes are staged and
  written in one transaction after a SQL preview. Tables without a primary key are read-only.
- Query tabs: syntax highlighting, completion for tables, columns and keywords, run the statement
  under the caret or the whole script, multiple result sets, EXPLAIN / EXPLAIN ANALYZE, history,
  saved queries, one session per tab so manual transactions stay isolated.
- Import: CSV into a table with column mapping, or run a `.sql` file.
- Workspace: open connections and tabs are restored at launch; light and dark mode.

## Architecture

```
Packages/TableKit/          Swift package, no UI, fully unit tested
  TableCore                 models, SQL tokenizer/splitter, query builder, staged change sets,
                            CSV/JSON/SQL exchange
  TablePostgres             PostgresNIO session, binary wire-format decoder, catalog introspection
  TableStorage              JSON stores, keychain passwords, history, workspace snapshots
App/                        SwiftUI app (XcodeGen target)
  Model/                    @Observable models: AppModel, ConnectionModel, tab models
  Views/Grid/               AppKit data grid (NSTableView) with cell focus and inline editing
  Views/Query/Editor/       AppKit SQL editor (NSTextView) with highlighting and completion
AppTests/                   model and component tests (Swift Testing)
```

The app depends on the package through the `DatabaseDriver` / `DatabaseSession` protocols, so the
models are tested with an in-memory mock driver. The Postgres driver decodes every value from the
binary wire format into PostgreSQL's canonical text representation; the integration tests verify
this against the server's own `::text` output for every column of the sample database.

## Development

```sh
make build             # build with warnings as errors
make test              # package unit tests + app tests
make test-integration  # package tests against the docker database
make lint              # swiftlint --strict
```

Rendered snapshots of the main screens can be produced without a display for visual review:

```sh
TEST_RUNNER_TABLEPP_SNAPSHOT_DIR=/tmp/snaps xcodebuild -project TablePlusPlus.xcodeproj \
  -scheme TablePlusPlus -derivedDataPath build/DerivedData test -only-testing:TablePlusPlusTests/SnapshotTests
```

## Roadmap

- SSH tunnels
- Schema editing (columns, indexes, constraints)
- Editing query results that map to a single table
