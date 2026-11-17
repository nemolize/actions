// `README.md` is what `changeset init` writes into the directory; it releases nothing.
const CHANGESET = /^\.changeset\/(?!README\.md$)[^/]+\.md$/;

export const parsePaths = (raw) =>
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export const splitNul = (output) => output.split("\0").filter(Boolean);

export const firstShipped = (changed, prefixes) =>
  changed.find((path) => prefixes.some((prefix) => path.startsWith(prefix)));

export const hasNewChangeset = (added) => added.some((path) => CHANGESET.test(path));
