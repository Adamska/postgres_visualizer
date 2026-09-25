# Table++ developer entry points.

PACKAGE_DIR := Packages/TableKit
PROJECT := TablePlusPlus.xcodeproj
SCHEME := TablePlusPlus
DERIVED := build/DerivedData
TEST_DATABASE_URL ?= postgres://tablepp:tablepp@localhost:54329/tablepp

.PHONY: help project build test test-integration lint db-up db-down clean icon run

help:
	@echo "make project          Generate the Xcode project with XcodeGen"
	@echo "make build            Build the app (warnings are errors)"
	@echo "make test             Run package unit tests and app tests"
	@echo "make db-up            Start the test Postgres container (docker compose)"
	@echo "make test-integration Run all package tests against the docker database"
	@echo "make lint             Run SwiftLint in strict mode"
	@echo "make run              Build and launch the app"

project:
	xcodegen generate --spec project.yml

build: project
	xcodebuild -project $(PROJECT) -scheme $(SCHEME) -configuration Debug -derivedDataPath $(DERIVED) build | Scripts/build-filter.sh

test: project
	cd $(PACKAGE_DIR) && swift test --filter 'TableCoreTests|TableStorageTests|BinaryDecoderTests|CatalogParsingTests'
	xcodebuild -project $(PROJECT) -scheme $(SCHEME) -derivedDataPath $(DERIVED) test | Scripts/build-filter.sh

db-up:
	docker compose up -d --wait

db-down:
	docker compose down -v

test-integration: db-up
	cd $(PACKAGE_DIR) && TABLEPP_TEST_DATABASE_URL=$(TEST_DATABASE_URL) swift test

lint:
	swiftlint lint --strict --quiet

icon:
	Scripts/make-icon.sh icon.png App/Resources/Assets.xcassets/AppIcon.appiconset

run: build
	open $(DERIVED)/Build/Products/Debug/Table++.app

clean:
	rm -rf build $(PACKAGE_DIR)/.build $(PROJECT)
