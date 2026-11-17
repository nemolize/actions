import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstShipped, hasNewChangeset, parsePaths, splitNul } from "../src/classify.mjs";

describe("parsePaths", () => {
  it("keeps each line as a literal prefix and drops blank ones", () => {
    assert.deepEqual(parsePaths("src/\n\n  packages/ \r\n"), ["src/", "packages/"]);
  });

  it("answers empty when nothing is named", () => {
    assert.deepEqual(parsePaths(" \n\n"), []);
  });
});

describe("splitNul", () => {
  it("keeps a path with a space or a newline whole", () => {
    assert.deepEqual(splitNul("src/a b.js\0src/x\ny.js\0"), ["src/a b.js", "src/x\ny.js"]);
  });
});

describe("firstShipped", () => {
  it("matches a prefix of the repository-relative path", () => {
    assert.equal(firstShipped(["README.md", "src/a.js"], ["src/"]), "src/a.js");
  });

  it("does not match the prefix anywhere but the start", () => {
    assert.equal(firstShipped(["docs/src/a.js"], ["src/"]), undefined);
  });

  it("matches any of several prefixes", () => {
    assert.equal(firstShipped(["packages/a/index.js"], ["src/", "packages/"]), "packages/a/index.js");
  });
});

describe("hasNewChangeset", () => {
  it("counts a markdown file directly in .changeset", () => {
    assert.equal(hasNewChangeset([".changeset/brave-owls-sing.md"]), true);
  });

  it("does not count the README changeset init writes", () => {
    assert.equal(hasNewChangeset([".changeset/README.md"]), false);
  });

  it("does not count config or a nested file", () => {
    assert.equal(hasNewChangeset([".changeset/config.json", ".changeset/old/x.md"]), false);
  });

  it("does not count a file elsewhere", () => {
    assert.equal(hasNewChangeset(["docs/.changeset/x.md"]), false);
  });
});
