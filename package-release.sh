#!/usr/bin/env bash
set -e

# Bookmark Glass Packaging Script for Microsoft Edge Add-ons
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$ROOT_DIR/dist"
EXT_DIR="$ROOT_DIR/extension"

echo "=== Building Bookmark Glass Microsoft Edge Release Package ==="
mkdir -p "$DIST_DIR"

echo "Packaging Edge release ZIP..."
rm -rf "$DIST_DIR/edge_staging" "$DIST_DIR/bookmark-glass-edge.zip"
mkdir -p "$DIST_DIR/edge_staging"
cp -R "$EXT_DIR"/* "$DIST_DIR/edge_staging/"
find "$DIST_DIR/edge_staging" -name ".DS_Store" -delete

(cd "$DIST_DIR/edge_staging" && zip -q -r "$DIST_DIR/bookmark-glass-edge.zip" .)
rm -rf "$DIST_DIR/edge_staging"
echo "  -> Created: dist/bookmark-glass-edge.zip"

echo "=== Package ready in $DIST_DIR ==="
ls -lh "$DIST_DIR"
