#!/bin/sh
# Regenerates the app icon set from a source PNG.
set -e
cd "$(dirname "$0")/.."
swift Scripts/make-icon.swift "${1:-icon.png}" "${2:-App/Resources/Assets.xcassets/AppIcon.appiconset}"
