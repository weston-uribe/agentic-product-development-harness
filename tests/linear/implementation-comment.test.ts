import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findLatestImplementationComment } from "../../src/linear/implementation-comment.js";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/linear",
);

describe("findLatestImplementationComment", () => {
  it("returns the newest implementation marker comment by createdAt", async () => {
    const wes13Body = await readFile(
      path.join(fixturesDir, "implementation-comment-wes-13.md"),
      "utf8",
    );

    const comments = [
      {
        id: "older",
        body: `## Implementation summary\n\nFirst run\n---\nharness-orchestrator-v1\nphase: implementation\nrun_id: run-old\npr_url: https://github.com/o/r/pull/1\n---`,
        createdAt: "2026-07-06T10:00:00.000Z",
      },
      {
        id: "newer",
        body: wes13Body,
        createdAt: "2026-07-07T04:50:00.000Z",
      },
    ];

    const latest = findLatestImplementationComment(
      comments,
      "harness-orchestrator-v1",
    );

    expect(latest?.id).toBe("newer");
    expect(latest?.body).toContain("pull/4");
  });

  it("returns null when no implementation marker exists", () => {
    const latest = findLatestImplementationComment(
      [{ id: "c1", body: "plain comment" }],
      "harness-orchestrator-v1",
    );

    expect(latest).toBeNull();
  });
});
