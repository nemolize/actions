import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectionFromEvent, permissionFor } from "../src/target.mjs";

describe("collectionFromEvent", () => {
  it("routes a pull_request event to the pulls endpoint", () => {
    assert.equal(collectionFromEvent({ pull_request: { number: 7 } }, 7), "pulls");
  });

  it("routes an issue event to the issues endpoint", () => {
    assert.equal(collectionFromEvent({ issue: { number: 7 } }, 7), "issues");
  });

  it("routes a comment on a pull request to the pulls endpoint", () => {
    const payload = { issue: { number: 7, pull_request: { url: "…" } } };
    assert.equal(collectionFromEvent(payload, 7), "pulls");
  });

  it("declines to guess when the number is not the one in the event", () => {
    assert.equal(collectionFromEvent({ pull_request: { number: 7 } }, 8), null);
  });

  it("declines to guess when the event carries neither", () => {
    assert.equal(collectionFromEvent({}, 7), null);
  });
});

describe("permissionFor", () => {
  // A pull request read through /issues needs `issues: write`, which callers
  // granting only `pull-requests: write` do not have.
  it("names the permission each endpoint sits behind", () => {
    assert.equal(permissionFor("pulls"), "pull-requests: write");
    assert.equal(permissionFor("issues"), "issues: write");
  });
});
