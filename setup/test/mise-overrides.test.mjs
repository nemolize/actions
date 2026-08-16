import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../mise-overrides.sh", import.meta.url));

// A constructed environment rather than a spread of process.env: a
// MISE_*_VERSION exported by whoever runs the suite would leak into every case.
const digestUnder = (env) =>
  execFileSync("sh", [SCRIPT], { encoding: "utf8", env }).trim();

describe("mise-overrides.sh", () => {
  it("answers nothing when the config alone decides the versions", () => {
    assert.equal(
      digestUnder({}),
      "",
      "an empty answer is what keeps a repository setting no override on the " +
        "key it already had",
    );
  });

  it("separates legs that differ only by a tool version", () => {
    assert.notEqual(
      digestUnder({ MISE_NODE_VERSION: "24" }),
      digestUnder({ MISE_NODE_VERSION: "22" }),
      "the two legs would share one cache entry",
    );
  });

  // mise's `tool_from_env_var_name` folds case and `_`/`-`, then unaliases the
  // backend — so all three of these name one tool and must key alike.
  it("reads the variable name as mise does", () => {
    const node24 = digestUnder({ MISE_NODE_VERSION: "24" });
    assert.equal(digestUnder({ MISE_NODEJS_VERSION: "24" }), node24, "NODEJS unaliases to node");
    assert.equal(digestUnder({ MISE_node_VERSION: "24" }), node24, "the name is case-folded");
  });

  it("ignores MISE settings that are not a tool version", () => {
    for (const name of ["MISE_ENV", "MISE_INSTALL_VERSION", "MISE_TOOL_VERSION"]) {
      assert.equal(
        digestUnder({ [name]: "ci" }),
        "",
        `${name} is not a tool version; mise excludes it too`,
      );
    }
  });

  it("keeps a version's own case, which mise does not fold", () => {
    assert.notEqual(
      digestUnder({ MISE_NODE_VERSION: "lts/Hydrogen" }),
      digestUnder({ MISE_NODE_VERSION: "lts/hydrogen" }),
    );
  });

  it("sorts, so the same overrides always spell the same key", () => {
    assert.equal(
      digestUnder({ MISE_PYTHON_VERSION: "3.12", MISE_NODE_VERSION: "24" }),
      digestUnder({ MISE_NODE_VERSION: "24", MISE_PYTHON_VERSION: "3.12" }),
    );
  });

  // A raw `path:/…` value would carry the comma actions/cache rejects and could
  // run past its 512-char key limit; a digest is neither.
  it("answers something a cache key can hold", () => {
    assert.match(digestUnder({ MISE_NODE_VERSION: "path:/tmp/node,a" }), /^[0-9]+$/);
  });

  it("does not collapse two different versions into one answer", () => {
    assert.notEqual(
      digestUnder({ MISE_NODE_VERSION: "path:/tmp/node,a" }),
      digestUnder({ MISE_NODE_VERSION: "path:/tmp/node-a" }),
      "flattening the separator would key these alike",
    );
  });
});
