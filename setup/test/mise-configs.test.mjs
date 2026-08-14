import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../mise-configs.sh", import.meta.url));
const ACTION = fileURLToPath(new URL("../action.yml", import.meta.url));

// Shape recorded from mise 2026.7.0 on ubuntu-latest.
const miseReports = (...paths) =>
  JSON.stringify(
    paths.map((p) => ({ path: p, tools: [] })),
    null,
    2,
  );

// Runs the real script with `mise` replaced by a stub printing the recorded
// response, so the suite needs no mise and still exercises the shipped code.
const configsUnder = async (workspace, json) => {
  const bin = await mkdtemp(path.join(tmpdir(), "mise-stub-"));
  const payload = path.join(bin, "response.json");
  await writeFile(payload, json);
  // `cat` of a file rather than a heredoc: a heredoc needs a temp file the
  // sandbox some contributors run under refuses to create.
  await writeFile(path.join(bin, "mise"), `#!/bin/sh\ncat ${payload}\n`, {
    mode: 0o755,
  });

  const out = execFileSync("sh", [SCRIPT, workspace], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  });
  return out.split("\n").filter((line) => line !== "");
};

const workspaceWith = async (...files) => {
  const dir = await mkdtemp(path.join(tmpdir(), "mise-ws-"));
  const real = await execFileSync("sh", ["-c", `cd "${dir}" && pwd -P`], {
    encoding: "utf8",
  }).trim();
  for (const rel of files) {
    await mkdir(path.join(real, path.dirname(rel)), { recursive: true });
    await writeFile(path.join(real, rel), "");
  }
  return real;
};

describe("mise-configs.sh", () => {
  it("names every config mise read under the workspace", async () => {
    const ws = await workspaceWith("mise.toml");
    const configs = await configsUnder(
      ws,
      miseReports(
        `${ws}/mise.ci.toml`,
        `${ws}/mise.toml`,
        `${ws}/.config/mise/conf.d/10-x.toml`,
        `${ws}/.tool-versions`,
      ),
    );
    assert.deepEqual(configs, [
      "mise.ci.toml",
      "mise.toml",
      ".config/mise/conf.d/10-x.toml",
      ".tool-versions",
    ]);
  });

  it("drops a config outside the workspace", async () => {
    const ws = await workspaceWith("mise.toml");
    const configs = await configsUnder(
      ws,
      miseReports(`${ws}/mise.toml`, "/home/runner/.config/mise/config.toml"),
    );
    assert.deepEqual(
      configs,
      ["mise.toml"],
      "hashFiles resolves against the workspace, so an outside path would " +
        "contribute nothing while looking like it was covered",
    );
  });

  // mise reports canonical paths, so a workspace reached through a symlink
  // matches nothing unless the script resolves it — and the action treats no
  // match as a hard error, which would break a repo that works today.
  it("matches when the workspace is reached through a symlink", async () => {
    const real = await workspaceWith("mise.toml");
    const link = path.join(await mkdtemp(path.join(tmpdir(), "mise-link-")), "ws");
    await symlink(real, link);

    const configs = await configsUnder(link, miseReports(`${real}/mise.toml`));
    assert.deepEqual(configs, ["mise.toml"]);
  });

  it("names nothing when mise read nothing under the workspace", async () => {
    const ws = await workspaceWith("mise.toml");
    const configs = await configsUnder(
      ws,
      miseReports("/home/runner/.config/mise/config.toml"),
    );
    assert.deepEqual(configs, [], "the action turns this into a hard error");
  });
});

describe("store cache key", () => {
  const cacheStep = async () => {
    const src = await readFile(ACTION, "utf8");
    const at = src.indexOf("actions/cache@");
    assert.notEqual(at, -1, "action.yml no longer has a cache step to read");
    return src.slice(at);
  };

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

  it("keeps restore-keys a prefix of the key", async () => {
    const step = await cacheStep();
    const key = step
      .slice(step.indexOf("key:"), step.indexOf("restore-keys:"))
      .replace(/\s+/g, " ");
    const restoreKeys = step
      .slice(step.indexOf("restore-keys:"))
      .split("\n")[0]
      .replace("restore-keys:", "")
      .trim();

    const prefix = key.slice(key.indexOf("${{"), key.indexOf("-${{ hashFiles"));
    assert.equal(
      `${prefix}-`.replace(/\s+/g, " "),
      restoreKeys.replace(/\s+/g, " "),
      "restore-keys that is not a prefix of the key silently never matches",
    );
  });
});
