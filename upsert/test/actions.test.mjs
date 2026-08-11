import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { boolean, choice, input } from "../src/actions.mjs";

const set = (name, value) => {
  process.env[`INPUT_${name.toUpperCase()}`] = value;
};

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("INPUT_")) delete process.env[key];
  }
});

describe("input", () => {
  it("reads the runner's environment form of the name", () => {
    set("on-empty", "skip");
    assert.equal(input("on-empty"), "skip");
  });

  it("is empty when unset", () => {
    assert.equal(input("missing"), "");
  });
});

describe("boolean", () => {
  it("accepts the forms a workflow author is likely to write", () => {
    for (const value of ["true", "TRUE", "1", "yes"]) {
      set("flag", value);
      assert.equal(boolean("flag"), true, value);
    }
    for (const value of ["false", "0", "no", ""]) {
      set("flag", value);
      assert.equal(boolean("flag"), false, value);
    }
  });

  it("refuses anything else rather than guessing", () => {
    set("flag", "maybe");
    assert.throws(() => boolean("flag"), /must be true or false/);
  });
});

describe("choice", () => {
  it("falls back to the first value when unset", () => {
    assert.equal(choice("mode", ["upsert", "remove"]), "upsert");
  });

  it("refuses a value outside the list", () => {
    set("mode", "delete");
    assert.throws(() => choice("mode", ["upsert", "remove"]), /must be one of/);
  });

  it("tells a known-but-unimplemented value apart from a typo", () => {
    set("target", "comment");
    assert.throws(
      () => choice("target", ["body", "comment"], ["body"]),
      /not supported yet/,
    );
  });
});
