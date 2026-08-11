import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { locate, readBlock, remove, upsert, wrap } from "../src/block.mjs";

const M = "coverage";
const block = (inner) => wrap(M, inner);

describe("upsert", () => {
  it("writes the block into an empty body", () => {
    assert.equal(upsert("", M, "table"), block("table"));
  });

  it("appends below existing prose, separated by one blank line", () => {
    assert.equal(upsert("intro", M, "table"), `intro\n\n${block("table")}`);
  });

  it("prepends above existing prose", () => {
    assert.equal(
      upsert("intro", M, "table", "prepend"),
      `${block("table")}\n\nintro`,
    );
  });

  it("replaces in place, keeping what surrounds it", () => {
    const body = `intro\n\n${block("old")}\n\noutro`;
    assert.equal(upsert(body, M, "new"), `intro\n\n${block("new")}\n\noutro`);
  });

  it("keeps the block where it is rather than moving it to the end", () => {
    const body = `${block("old")}\n\noutro`;
    assert.equal(upsert(body, M, "new"), `${block("new")}\n\noutro`);
  });

  it("is idempotent", () => {
    const once = upsert("intro", M, "table");
    assert.equal(upsert(once, M, "table"), once);
  });

  it("treats CRLF bodies as equal to their LF form", () => {
    const once = upsert("intro", M, "table");
    assert.equal(upsert(once.replaceAll("\n", "\r\n"), M, "table"), once);
  });

  it("leaves a marker mentioned inside a line alone", () => {
    const body = "we open with <!-- coverage-start --> in prose";
    assert.equal(upsert(body, M, "table"), `${body}\n\n${block("table")}`);
  });

  it("does not touch a block owned by another marker", () => {
    const body = wrap("lint", "lint table");
    assert.equal(upsert(body, M, "table"), `${body}\n\n${block("table")}`);
  });

  it("refuses a start marker with no end", () => {
    assert.throws(() => upsert(`<!-- ${M}-start -->\nstray`, M, "x"), /no matching/);
  });

  it("refuses an end marker with no start", () => {
    assert.throws(() => upsert(`stray\n<!-- ${M}-end -->`, M, "x"), /no <!-- coverage-start/);
  });
});

describe("remove", () => {
  it("closes the gap it leaves behind", () => {
    const body = `intro\n\n${block("table")}\n\noutro`;
    assert.equal(remove(body, M), "intro\n\noutro");
  });

  it("empties a body that held nothing else", () => {
    assert.equal(remove(block("table"), M), "");
  });

  it("leaves a body without the block alone", () => {
    assert.equal(remove("intro", M), "intro");
  });

  it("keeps blank lines inside unrelated content intact", () => {
    const body = `\`\`\`\na\n\n\nb\n\`\`\`\n\n${block("table")}`;
    assert.equal(remove(body, M), "```\na\n\n\nb\n```");
  });
});

describe("readBlock", () => {
  it("returns the block verbatim so a write can be verified", () => {
    const body = `intro\n\n${block("table")}\n\noutro`;
    assert.equal(readBlock(body, M), block("table"));
  });

  it("returns null when the block is absent", () => {
    assert.equal(readBlock("intro", M), null);
  });
});

describe("locate", () => {
  it("finds the block's line range", () => {
    assert.deepEqual(
      { ...locate(`a\n${block("t")}`, M), lines: undefined },
      { lines: undefined, from: 1, to: 3 },
    );
  });
});
