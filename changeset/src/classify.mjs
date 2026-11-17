// `README.md` is what `changeset init` writes into the directory; it releases nothing.
const CHANGESET = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;

// `[` and `{` are left out: they occur in real directory names such as `app/[id]/`.
const GLOB = /[*?]/;

export const parsePaths = (raw) => {
  const entries = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const entry of entries) {
    if (entry.startsWith("./") || entry.startsWith("/")) {
      throw new Error(`paths entry "${entry}" can never match: write it relative to the repository root, without a leading "./" or "/"`);
    }
    if (GLOB.test(entry)) {
      throw new Error(`paths entry "${entry}" is a glob: paths takes literal prefixes, write "src/" rather than "src/**"`);
    }
  }
  return entries;
};

export const splitNul = (output) => output.split("\0").filter(Boolean);

export const firstShipped = (changed, prefixes) =>
  changed.find((path) => prefixes.some((prefix) => path.startsWith(prefix)));

export const hasNewChangeset = (added) => added.some((path) => CHANGESET.test(path));
