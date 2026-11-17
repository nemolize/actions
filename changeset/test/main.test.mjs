import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const MAIN = fileURLToPath(new URL("../main.mjs", import.meta.url));
const ACTION = fileURLToPath(new URL("../action.yml", import.meta.url));
const run = promisify(execFile);

const GIT_ENV = {
  PATH: process.env.PATH,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "t",
  GIT_AUTHOR_EMAIL: "t@example.com",
  GIT_COMMITTER_NAME: "t",
  GIT_COMMITTER_EMAIL: "t@example.com",
};

const eventDir = await mkdtemp(join(tmpdir(), "changeset-event-"));
const dirs = [eventDir];
after(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))));

const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: GIT_ENV });

const write = async (root, path, text = "x\n") => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
};

const repo = async ({ base = {}, change }) => {
  const root = await mkdtemp(join(tmpdir(), "changeset-"));
  dirs.push(root);
  git(root, "init", "-q", "-b", "main");
  await write(root, "README.md");
  for (const [path, text] of Object.entries(base)) await write(root, path, text);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "base");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(root, "checkout", "-q", "-b", "feature");
  await change(root);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "change");
  return root;
};

const check = async (cwd, { paths = "src/", label = "skip-changeset", labels = [], event } = {}) => {
  const payload = join(eventDir, "event.json");
  await writeFile(payload, JSON.stringify({ pull_request: { labels: labels.map((name) => ({ name })) } }));
  const { stdout, code } = await run(process.execPath, [MAIN], {
    cwd,
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GITHUB_EVENT_NAME: event ?? "pull_request",
      GITHUB_EVENT_PATH: payload,
      GITHUB_BASE_REF: "main",
      INPUT_PATHS: paths,
      INPUT_LABEL: label,
    },
  }).then(
    (r) => ({ ...r, code: 0 }),
    (e) => e,
  );
  return { stdout, code };
};

describe("a pull request that changes a shipped path", () => {
  it("fails without a changeset", async () => {
    const root = await repo({ change: (r) => write(r, "src/a.js") });
    const { stdout, code } = await check(root);
    assert.equal(code, 1);
    assert.match(stdout, /::error::src\/a\.js changed without a new changeset/);
    assert.match(stdout, /label the pull request skip-changeset/);
  });

  it("passes with a new changeset", async () => {
    const root = await repo({
      change: async (r) => {
        await write(r, "src/a.js");
        await write(r, ".changeset/x.md");
      },
    });
    const { stdout, code } = await check(root);
    assert.equal(code, 0);
    assert.match(stdout, /::notice::the pull request adds a changeset/);
  });

  it("fails when the only file added to .changeset is its README", async () => {
    const root = await repo({
      change: async (r) => {
        await write(r, "src/a.js");
        await write(r, ".changeset/README.md");
      },
    });
    assert.equal((await check(root)).code, 1);
  });

  it("fails when an existing changeset was only modified", async () => {
    const root = await repo({
      base: { ".changeset/x.md": "old\n" },
      change: async (r) => {
        await write(r, "src/a.js");
        await write(r, ".changeset/x.md", "new\n");
      },
    });
    assert.equal((await check(root)).code, 1);
  });

  it("counts a changeset moved to a new name as added", async () => {
    const root = await repo({
      base: { ".changeset/old.md": "x\n" },
      change: async (r) => {
        await write(r, "src/a.js");
        await rename(join(r, ".changeset/old.md"), join(r, ".changeset/new.md"));
      },
    });
    assert.equal((await check(root)).code, 0);
  });

  it("matches a path holding a space", async () => {
    const root = await repo({ change: (r) => write(r, "src/a b.js") });
    const { stdout, code } = await check(root);
    assert.equal(code, 1);
    assert.match(stdout, /src\/a b\.js changed/);
  });

  it("cannot be made to forge a workflow command through a newline in a path", async () => {
    const root = await repo({ change: (r) => write(r, "src/x\n::error::forged") });
    const { stdout } = await check(root);
    assert.deepEqual(
      stdout.trim().split("\n").filter((line) => line.startsWith("::")),
      [stdout.trim().split("\n")[0]],
    );
    assert.match(stdout, /src\/x%0A::error::forged changed/);
  });

  it("matches any of several prefixes", async () => {
    const root = await repo({ change: (r) => write(r, "packages/a/index.js") });
    assert.equal((await check(root, { paths: "src/\n\npackages/\n" })).code, 1);
  });
});

describe("a pull request that changes nothing shipped", () => {
  it("passes when the path only ends in a prefix", async () => {
    const root = await repo({ change: (r) => write(r, "docs/src/a.js") });
    const { stdout, code } = await check(root);
    assert.equal(code, 0);
    assert.match(stdout, /::notice::no shipped path changed/);
  });
});

