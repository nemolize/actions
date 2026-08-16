#!/usr/bin/env sh
# Digests the tool versions the environment overrode the mise config with, for
# the cache keys to tell two matrix legs apart. Prints nothing when no override
# is set — an empty answer is what keeps such a repository on the key it had.
set -eu

# Normalises the name as mise's own `tool_from_env_var_name` does, and leaves
# the value alone — `lts/Hydrogen` is not `lts/hydrogen`, though NODE is node.
normalise() {
  while IFS='=' read -r name value; do
    tool=$(printf '%s' "$name" | tr 'A-Z_' 'a-z-')
    case "$tool" in
      install | tool) continue ;;
      # NODEJS and NODE name one tool to mise; keying them apart would split a
      # cache the two in fact share.
      nodejs) tool=node ;;
    esac
    # mise reads the value with `split_whitespace`, so a blank one asks for no
    # version — as a `${{ matrix.x }}` that expanded to nothing does.
    versions=$(printf '%s' "$value" | tr -s '[:space:]' ' ' | sed 's/^ //; s/ $//')
    [ -n "$versions" ] || continue
    printf '%s=%s\n' "$tool" "$versions"
  done
}

overrides=$(
  env |
    sed -n 's/^MISE_\([A-Za-z0-9_-]\{1,\}\)_VERSION=\(.*\)$/\1=\2/p' |
    normalise |
    LC_ALL=C sort
)

[ -n "$overrides" ] || exit 0

# Digested, not spelled out: actions/cache rejects a comma and caps the key at
# 512 chars, which a `path:/…` version value would blow through.
printf '%s\n' "$overrides" | cksum | cut -d' ' -f1
