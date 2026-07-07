import { describe, expect, it, vi } from "vitest";
import { CursorAgentError } from "@cursor/sdk";
import { sendAndObserve } from "../../src/cursor/run-observer.js";
import { EventLogger } from "../../src/artifacts/events.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PlanningError } from "../../src/runner/errors.js";

function createMockAgent(overrides: {
  send?: () => Promise<unknown>;
  stream?: () => AsyncIterable<{ type: string }>;
  wait?: () => Promise<unknown>;
  agentId?: string;
}) {
  return {
    agentId: overrides.agentId ?? "agent-1",
    send: overrides.send ?? vi.fn(),
    [Symbol.asyncDispose]: async () => undefined,
  };
}

describe("sendAndObserve", () => {
  it("classifies startup CursorAgentError as cursor_api_failure", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "harness-observer-"));
    const events = new EventLogger(dir);
    await events.init();

    const agent = createMockAgent({
      send: vi.fn().mockRejectedValue(new CursorAgentError("auth failed")),
    });

    await expect(
      sendAndObserve(agent as never, "prompt", dir, events),
    ).rejects.toMatchObject({
      classification: "cursor_api_failure",
    });

    await rm(dir, { recursive: true, force: true });
  });

  it("classifies failed run status as cursor_run_failed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "harness-observer-"));
    const events = new EventLogger(dir);
    await events.init();

    const agent = createMockAgent({
      send: vi.fn().mockResolvedValue({
        id: "run-1",
        stream: async function* () {
          yield { type: "message" };
        },
        wait: vi.fn().mockResolvedValue({
          id: "run-1",
          status: "error",
          durationMs: 100,
          error: { message: "run failed" },
        }),
      }),
    });

    await expect(
      sendAndObserve(agent as never, "prompt", dir, events),
    ).rejects.toBeInstanceOf(PlanningError);

    await rm(dir, { recursive: true, force: true });
  });

  it("returns assistant text on successful run", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "harness-observer-"));
    const events = new EventLogger(dir);
    await events.init();

    const agent = createMockAgent({
      send: vi.fn().mockResolvedValue({
        id: "run-2",
        stream: async function* () {
          yield { type: "message" };
        },
        wait: vi.fn().mockResolvedValue({
          id: "run-2",
          status: "completed",
          durationMs: 200,
          result: "## Implementation plan\n\nStep 1",
          git: { branches: [] },
        }),
      }),
    });

    const observed = await sendAndObserve(agent as never, "prompt", dir, events);
    expect(observed.assistantText).toContain("Implementation plan");
    expect(observed.runId).toBe("run-2");

    await rm(dir, { recursive: true, force: true });
  });
});
