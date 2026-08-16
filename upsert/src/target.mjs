// Pull requests are issues, but the two endpoints sit behind different token
// permissions, so the collection has to be picked rather than guessed.
export const collectionFromEvent = (payload, number, repository, eventRepository) => {
  // Numbers are per-repository, so the event answers for its own only.
  if (repository !== eventRepository) return null;
  if (payload.pull_request?.number === number) return "pulls";
  if (payload.issue?.number === number) {
    return payload.issue.pull_request ? "pulls" : "issues";
  }
  return null;
};

export const permissionFor = (collection) =>
  collection === "pulls" ? "pull-requests: write" : "issues: write";
