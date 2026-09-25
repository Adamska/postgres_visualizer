# Table++

A polished PostgreSQL client for macOS. Browse, query and edit tables in a clean, keyboard-friendly
interface inspired by MongoDB Compass. Several connections can be open at once, and every table or
query lives in its own tab.

Built with **Tauri 2** (Rust backend, native WKWebView) and **React 19 + TypeScript**. The app is
about 12 MB and uses a fraction of the memory of an Electron equivalent.

## Requirements

- macOS 13 or later
- Node 22 with pnpm, Rust stable (1.85+), Xcode command line tools
- Docker, for the sample database and the backend integration tests

## Getting started

```sh
make setup      # pnpm install
make db-up      # sample database at postgres://tablepp:tablepp@localhost:54329/tablepp
make dev        # run the app with hot reload
make build      # produce src-tauri/target/release/bundle/macos/Table++.app
```

The front end can also run in a plain browser against an in-memory mock backend, which is handy for
UI work: `pnpm dev` then open http://localhost:1420 (add `?empty` for the welcome screen).

## Features

- **Connections**: saved profiles with colour and group, passwords in the macOS keychain, TLS modes
  (disabled, required, verify-full), import from `postgresql://` URLs, connection test.
- **Sidebar**: schemas, tables, views and functions with instant filtering; several connections open
  side by side.
- **Table tabs**: paginated rows, sort by header, visual filter builder plus raw `WHERE`, column
  hiding, row inspector, follow foreign keys, export to CSV / JSON / SQL.
- **Editing**: inline cell edits, NULL / DEFAULT, enum pickers, add, duplicate and delete rows.
  Changes are staged and written in one transaction after a SQL preview. Tables without a primary
  key are read-only.
- **Query tabs**: CodeMirror editor with PostgreSQL highlighting, schema-aware completion, run the
  statement under the caret or the whole script, multiple result sets, EXPLAIN / EXPLAIN ANALYZE,
  history, saved queries, one session per tab so manual transactions stay isolated.
- **Import**: CSV into a table with column mapping, or run a `.sql` file.
- **Workspace**: open connections and tabs are restored at launch; light and dark themes.

## Architecture

```
src-tauri/            Rust backend (Tauri commands)
  src/db/             tokio-postgres sessions, text-protocol execution, catalog introspection
  src/storage.rs      JSON documents in ~/Library/Application Support/Table++, keychain passwords
  tests/              integration tests against the docker database
src/
  core/               pure TypeScript: SQL tokenizer/splitter, table queries, staged change sets,
                      CSV/JSON/SQL exchange, completion engine, connection URLs
  state/              zustand store + actions (connections, tabs, table editing, queries)
  features/           React views: sidebar, table tab, query tab, grid (Glide Data Grid),
                      editor (CodeMirror 6), structure, import/export, settings
  components/ui/      design-system primitives on Radix (menus, dialogs, selects…)
  design/             tokens.css (light/dark) and global styles (Tailwind v4)
```

Queries run through PostgreSQL's simple query protocol, so every value arrives in its canonical
text form without per-type decoding; column types come from a `prepare` round trip, so even empty
results keep their headers. The UI talks to the backend through one typed bridge
(`src/lib/backend.ts`), which the tests replace with an in-memory mock.

## Development

```sh
make check              # typecheck, eslint (0 warnings), prettier, vitest, cargo fmt/clippy/test
make test-integration   # Rust tests against the docker database
make screenshots        # renders the main screens into ./screenshots with the mock backend
```

## Roadmap

- SSH tunnels
- Schema editing (columns, indexes, constraints)
- Editing query results that map to a single table
