import { describe, expect, it } from "vitest";
import { parseHarnessMarkers } from "../../src/linear/markers.js";

describe("parseHarnessMarkers", () => {
  it("parses harness marker footer", () => {
    const comment = `Planning complete.

---
harness-orchestrator-v1
phase: planning
run_id: 2026-07-06T20-30-00Z-WES-11
cursor_agent_id: bc-abc123
cursor_run_id: run-456
model: composer-2.5
prompt_version: planning@1
target_repo: https://github.com/weston-uribe/weston-uribe-portfolio
---`;

    const markers = parseHarnessMarkers(comment);

    expect(markers.orchestratorMarker).toBe("harness-orchestrator-v1");
    expect(markers.phase).toBe("planning");
    expect(markers.runId).toBe("2026-07-06T20-30-00Z-WES-11");
    expect(markers.cursorAgentId).toBe("bc-abc123");
    expect(markers.model).toBe("composer-2.5");
  });
});
