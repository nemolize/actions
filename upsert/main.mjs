import process from "node:process";
import { boolean, choice, event, fail, input, notice, setOutput } from "./src/actions.mjs";
import { normalise, readBlock, remove, upsert, wrap } from "./src/block.mjs";
import { detectCollection, readBody, writeBody } from "./src/github.mjs";
import { collectionFromEvent } from "./src/target.mjs";

const ATTEMPTS = 3;

const stop = (message) => {
  notice(message);
  setOutput("changed", "false");
  process.exit(0);
};

const run = async () => {
  const marker = input("marker").trim();
  if (!marker) throw new Error("marker is required");
  if (/\s/.test(marker)) {
    throw new Error(`marker must not contain whitespace, got "${marker}"`);
  }

  choice("target", ["body", "comment"], ["body"]);
  const mode = choice("mode", ["upsert", "remove"]);
  const position = choice("position", ["append", "prepend"]);
  const onEmpty = choice("on-empty", ["remove", "skip"]);
  const skipForks = boolean("skip-forks");
  const token = input("github-token");
  if (!token) throw new Error("github-token is required");

  const payload = event();
  const repository = input("repository").trim() || process.env["GITHUB_REPOSITORY"];
  const requested = input("number").trim();
  const number = requested
    ? Number(requested)
    : (payload.pull_request?.number ?? payload.issue?.number);

  if (!Number.isInteger(number) || number <= 0) {
    if (requested) throw new Error(`number must be a positive integer, got "${requested}"`);
    stop("no pull request or issue to write to; nothing to do");
  }
  if (!repository) throw new Error("repository is required outside a workflow run");

  // A fork's token is read-only, so the write below could only fail.
  const eventPr = payload.pull_request;
  const targetsEventPr =
    eventPr?.number === number && repository === process.env["GITHUB_REPOSITORY"];
  if (skipForks && targetsEventPr && eventPr.head?.repo?.full_name !== repository) {
    stop("pull request comes from a fork, whose token cannot write; nothing to do");
  }

  const collection =
    collectionFromEvent(payload, number) ??
    (await detectCollection(token, repository, number));

  const content = normalise(input("body")).trim();
  let removing = mode === "remove";
  if (!removing && !content) {
    if (onEmpty === "skip") stop(`no content for ${marker}; leaving the body unchanged`);
    removing = true;
    notice(`no content for ${marker}; removing the block`);
  }

  const apply = (body) =>
    removing ? remove(body, marker) : upsert(body, marker, content, position);
  const settled = (body) =>
    removing
      ? readBlock(body, marker) === null
      : readBlock(body, marker) === wrap(marker, content);

  let changed = false;
  let done = false;

  for (let attempt = 1; attempt <= ATTEMPTS && !done; attempt++) {
    const current = normalise(await readBody(token, repository, collection, number));
    const next = apply(current);

    if (next === current) {
      if (!changed) {
        notice(removing ? `no ${marker} block to remove` : `${marker} block already current`);
      }
      done = true;
      break;
    }

    await writeBody(token, repository, collection, number, next);
    changed = true;

    // Another job owning a different block races us through its own
    // read-modify-write, so confirm ours survived before calling it done.
    if (settled(normalise(await readBody(token, repository, collection, number)))) {
      done = true;
      break;
    }
    notice(`#${number} was written by something else at the same time; retrying`);
  }

  if (!done) {
    throw new Error(
      `could not settle the ${marker} block on #${number} after ${ATTEMPTS} attempts`,
    );
  }

  setOutput("changed", String(changed));
  setOutput("number", String(number));
};

run().catch(fail);
