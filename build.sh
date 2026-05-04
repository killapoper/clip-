#!/usr/bin/env bash
set -euo pipefail

echo "▸ Checking prerequisites…"
if ! command -v xcodegen &>/dev/null; then
  echo "  xcodegen not found — run: brew install xcodegen"
  exit 1
fi

echo "▸ Generating Xcode project…"
xcodegen generate

echo "▸ Building Clip (Debug)…"
xcodebuild \
  -project Clip.xcodeproj \
  -scheme Clip \
  -configuration Debug \
  -derivedDataPath build \
  -quiet \
  build

APP=build/Build/Products/Debug/Clip.app

echo "▸ Installing to /Applications…"
rm -rf /Applications/Clip.app
cp -R "$APP" /Applications/

echo "▸ Removing quarantine…"
xattr -cr /Applications/Clip.app

echo "▸ Launching…"
open /Applications/Clip.app

echo "✓ Done"
