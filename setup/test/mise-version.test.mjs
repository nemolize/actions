import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ACTION = fileURLToPath(new URL("../action.yml", import.meta.url));
const CI = fileURLToPath(new URL("../../.github/workflows/ci.yml", import.meta.url));

// The version each file passes to mise-action. Anchored on the `uses:` line so a
// `version:` belonging to some other action can never be read as this one's.
const pinnedIn = async (path) => {
  const src = await readFile(path, "utf8");
  const step = src.indexOf("jdx/mise-action@");
  assert.notEqual(step, -1, `${path} no longer uses mise-action`);

  const lines = src.slice(step).split("\n");
  const next = lines.findIndex((l, i) => i > 0 && /^\s*-\s/.test(l));
  const within = next === -1 ? lines : lines.slice(0, next);

  const pin = within.find((l) => l.trim().startsWith("version:"));
  assert.ok(pin, `${path} stopped pinning mise, so it installs whatever shipped today`);
  return pin.split("version:")[1].trim().replace(/^["']|["']$/g, "");
};

describe("the mise pin", () => {
  it("is the same version on both sides of the integration test", async () => {
    assert.equal(
      await pinnedIn(CI),
      await pinnedIn(ACTION),
      "the fixture's lockfile is written by the mise CI installs and read by " +
        "the mise the action installs; a drift between them tests a pairing " +
        "no consumer runs",
    );
  });
});
