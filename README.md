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
| `yarn.lock` | Yarn Berry (>= 2) | `yarn install --immutable` |

Yarn Classic shares the `yarn.lock` filename but has neither `--immutable` nor a
`cacheFolder` setting, so the action rejects it rather than taking a path that
would half-work.

No lockfile is a hard error — a silent skip would leave dependencies missing and
fail a later step with an unrelated-looking message. The same applies when the
package manager reports no cache directory.

The package manager's store is cached, keyed on the lockfile that detection
selected — not on every lockfile name, so an unrelated `yarn.lock` sitting in a
pnpm repository no longer invalidates the entry. The store path is deliberately
absent from the key: `actions/cache` hashes `path` into its own cache version, so
a container job and a host job never share an entry even under an identical key.

Every package manager above is exercised by this repository's own CI, which
builds a fixture project per manager and runs the action against it.

`action.yml` decides *which* package manager is in play; `setup/pm.sh` holds what
each one is then asked to do. Adding a package manager means one new branch in
each, not a scattered set of parallel switches.

### Requirements

- A `mise.toml` declaring the runtime and package manager.
- `actions/checkout` before this action.

The action's own steps run under `sh`, so it does not need `bash` in the image.
That alone does not make a bare Alpine container work, because mise and node
bring requirements of their own. Such an image needs all of:

- `bash` — mise verifies a node install by running `npm`, whose launcher is a
  bash script.
- `libstdc++` and `libgcc` — node's musl build links both dynamically.
- `MISE_ALL_COMPILE=0` — mise turns compilation on by default on Alpine, which
  declines the prebuilt musl binaries and then wants a full build toolchain.
