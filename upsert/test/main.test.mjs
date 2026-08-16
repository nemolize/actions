import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const MAIN = fileURLToPath(new URL("../main.mjs", import.meta.url));
const run = promisify(execFile);

// Everything main.mjs needs to reach the number check. The token is a stub:
// a rejected number never gets as far as a request.
const withNumber = (number) =>
  run(process.execPath, [MAIN], {
    env: {
      PATH: process.env.PATH,
      INPUT_MARKER: "wiring",
      INPUT_BODY: "x",
      INPUT_NUMBER: number,
      INPUT_REPOSITORY: "owner/repo",
      "INPUT_GITHUB-TOKEN": "stub",
      GITHUB_REPOSITORY: "owner/repo",
    },
  });

describe("main.mjs number wiring", () => {
  it("refuses a literal that bare `Number` would have accepted", async () => {
    // Pins the wiring, not the helper: with `Number(requested)` here, `0x2A`
    // reaches the API as issue 42.
    const { stdout } = await withNumber("0x2A").catch((error) => error);
    assert.match(stdout, /::error::number must be a positive integer, got "0x2A"/);
  });

  it("refuses a number past the uniquely representable range", async () => {
    const { stdout } = await withNumber((2n ** 53n + 1n).toString()).catch((error) => error);
    assert.match(stdout, /::error::number must be a positive integer/);
  });

  it("no-ops rather than failing when no number is available anywhere", async () => {
    const { stdout } = await withNumber("");
    assert.match(stdout, /::notice::no pull request or issue to write to/);
  });
});
