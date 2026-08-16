#!/usr/bin/env sh
# Detection lives in action.yml; everything downstream of the name lives here,
# so adding one touches a single switch, not two steps split by the cache step.
set -eu

op=${1:?usage: pm.sh <store|install> <pnpm|npm|bun|yarn>}
pm=${2:?usage: pm.sh <store|install> <pnpm|npm|bun|yarn>}

case "$op:$pm" in
  store:pnpm) pnpm store path ;;
  store:npm) npm config get cache ;;
  store:bun) bun pm cache ;;
  store:yarn) yarn config get cacheFolder ;;

  install:pnpm) pnpm install --frozen-lockfile ;;
  install:npm) npm ci ;;
  install:bun) bun install --frozen-lockfile ;;
  install:yarn) yarn install --immutable ;;

  store:* | install:*)
    echo "::error::unknown package manager: $pm" >&2
    exit 1
    ;;
  *)
    echo "::error::unknown operation: $op" >&2
    exit 1
    ;;
esac
