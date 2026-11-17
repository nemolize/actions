import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { promisify } from "node:util";
import { firstShipped, hasNewChangeset, parsePaths, splitNul } from "./src/classify.mjs";

const exec = promisify(execFile);

const escapeData = (text) =>
  text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A");

const diff = async (base, ...flags) => {
  try {
    const { stdout } = await exec(
      "git",
      ["diff", "--name-only", "-z", "--no-renames", ...flags, `origin/${base}...HEAD`],
      { maxBuffer: 1 << 28 },
    );
    return splitNul(stdout);
  } catch (error) {
    throw new Error(
      `could not diff against origin/${base}: ${error.stderr?.trim() || error.message}. ` +
        "The check needs actions/checkout with fetch-depth: 0.",
    );
  }
};

const run = async () => {
  const event = process.env["GITHUB_EVENT_NAME"];
  if (event === "pull_request_target") {
    throw new Error(
      "pull_request_target is not supported; only pull_request is checked. " +
        "Run this check from a pull_request workflow.",
    );
  }
  if (event !== "pull_request") {
    console.log("::notice::not a pull_request event; nothing to check");
    return;
  }

  const prefixes = parsePaths(process.env["INPUT_PATHS"] ?? "");
  if (prefixes.length === 0) throw new Error("paths names no path prefix");
  const label = (process.env["INPUT_LABEL"] ?? "").trim();

  const payload = JSON.parse(await readFile(process.env["GITHUB_EVENT_PATH"], "utf8"));
  const labels = (payload.pull_request?.labels ?? []).map((l) => l.name.toLowerCase());
  if (label && labels.includes(label.toLowerCase())) {
    console.log(`::notice::the pull request carries ${label}; no changeset required`);
    return;
  }

  const base = process.env["GITHUB_BASE_REF"];
  if (!base) throw new Error("GITHUB_BASE_REF is empty on a pull_request event");

  const shipped = firstShipped(await diff(base), prefixes);
  if (shipped === undefined) {
    console.log("::notice::no shipped path changed; no changeset required");
    return;
  }
  if (hasNewChangeset(await diff(base, "--diff-filter=A"))) {
    console.log("::notice::the pull request adds a changeset");
    return;
  }

  const skip = label ? `, or label the pull request ${label} to skip this check` : "";
  throw new Error(
    `${shipped} changed without a new changeset. Run 'changeset' (or 'changeset --empty' ` +
      `if nothing ships) and commit the file${skip}.`,
  );
};

run().catch((error) => {
  console.log(`::error::${escapeData(error.message)}`);
  process.exitCode = 1;
});
