import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { boolean, choice, input, positiveInteger } from "../src/actions.mjs";

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

describe("positiveInteger", () => {
  it("reads a plain issue number", () => {
    set("number", "42");
    assert.equal(positiveInteger("number"), 42);
  });

  it("keeps leading zeros readable as the number they spell", () => {
    set("number", "007");
    assert.equal(positiveInteger("number"), 7);
  });

  it("is undefined when unset, so a caller can fall back", () => {
    assert.equal(positiveInteger("number"), undefined);
    set("number", "   ");
    assert.equal(positiveInteger("number"), undefined);
  });

  it("refuses the numeric literals `Number` would silently accept", () => {
    for (const value of ["1e2", "0x2A", "0b101", "0o52", "1e21", "+5", "7.0"]) {
      set("number", value);
      assert.throws(() => positiveInteger("number"), /must be a positive integer/, value);
    }
  });

  it("accepts the largest uniquely representable integer, and refuses past it", () => {
    set("number", String(Number.MAX_SAFE_INTEGER));
    assert.equal(positiveInteger("number"), Number.MAX_SAFE_INTEGER);
    set("number", (2n ** 53n).toString());
    assert.throws(() => positiveInteger("number"), /must be a positive integer/);
    set("number", (2n ** 53n + 1n).toString());
    assert.throws(() => positiveInteger("number"), /must be a positive integer/);
  });

  it("refuses what is not a number at all", () => {
    for (const value of ["abc", "-3", "0", "Infinity", "1_000"]) {
      set("number", value);
      assert.throws(() => positiveInteger("number"), /must be a positive integer/, value);
    }
  });

  it("names the input in the error, as its siblings do", () => {
    set("number", "nope");
    assert.throws(() => positiveInteger("number"), /^Error: number must be/);
  });
});
