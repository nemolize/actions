// `README.md` is what `changeset init` writes into the directory; it releases nothing.
const CHANGESET = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;

export const parsePaths = (raw) => {
  const entries = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bad = entries.find((entry) => entry.startsWith("./") || entry.startsWith("/"));
  if (bad !== undefined) {
    throw new Error(`paths entry "${bad}" can never match: write it relative to the repository root, without a leading "./" or "/"`);
  }
  return entries;
};

export const splitNul = (output) => output.split("\0").filter(Boolean);

export const firstShipped = (changed, prefixes) =>
  changed.find((path) => prefixes.some((prefix) => path.startsWith(prefix)));

export const hasNewChangeset = (added) => added.some((path) => CHANGESET.test(path));
