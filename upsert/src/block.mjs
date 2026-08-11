// Marker-delimited blocks inside a markdown document. Every function here is
// pure so the interesting behaviour can be tested without touching the API.

export const markersFor = (marker) => ({
  start: `<!-- ${marker}-start -->`,
  end: `<!-- ${marker}-end -->`,
});

// GitHub stores bodies with CRLF; normalising keeps a re-run from reporting a
// difference against the block this action itself wrote.
export const normalise = (text) => (text ?? "").replaceAll("\r\n", "\n");

export const wrap = (marker, content) => {
  const { start, end } = markersFor(marker);
  const inner = normalise(content).trim();
  return inner ? `${start}\n${inner}\n${end}` : `${start}\n${end}`;
};

// Whole lines only: prose that mentions a marker is describing it, not opening
// a block.
export const locate = (body, marker) => {
  const { start, end } = markersFor(marker);
  const lines = normalise(body).split("\n");
  const from = lines.indexOf(start);
  if (from === -1) {
    if (lines.includes(end)) {
      throw new Error(`found ${end} with no ${start} before it`);
    }
    return null;
  }
  const to = lines.indexOf(end, from + 1);
  if (to === -1) throw new Error(`found ${start} with no matching ${end}`);
  return { lines, from, to };
};

const dropTrailingBlanks = (lines) => {
  const kept = [...lines];
  while (kept.length && kept.at(-1).trim() === "") kept.pop();
  return kept;
};

const dropLeadingBlanks = (lines) => {
  const kept = [...lines];
  while (kept.length && kept[0].trim() === "") kept.shift();
  return kept;
};

const seam = (before, after) => {
  const head = dropTrailingBlanks(before);
  const tail = dropLeadingBlanks(after);
  if (!head.length) return tail.join("\n");
  if (!tail.length) return head.join("\n");
  return [...head, "", ...tail].join("\n");
};

export const upsert = (body, marker, content, position = "append") => {
  const block = wrap(marker, content);
  const found = locate(body, marker);
  if (found) {
    const { lines, from, to } = found;
    return [...lines.slice(0, from), block, ...lines.slice(to + 1)].join("\n");
  }
  const existing = normalise(body).split("\n");
  return position === "prepend"
    ? seam([block], existing)
    : seam(existing, [block]);
};

export const remove = (body, marker) => {
  const found = locate(body, marker);
  if (!found) return normalise(body);
  const { lines, from, to } = found;
  return seam(lines.slice(0, from), lines.slice(to + 1));
};

// The block as it currently stands, markers included, or null when absent.
export const readBlock = (body, marker) => {
  const found = locate(body, marker);
  if (!found) return null;
  return found.lines.slice(found.from, found.to + 1).join("\n");
};
