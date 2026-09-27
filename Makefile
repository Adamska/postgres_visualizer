# Table++ developer entry points.

TEST_DATABASE_URL ?= postgres://tablepp:tablepp@localhost:54329/tablepp

# Signing identity for release builds: the first Developer ID or Apple Development certificate in
# the keychain. A stable signature lets macOS remember "Always Allow" for the keychain across
# rebuilds (ad-hoc builds get a new identity each time and ask again). Override with
# `make build SIGNING_IDENTITY=...`, or `SIGNING_IDENTITY=` for an ad-hoc build.
SIGNING_IDENTITY ?= $(shell security find-identity -v -p codesigning 2>/dev/null | grep -m1 -oE '"(Developer ID Application|Apple Development): [^"]+"' | tr -d '"')

.PHONY: help setup dev build check test test-rust test-integration lint db-up db-down screenshots clean

help:
	@echo "make setup            Install JS dependencies"
	@echo "make dev              Run the app in development mode (Tauri + Vite)"
	@echo "make build            Build the macOS app bundle (signed when a certificate is available)"
	@echo "make check            Typecheck, lint, format check and unit tests (front end + Rust)"
	@echo "make db-up            Start the sample Postgres database (docker compose)"
	@echo "make test-integration Run the Rust integration tests against the docker database"
	@echo "make screenshots      Render the main screens with the mock backend into ./screenshots"

setup:
	pnpm install

dev:
	pnpm tauri dev

build:
	$(if $(SIGNING_IDENTITY),APPLE_SIGNING_IDENTITY="$(SIGNING_IDENTITY)",) pnpm tauri build

check: test test-rust
	pnpm typecheck && pnpm lint && pnpm format
	cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings

test:
	pnpm test

test-rust:
	cd src-tauri && cargo test

db-up:
	docker compose up -d --wait

db-down:
	docker compose down -v

test-integration: db-up
	cd src-tauri && TABLEPP_TEST_DATABASE_URL=$(TEST_DATABASE_URL) cargo test

lint:
	pnpm lint && cd src-tauri && cargo clippy --all-targets -- -D warnings

screenshots:
	pnpm build && node Scripts/screenshots.mjs screenshots

clean:
	rm -rf dist node_modules src-tauri/target
