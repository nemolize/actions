#!/usr/bin/env bash
# Needs `gh` with the gh-actions-lock extension, and `zizmor`, on PATH; CI
# installs the versions pinned in .github/workflows/ci.yml.
set -euo pipefail

cd "$(dirname "$0")/.."

[ -n "${GH_TOKEN:-}" ] || GH_TOKEN="$(gh auth token)"
export GH_TOKEN

gh actions-lock --verify --no-interactive
zizmor --no-progress .
