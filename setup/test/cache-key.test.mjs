import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ACTION = fileURLToPath(new URL("../action.yml", import.meta.url));

const cacheStep = async () => {
  const src = await readFile(ACTION, "utf8");
  const step = src.slice(src.indexOf("actions/cache@"));
  assert.notEqual(step, "", "action.yml no longer has a cache step to read");
  return step;
};

// The sed pipeline is lifted out of action.yml rather than restated, so a
// change there is what these assertions run against. `mise config ls` is
// replaced by a recorded response so the suite needs no mise installed.
const extractConfigs = async (json, workspace) => {
  const src = await readFile(ACTION, "utf8");
  const pipeline = src.match(/configs=\$\(mise config ls --json \|\n([\s\S]*?)\)\n/);
  assert.ok(pipeline, "action.yml no longer builds configs from mise config ls");

  const dir = await mkdtemp(path.join(tmpdir(), "mise-config-ls-"));
  const file = path.join(dir, "configs.json");
  await writeFile(file, json);

  const script = `set -eu\ncat "$1" |\n${pipeline[1]}`;
  const out = execFileSync("sh", ["-c", script, "sh", file], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_WORKSPACE: workspace },
  });
  return out.split("\n").filter((line) => line !== "");
};

const WORKSPACE = "/home/runner/work/actions/actions";

// Shape recorded from mise 2026.7.0 on ubuntu-latest.
const reported = (...paths) =>
  JSON.stringify(
    paths.map((p) => ({ path: p, tools: [] })),
    null,
    2,
  );

describe("mise config extraction", () => {
  it("takes every config mise names under the workspace", async () => {
    const configs = await extractConfigs(
      reported(
        `${WORKSPACE}/mise.ci.toml`,
        `${WORKSPACE}/mise.toml`,
        `${WORKSPACE}/.config/mise/conf.d/10-x.toml`,
        `${WORKSPACE}/.tool-versions`,
      ),
      WORKSPACE,
    );
    assert.deepEqual(configs, [
      "mise.ci.toml",
      "mise.toml",
      ".config/mise/conf.d/10-x.toml",
      ".tool-versions",
    ]);
  });

  it("drops a config outside the workspace", async () => {
    const configs = await extractConfigs(
      reported(`${WORKSPACE}/mise.toml`, "/home/runner/.config/mise/config.toml"),
      WORKSPACE,
    );
    assert.deepEqual(
      configs,
      ["mise.toml"],
      "hashFiles resolves against the workspace, so a path outside it would " +
        "silently contribute nothing while looking like it was covered",
    );
  });

  it("keeps the profile config MISE_ENV selected", async () => {
    const withProfile = await extractConfigs(
      reported(`${WORKSPACE}/mise.ci.toml`, `${WORKSPACE}/mise.toml`),
      WORKSPACE,
    );
    const without = await extractConfigs(
      reported(`${WORKSPACE}/mise.toml`),
      WORKSPACE,
    );
    assert.notDeepEqual(
      withProfile,
      without,
      "two profiles hashing the same set would share a cache entry",
    );
  });
});

describe("store cache key", () => {
  it("hashes what mise reported, not a hardcoded filename", async () => {
    const step = await cacheStep();
    const key = step.slice(step.indexOf("key:"), step.indexOf("restore-keys:"));
    assert.match(
      key,
      /steps\.pm\.outputs\.mise_configs/,
      "the key stopped reading mise's own answer, so a config under any " +
        "filename it was not told about drops out of the key",
    );
  });

  it("puts MISE_ENV on the restore-keys prefix", async () => {
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
