// Pull requests are issues, but the two endpoints sit behind different token
// permissions, so the collection has to be picked rather than treated as
// interchangeable. A number alone does not identify the target: #42 of another
// repository is a different thing from the event's own #42, so the event only
// answers for its own repository.
export const collectionFromEvent = (payload, number, repository, eventRepository) => {
  if (repository !== eventRepository) return null;
  if (payload.pull_request?.number === number) return "pulls";
  if (payload.issue?.number === number) {
    return payload.issue.pull_request ? "pulls" : "issues";
  }
  return null;
};

export const permissionFor = (collection) =>
  collection === "pulls" ? "pull-requests: write" : "issues: write";
