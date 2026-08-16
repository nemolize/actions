import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ACTION = fileURLToPath(new URL("../action.yml", import.meta.url));
const src = await readFile(ACTION, "utf8");

// Joins a folded (`>-`) value the way YAML does: comparing raw lines would make
// a rewrap of an unchanged key read as a behaviour change.
const inputOf = (fromStep, name) => {
  const step = src.indexOf(fromStep);
  assert.notEqual(step, -1, `action.yml no longer has a ${fromStep} step`);

  const lines = src.slice(step).split("\n");
  const start = lines.findIndex((l) => l.trim().startsWith(`${name}:`));
  assert.notEqual(start, -1, `the ${fromStep} step no longer sets ${name}`);

  const afterName = lines[start].indexOf(`${name}:`) + name.length + 1;
  const first = lines[start].slice(afterName).trim();
  if (first !== ">-") return first.replace(/^["']|["']$/g, "");

  const indent = lines[start].search(/\S/);
  const folded = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.search(/\S/) <= indent) break;
    folded.push(line.trim());
  }
  return folded.join(" ");
};

describe("the overrides segment reaches both caches", () => {
  it("is computed before mise-action, whose own cache needs it", () => {
    assert.ok(
      src.indexOf("id: overrides") < src.indexOf("jdx/mise-action@"),
      "a step cannot read an output produced after it",
    );
  });

  it("is wired into mise-action's tool cache", () => {
    assert.equal(
      inputOf("jdx/mise-action@", "cache_key"),
      "{{default}}${{ steps.overrides.outputs.segment }}",
      "without this the legs share one tool cache and the second never saves",
    );
  });

  it("is wired into the package manager's store cache", () => {
    assert.match(inputOf("actions/cache@", "key"), /steps\.overrides\.outputs\.segment/);
  });

  it("is produced by the script, not spelled out in the step", () => {
    const step = src.slice(src.indexOf("id: overrides"), src.indexOf("jdx/mise-action@"));
    assert.match(step, /mise-overrides\.sh/);
    assert.match(
      step,
      /segment=\$\{digest:\+-\$digest\}/,
      "the separator has to ship with the digest, or an empty answer still " +
        "changes every existing consumer's key",
    );
  });
});

describe("store cache key", () => {
  it("hashes what mise reported, not a hardcoded filename", () => {
    assert.match(
      inputOf("actions/cache@", "key"),
      /steps\.pm\.outputs\.mise_configs/,
      "the key stopped reading mise's own answer, so a config under any " +
        "filename it was not told about drops out of the key",
    );
  });

  it("keeps restore-keys a prefix of the key", () => {
    const key = inputOf("actions/cache@", "key").replace(/\s+/g, " ");
    const restoreKeys = inputOf("actions/cache@", "restore-keys").replace(/\s+/g, " ");

    const hash = key.indexOf("-${{ hashFiles");
    assert.notEqual(hash, -1, "the key no longer ends in the hash");
    assert.equal(
      `${key.slice(0, hash)}-`,
      restoreKeys,
      "restore-keys that is not a prefix of the key silently never matches",
    );
  });
});
