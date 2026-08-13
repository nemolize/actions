import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ACTION = fileURLToPath(new URL("../action.yml", import.meta.url));

// The patterns are read out of action.yml rather than restated here, so a
// pattern deleted there fails this suite instead of silently narrowing the key.
async function cacheKeyPatterns() {
  const src = await readFile(ACTION, "utf8");
  const call = src.match(/hashFiles\(([\s\S]*?)\)\s*\}\}/);
  assert.ok(call, "action.yml no longer has a hashFiles(...) call to read");
  return [...call[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// Every path mise reads a config from, under each filename it accepts.
const MISE_CONFIGS = [
  "mise.toml",
  "mise.ci.toml",
  "mise.lock",
  "mise.ci.lock",
  ".mise.toml",
  ".mise.ci.toml",
  ".mise.lock",
  "mise/config.toml",
  "mise/config.ci.toml",
  "mise/config.lock",
  ".mise/config.toml",
  ".mise/config.lock",
  ".config/mise.toml",
  ".config/mise.lock",
  ".config/mise/config.toml",
  ".config/mise/config.lock",
  ".config/mise/conf.d/10-node.toml",
  ".tool-versions",
];

// Files a repository plausibly carries that must not enter the key. A config
// under node_modules is the reason these patterns are root-anchored rather
// than carrying mise-action's `**/` prefix.
const DECOYS = [
  "Cargo.toml",
  "misery.txt",
  "package.json",
  "pnpm-lock.yaml",
  "node_modules/some-pkg/mise.toml",
  "src/mise.toml",
  ".config/misc/notes.toml",
];

let dir;
let matched;

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "mise-cache-key-"));
  for (const rel of [...MISE_CONFIGS, ...DECOYS]) {
    await mkdir(path.join(dir, path.dirname(rel)), { recursive: true });
    await writeFile(path.join(dir, rel), `content of ${rel}\n`);
  }

  matched = new Set();
  for await (const entry of glob(await cacheKeyPatterns(), {
    cwd: dir,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const abs = path.join(entry.parentPath, entry.name);
    matched.add(path.relative(dir, abs));
  }
});

after(async () => {
  const { rm } = await import("node:fs/promises");
  await rm(dir, { recursive: true, force: true });
});

describe("store cache key patterns", () => {
  // node:fs/promises glob and @actions/glob were compared against this same
  // fixture and returned an identical set, which is what lets a dependency-free
  // suite stand in for the hashFiles() call the action actually makes.
  for (const rel of MISE_CONFIGS) {
    it(`hashes ${rel}`, () => {
      assert.ok(
        matched.has(rel),
        `${rel} is a config mise reads, but no pattern in action.yml matches it, ` +
          `so changing it would not invalidate the store cache`,
      );
    });
  }

  for (const rel of DECOYS) {
    it(`leaves ${rel} out`, () => {
      assert.ok(
        !matched.has(rel),
        `${rel} is not a mise config, but a pattern in action.yml matches it, ` +
          `so touching it would needlessly invalidate the store cache`,
      );
    });
  }
});
