#!/usr/bin/env sh
# Names the mise config files under the workspace, one per line, for the cache
# key to hash. Asking mise beats listing filenames: the profile MISE_ENV picked
# is accounted for, and a config form mise adds later needs no change here.
set -eu

workspace=${1:?usage: mise-configs.sh <workspace>}

# mise reports canonical paths, so a workspace reached through a symlink would
# match nothing without resolving it first.
workspace=$(cd "$workspace" && pwd -P)

# `sed`, not `jq`: the action's other steps hold to `sh` and no more.
mise config ls --json |
  sed -n 's/^ *"path": "\(.*\)",*$/\1/p' |
  while IFS= read -r path; do
    case "$path" in
      "$workspace"/*) printf '%s\n' "${path#"$workspace"/}" ;;
    esac
  done
