# actions

Shared composite GitHub Actions for `nemolize` repositories. One monorepo, one
subdirectory per action.

## Versioning

Releases are tagged with semantic versions (`v1.0.0`, `v1.1.0`, …). Every action
in this repository shares one version — the tag covers the whole monorepo, not a
single subdirectory.

A `vN` tag tracks the newest release of that major version, so `@v1` follows
patches and minor releases while never crossing a breaking change. Pin by commit
SHA and note the version in a trailing comment; the tags are for reading, the SHA
is what actually resolves.

## `setup`

Installs the toolchain declared in `mise.toml`, then installs dependencies with
whichever package manager the repository's lockfile selects.

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
- uses: nemolize/actions/setup@<sha> # v1.0.0
```

No inputs. The package manager is detected from the lockfile, in this order:

| Lockfile | Package manager | Install command |
| --- | --- | --- |
| `pnpm-lock.yaml` | pnpm | `pnpm install --frozen-lockfile` |
| `package-lock.json` | npm | `npm ci` |
| `bun.lock` / `bun.lockb` | bun | `bun install --frozen-lockfile` |
| `yarn.lock` | Yarn Berry | `yarn install --immutable` |

No lockfile is a hard error — a silent skip would leave dependencies missing and
fail a later step with an unrelated-looking message.

The package manager's store is cached. The store path is part of the cache key
because container jobs resolve a different `$HOME` than host jobs, and one's
cache is useless in the other.

Only the pnpm path is exercised today; the other three are written from each
tool's documented interface and unverified against a real run.

### Requirements

- A `mise.toml` declaring the runtime and package manager.
- `actions/checkout` before this action.
