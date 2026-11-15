#!/usr/bin/env bash
set -euo pipefail

VERSION="${2:-${1:-}}"
if [[ "${1:-}" == "chromium" || "${1:-}" == "edge" ]]; then
  VERSION="${2:-}"
fi

if [[ -n "$VERSION" ]]; then
  node "$(dirname "$0")/make-mv3.mjs" "$VERSION"
else
  node "$(dirname "$0")/make-mv3.mjs"
fi
