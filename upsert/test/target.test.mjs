import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectionFromEvent, permissionFor } from "../src/target.mjs";

const HERE = "owner/repo";

describe("collectionFromEvent", () => {
  it("routes a pull_request event to the pulls endpoint", () => {
    const payload = { pull_request: { number: 7 } };
    assert.equal(collectionFromEvent(payload, 7, HERE, HERE), "pulls");
  });

  it("routes an issue event to the issues endpoint", () => {
    const payload = { issue: { number: 7 } };
    assert.equal(collectionFromEvent(payload, 7, HERE, HERE), "issues");
  });

  it("routes a comment on a pull request to the pulls endpoint", () => {
    const payload = { issue: { number: 7, pull_request: { url: "…" } } };
    assert.equal(collectionFromEvent(payload, 7, HERE, HERE), "pulls");
  });

  it("declines to guess when the number is not the one in the event", () => {
    const payload = { pull_request: { number: 7 } };
    assert.equal(collectionFromEvent(payload, 8, HERE, HERE), null);
  });

  it("declines to guess when the event carries neither", () => {
    assert.equal(collectionFromEvent({}, 7, HERE, HERE), null);
  });

  it("declines to guess when the target is in another repository", () => {
    const payload = { pull_request: { number: 7 } };
    assert.equal(collectionFromEvent(payload, 7, "owner/other", HERE), null);
  });
});

describe("permissionFor", () => {
  it("names the permission each endpoint sits behind", () => {
    assert.equal(permissionFor("pulls"), "pull-requests: write");
    assert.equal(permissionFor("issues"), "issues: write");
  });
});
