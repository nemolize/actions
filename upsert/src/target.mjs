// Pull requests are issues, but the two endpoints sit behind different token
// permissions — `/pulls` behind `pull-requests`, `/issues` behind `issues` — so
// the collection has to be picked rather than treated as interchangeable.
export const collectionFromEvent = (payload, number) => {
  if (payload.pull_request?.number === number) return "pulls";
  if (payload.issue?.number === number) {
    return payload.issue.pull_request ? "pulls" : "issues";
  }
  return null;
};

export const permissionFor = (collection) =>
  collection === "pulls" ? "pull-requests: write" : "issues: write";
