import { hasImplementationCompletionMarker } from "./comments.js";
import type { LinearCommentRecord } from "./writer.js";

export function findLatestImplementationComment(
  comments: LinearCommentRecord[],
  orchestratorMarker: string,
): LinearCommentRecord | null {
  const implementationComments = comments.filter((comment) =>
    hasImplementationCompletionMarker(comment.body, orchestratorMarker),
  );

  implementationComments.sort((a, b) => {
    const aTime = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bTime = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bTime - aTime;
  });

  return implementationComments[0] ?? null;
}
