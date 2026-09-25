#!/bin/sh
# Filters swift/xcodebuild output down to diagnostics and the final status.
sed -E 's/\x1b\[[0-9;]*m//g' \
  | awk 'length($0) < 400' \
  | grep -E "(error|warning|fatal|Stack dump|Assertion|crash|\*\* |Build |Test Suite|Test Case|Executed|✔|✘|◇|Tests? (passed|failed))" \
  | grep -vE "^error: (SwiftCompile|SwiftDriver|Build failed|emitModule)|-warnings-as-errors|Xcc" \
  | sort -u | head -80
