import { describe, expect, it } from "vitest";
import {
  resolveBuilderThreadMarkerEvidence,
  resolveBuilderThreadReference,
} from "../../src/runner/builder-thread-lineage.js";

const ORCHESTRATOR = "harness-orchestrator-v1";
const TARGET_REPO = "https://github.com/owner/example-target-app";
const PR_URL = "https://github.com/owner/example-target-app/pull/4";

function markerComment(body: string, createdAt = "2026-07-07T10:00:00.000Z") {
  return { id: `comment-${Math.random()}`, body, createdAt };
}

describe("resolveBuilderThreadReference", () => {
  it("prefers explicit builder_agent_id on handoff markers", () => {
    const comments = [
      markerComment(`<!--\n${ORCHESTRATOR}\nphase: handoff\nrun_id: handoff-1\nbuilder_agent_id: bc-builder-1\nbuilder_thread_generation: 1\nbuilder_thread_action: created\nbuilder_origin_run_id: impl-1\ntarget_repo: ${TARGET_REPO}\npr_url: ${PR_URL}\nbranch: cursor/wes-13\n-->`),
    ];
    const reference = resolveBuilderThreadReference({
      comments,
      orchestratorMarker: ORCHESTRATOR,
      issueKey: "WES-13",
      targetRepo: TARGET_REPO,
      prUrl: PR_URL,
      branch: "cursor/wes-13",
    });
    expect(reference?.agentId).toBe("bc-builder-1");
    expect(reference?.generation).toBe(1);
  });

  it("falls back to legacy implementation_start cursor_agent_id", () => {
    const comments = [
      markerComment(`<!--\n${ORCHESTRATOR}\nphase: implementation_start\nrun_id: impl-1\ncursor_agent_id: bc-legacy-1\ntarget_repo: ${TARGET_REPO}\nbranch: cursor/wes-13\n-->`),
    ];
    const reference = resolveBuilderThreadReference({
      comments,
      orchestratorMarker: ORCHESTRATOR,
      issueKey: "WES-13",
      targetRepo: TARGET_REPO,
      branch: "cursor/wes-13",
    });
    expect(reference?.agentId).toBe("bc-legacy-1");
  });

  it("selects the highest valid generation", () => {
    const comments = [
      markerComment(
        `<!--\n${ORCHESTRATOR}\nphase: revision\nrun_id: rev-1\nbuilder_agent_id: bc-builder-1\nbuilder_thread_generation: 1\nbuilder_thread_action: created\nbuilder_origin_run_id: impl-1\ntarget_repo: ${TARGET_REPO}\npr_url: ${PR_URL}\n-->`,
        "2026-07-07T09:00:00.000Z",
      ),
      markerComment(
        `<!--\n${ORCHESTRATOR}\nphase: revision\nrun_id: rev-2\nbuilder_agent_id: bc-builder-2\nbuilder_thread_generation: 2\nbuilder_thread_action: replaced\nbuilder_origin_run_id: impl-1\nprevious_builder_agent_id: bc-builder-1\ntarget_repo: ${TARGET_REPO}\npr_url: ${PR_URL}\n-->`,
        "2026-07-07T10:00:00.000Z",
      ),
    ];
    const reference = resolveBuilderThreadReference({
      comments,
      orchestratorMarker: ORCHESTRATOR,
      issueKey: "WES-13",
      targetRepo: TARGET_REPO,
      prUrl: PR_URL,
    });
    expect(reference?.agentId).toBe("bc-builder-2");
    expect(reference?.generation).toBe(2);
  });

  it("rejects mismatched PR lineage", () => {
    const comments = [
      markerComment(`<!--\n${ORCHESTRATOR}\nphase: handoff\nrun_id: handoff-1\nbuilder_agent_id: bc-builder-1\nbuilder_thread_generation: 1\ntarget_repo: ${TARGET_REPO}\npr_url: ${PR_URL}\n-->`),
    ];
    const reference = resolveBuilderThreadReference({
      comments,
      orchestratorMarker: ORCHESTRATOR,
      issueKey: "WES-13",
      targetRepo: TARGET_REPO,
      prUrl: "https://github.com/owner/example-target-app/pull/99",
    });
    expect(reference).toBeNull();
  });

  it("ignores spoofed ordinary user comments", () => {
    const comments = [
      markerComment("Please fix this.\n\ncursor_agent_id: bc-spoofed"),
    ];
    const reference = resolveBuilderThreadReference({
      comments,
      orchestratorMarker: ORCHESTRATOR,
      issueKey: "WES-13",
      targetRepo: TARGET_REPO,
    });
    expect(reference).toBeNull();
  });
});

describe("resolveBuilderThreadMarkerEvidence", () => {
  it("returns marker evidence for the canonical builder", () => {
    const comments = [
      markerComment(`<!--\n${ORCHESTRATOR}\nphase: revision_start\nrun_id: rev-1\nbuilder_agent_id: bc-builder-1\nbuilder_thread_generation: 1\nbuilder_thread_action: resumed\nbuilder_origin_run_id: impl-1\nbuilder_thread_idempotency_key: p-dev:revision:WES-13:fb-1\ntarget_repo: ${TARGET_REPO}\n-->`),
    ];
    const evidence = resolveBuilderThreadMarkerEvidence({
      comments,
      orchestratorMarker: ORCHESTRATOR,
      issueKey: "WES-13",
      targetRepo: TARGET_REPO,
    });
    expect(evidence).toEqual({
      builderAgentId: "bc-builder-1",
      builderThreadGeneration: 1,
      builderThreadAction: "resumed",
      builderOriginRunId: "impl-1",
      builderThreadIdempotencyKey: "p-dev:revision:WES-13:fb-1",
      previousBuilderAgentId: undefined,
      builderThreadReplacementReason: undefined,
    });
  });
});
