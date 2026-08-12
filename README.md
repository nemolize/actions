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

Installs the toolchain declared in the repository's mise config, then installs
dependencies with whichever package manager its lockfile selects.

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

The key also covers the mise config, under every filename mise accepts. The
pattern list follows `MISE_CONFIG_FILE_PATTERNS` in `jdx/mise-action` — each
config path, its `mise.<profile>.toml` variants, the matching `.lock` files and
`.tool-versions` — so the toolchain is keyed on wherever this repository happens
to declare it. Naming only `mise.toml` would drop the toolchain out of the key
for a repository using any other form, and a mise change would then restore a
store built against the old toolchain.

Two deliberate differences from that list: the patterns are anchored at the root
rather than prefixed with `**/`, which would also sweep in a mise config vendored
inside `node_modules`; and `.config/mise/conf.d/*.toml` is added, which mise reads
but upstream's list does not name.

`MISE_ENV` is part of the key, and of `restore-keys`, because it selects which of
those files mise actually reads. Without it two jobs over one checkout — one with
`MISE_ENV` set, one without — hash an identical set of files while installing
different toolchains, and would share a store.

Every package manager above is exercised by this repository's own CI, which
builds a fixture project per manager and runs the action against it.

`action.yml` decides *which* package manager is in play; `setup/pm.sh` holds what
each one is then asked to do. Adding a package manager means one new branch in
each, not a scattered set of parallel switches.

### Requirements

- A mise config declaring the runtime and package manager, under any filename
  mise reads.
- `actions/checkout` before this action.

The action's own steps run under `sh`, so it does not need `bash` in the image.
That alone does not make a bare Alpine container work, because mise and node
bring requirements of their own. Such an image needs all of:

- `bash` — mise verifies a node install by running `npm`, whose launcher is a
  bash script.
- `libstdc++` and `libgcc` — node's musl build links both dynamically.
- `MISE_ALL_COMPILE=0` — mise turns compilation on by default on Alpine, which
  declines the prebuilt musl binaries and then wants a full build toolchain.

## `upsert`

Writes a markdown block into a pull request or issue description and replaces
that same block in place on every later run. Because the block lives in the
description rather than in a comment, updating it raises no notifications.

```yaml
permissions:
  pull-requests: write

steps:
  - uses: nemolize/actions/upsert@<sha> # the release that <sha> belongs to
    with:
      marker: coverage
      body: |
        ### Coverage

        | metric | % |
        | --- | --- |
        | lines | 92% |
```

The block the action owns is delimited by the marker it is given:

```markdown
<!-- coverage-start -->
### Coverage
...
<!-- coverage-end -->
```

Anything outside those two lines belongs to whoever wrote it and is left alone,
so several jobs can each own a block in the same description by picking
different markers.

### Inputs

| Input | Default | Description |
| --- | --- | --- |
| `marker` | (required) | Names the block this action owns, as `<!-- <marker>-start -->` |
| `body` | | Markdown to put inside the block |
| `target` | `body` | Where the block lives. Only `body` is supported today; `comment` is reserved |
| `mode` | `upsert` | `upsert` to write the block, `remove` to delete it |
| `position` | `append` | Where a first-time block goes — `append` or `prepend`. An existing block is always replaced where it sits |
| `on-empty` | `remove` | What an empty `body` means — `remove` the block, or `skip` and change nothing |
| `number` | from the event | Pull request or issue number |
| `repository` | `${{ github.repository }}` | Repository holding it, as `owner/name` |
| `skip-forks` | `true` | Skip, rather than fail, on a fork's pull request, whose token cannot write |
| `github-token` | `${{ github.token }}` | Token used to read and edit the description |

### Outputs

| Output | Description |
| --- | --- |
| `changed` | `true` when the description was written, `false` when already current |
| `number` | Pull request or issue the block was written to |

### Behaviour

**Pull requests and issues are both targets.** `number` accepts either and
defaults to whichever one the triggering event carries. The two sit behind
different token permissions — a pull request needs `pull-requests: write`, an
issue needs `issues: write` — so the endpoint is taken from the event, and
probed for when `number` is passed explicitly. A 403 names the permission the
token is missing. Passing `number` and `repository` lets a `workflow_run` or a
scheduled job write to a pull request it was not triggered by.

**Nothing is written, and the job does not fail, when** the event carries no
pull request or issue, or the pull request comes from a fork — a fork's token is
read-only, so the write could only fail. Set `skip-forks: false` to make that an
error instead.

**Markers are matched as whole lines**, so a description that mentions one in
prose keeps it. A start marker with no matching end fails the step rather than
appending a second block beside the broken one.

**Empty content removes the block** by default. That keeps a block from going
stale when the thing it reports on did not run; pass `on-empty: skip` to leave
the previous block standing instead.

**Concurrent writes are handled on a best-effort basis.** Two jobs owning
different markers both read the description, edit their own block and write the
whole thing back, so the later write can drop the earlier one. After writing,
this action reads the description again and re-applies its block if it has gone,
which converges as long as the racing write has already landed. It cannot close
the window entirely — when two jobs write blocks to the same pull request, put
them in one `concurrency` group.

### Requirements

- `pull-requests: write` for a pull request, `issues: write` for an issue.
- No `actions/checkout` — the action reads and writes over the API.
