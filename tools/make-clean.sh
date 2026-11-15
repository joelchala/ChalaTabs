#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$ROOT_DIR/dist/build"
echo "Cleaned $ROOT_DIR/dist/build"
