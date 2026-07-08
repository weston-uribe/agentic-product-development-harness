import { describe, expect, it, vi } from "vitest";
import { disposeCloudAgent } from "../../src/cursor/agent-factory.js";

describe("disposeCloudAgent", () => {
  it("does not hang when agent disposal never resolves", async () => {
    vi.useFakeTimers();

    const agent = {
      [Symbol.asyncDispose]: vi.fn().mockImplementation(
        () => new Promise<void>(() => undefined),
      ),
    };

    const disposePromise = disposeCloudAgent(agent as never);
    await vi.advanceTimersByTimeAsync(10_000);
    await disposePromise;

    expect(agent[Symbol.asyncDispose]).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