describe("the skip label", () => {
  it("passes without reading the diff", async () => {
    const root = await repo({ change: (r) => write(r, "src/a.js") });
    git(root, "update-ref", "-d", "refs/remotes/origin/main");
    const { stdout, code } = await check(root, { labels: ["skip-changeset"] });
    assert.equal(code, 0);
    assert.match(stdout, /::notice::the pull request carries skip-changeset/);
  });

  it("matches without regard to case, as the workflow expression it replaces did", async () => {
    const root = await repo({ change: (r) => write(r, "src/a.js") });
    assert.equal((await check(root, { labels: ["Skip-Changeset"] })).code, 0);
    assert.equal((await check(root, { label: "SKIP-CHANGESET", labels: ["skip-changeset"] })).code, 0);
  });

  it("is the one named by the label input", async () => {
    const root = await repo({ change: (r) => write(r, "src/a.js") });
    assert.equal((await check(root, { label: "no-release", labels: ["skip-changeset"] })).code, 1);
    assert.equal((await check(root, { label: "no-release", labels: ["no-release"] })).code, 0);
  });

  it("is disabled by a blank label input", async () => {
    const root = await repo({ change: (r) => write(r, "src/a.js") });
    const { stdout, code } = await check(root, { label: "", labels: [""] });
    assert.equal(code, 1);
    assert.doesNotMatch(stdout, /label the pull request/);
  });
});

describe("what the check refuses to guess", () => {
  it("passes with a notice on an event that is not a pull request", async () => {
    const root = await mkdtemp(join(tmpdir(), "changeset-"));
    dirs.push(root);
    const { stdout, code } = await check(root, { event: "push" });
    assert.equal(code, 0);
    assert.match(stdout, /::notice::not a pull_request event/);
  });

  it("passes with a notice on workflow_dispatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "changeset-"));
    dirs.push(root);
    const { stdout, code } = await check(root, { event: "workflow_dispatch" });
    assert.equal(code, 0);
    assert.match(stdout, /::notice::not a pull_request event/);
  });

  for (const labels of [[], ["skip-changeset"]]) {
    it(`fails on pull_request_target, with labels [${labels}]`, async () => {
      const root = await repo({ change: (r) => write(r, "src/a.js") });
      const { stdout, code } = await check(root, { event: "pull_request_target", labels });
      assert.equal(code, 1);
      assert.match(stdout, /::error::pull_request_target is not supported; only pull_request is checked/);
    });
  }

  it("fails when paths names nothing", async () => {
    const root = await repo({ change: (r) => write(r, "src/a.js") });
    const { stdout, code } = await check(root, { paths: " \n\n" });
    assert.equal(code, 1);
    assert.match(stdout, /::error::paths names no path prefix/);
  });

  it("fails rather than passing when an entry can never match", async () => {
    const root = await repo({ change: (r) => write(r, "src/a.js") });
    const { stdout, code } = await check(root, { paths: "./src/" });
    assert.equal(code, 1);
    assert.match(stdout, /::error::paths entry "\.\/src\/" can never match/);
  });

  it("fails rather than passing when an entry is a glob, even with the skip label", async () => {
    const root = await repo({ change: (r) => write(r, "src/a.js") });
    const { stdout, code } = await check(root, { paths: "src/**", labels: ["skip-changeset"] });
    assert.equal(code, 1);
    assert.match(stdout, /::error::paths entry "src\/\*\*" is a glob/);
  });

  it("checks an entry containing [ ] as the literal prefix it is", async () => {
    const root = await repo({ change: (r) => write(r, "app/[id]/page.js") });
    const { stdout, code } = await check(root, { paths: "app/[id]/" });
    assert.equal(code, 1);
    assert.match(stdout, /::error::app\/\[id\]\/page\.js changed without a new changeset/);
  });

  it("fails naming fetch-depth when the base ref is not there", async () => {
    const root = await repo({ change: (r) => write(r, "src/a.js") });
    git(root, "update-ref", "-d", "refs/remotes/origin/main");
    const { stdout, code } = await check(root);
    assert.equal(code, 1);
    assert.match(stdout, /::error::could not diff against origin\/main:.*fetch-depth: 0/);
  });
});

describe("action.yml", () => {
  it("hands main.mjs the inputs it reads", async () => {
    const yml = await readFile(ACTION, "utf8");
    assert.match(yml, /INPUT_PATHS: \$\{\{ inputs\.paths \}\}/);
    assert.match(yml, /INPUT_LABEL: \$\{\{ inputs\.label \}\}/);
    assert.match(yml, /run: node "\$GITHUB_ACTION_PATH\/main\.mjs"/);
  });

  it("defaults the inputs to src/ and skip-changeset", async () => {
    const yml = await readFile(ACTION, "utf8");
    assert.match(yml, /paths:[\s\S]*?default: src\//);
    assert.match(yml, /label:[\s\S]*?default: skip-changeset/);
  });
});
