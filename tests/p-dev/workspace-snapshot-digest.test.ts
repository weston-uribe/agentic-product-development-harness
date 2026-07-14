import { describe, expect, it } from "vitest";
import {
  computeGitBlobSha1,
  computeGitTreeSha1,
} from "../../src/p-dev/workspace-snapshot-git.js";
import {
  computeSnapshotContentId,
  computeSnapshotSha256,
} from "../../src/p-dev/workspace-snapshot-digest.js";

describe("workspace snapshot digest", () => {
  it("computes stable git blob and tree shas", () => {
    const content = Buffer.from("hello\n", "utf8");
    const blobSha = computeGitBlobSha1(content);
    expect(blobSha).toMatch(/^[0-9a-f]{40}$/);

    const treeSha = computeGitTreeSha1([
      { mode: "100644", path: "README.md", sha1: blobSha },
    ]);
    expect(treeSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("computes deterministic snapshot digest and content id", () => {
    const files = [
      {
        path: "README.md",
        type: "file" as const,
        mode: "100644",
        size: 5,
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        gitBlobSha1: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      {
        path: "src/index.ts",
        type: "file" as const,
        mode: "100644",
        size: 10,
        sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        gitBlobSha1: "dddddddddddddddddddddddddddddddddddddddd",
      },
    ];

    const digestA = computeSnapshotSha256(files);
    const digestB = computeSnapshotSha256([...files].reverse());
    expect(digestA).toBe(digestB);

    const contentId = computeSnapshotContentId({
      packageVersion: "0.3.0",
      sourceCommit: "1".repeat(40),
      snapshotSha256: digestA,
    });
    expect(contentId).toMatch(/^[0-9a-f]{64}$/);
  });
});
