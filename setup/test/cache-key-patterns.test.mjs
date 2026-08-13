import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ACTION = fileURLToPath(new URL("../action.yml", import.meta.url));
const PATTERNS = fileURLToPath(
  new URL("../mise-config-patterns.txt", import.meta.url),
);

async function cacheKeyPatterns() {
  const src = await readFile(PATTERNS, "utf8");
  return src.split("\n").filter((line) => line !== "");
}

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

// The node_modules and src entries are why the patterns are root-anchored
// rather than carrying mise-action's `**/` prefix.
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
  // node:fs/promises glob stands in for hashFiles() because it returned an
  // identical set to @actions/glob against this fixture.
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

// MISE_ENV picks which of the hashed files mise reads, so two checkouts that
// hash identically still install different toolchains.
describe("store cache key profile separation", () => {
  // The key spans several lines and restore-keys one, so both are read as the
  // whole cache step rather than by field.
  const cacheStep = async () => {
    const src = await readFile(ACTION, "utf8");
    const step = src.slice(src.indexOf("actions/cache@"));
    assert.notEqual(step, "", "action.yml no longer has a cache step to read");
    return step;
  };

  it("puts MISE_ENV in the key", async () => {
    const step = await cacheStep();
    const key = step.slice(step.indexOf("key:"), step.indexOf("restore-keys:"));
    assert.match(
      key,
      /env\.MISE_ENV/,
      "two jobs differing only in MISE_ENV would share one key and restore " +
        "each other's store",
    );
  });

  it("puts MISE_ENV in restore-keys", async () => {
    const step = await cacheStep();
    const restoreKeys = step.slice(step.indexOf("restore-keys:"));
    assert.match(
      restoreKeys.split("\n")[0],
      /env\.MISE_ENV/,
      "a prefix stopping short of MISE_ENV lets a job fall back onto a store " +
        "another profile built",
    );
  });
});
