#!/usr/bin/env sh
# Detection lives in action.yml; everything downstream of the name lives here.
set -eu

op=${1:?usage: pm.sh install <pnpm|npm|bun|yarn>}
pm=${2:?usage: pm.sh install <pnpm|npm|bun|yarn>}

case "$op:$pm" in
  install:pnpm) pnpm install --frozen-lockfile ;;
  install:npm) npm ci ;;
  install:bun) bun install --frozen-lockfile ;;
  install:yarn) yarn install --immutable ;;

  install:*)
    echo "::error::unknown package manager: $pm" >&2
    exit 1
    ;;
  *)
    echo "::error::unknown operation: $op" >&2
    exit 1
    ;;
esac
