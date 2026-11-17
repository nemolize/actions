#!/usr/bin/env bash
# Needs `gh` with the gh-actions-lock extension, and `zizmor`, on PATH; CI
# installs the versions pinned in .github/workflows/ci.yml.
set -euo pipefail

cd "$(dirname "$0")/.."

export GH_TOKEN="${GH_TOKEN:-$(gh auth token)}"

gh actions-lock --verify --no-interactive --ignore-local-actions
zizmor --no-progress .
