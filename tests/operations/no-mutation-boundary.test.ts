import { describe, expect, it } from "vitest";
import { resolveOperationsSourceContext } from "../../src/operations/source-context.js";
import { buildOperationsBootstrap } from "../../src/operations/bootstrap.js";

describe("operations no-mutation boundary", () => {
  it("rejects fixture requests without server opt-in", () => {
    const context = resolveOperationsSourceContext(
      { source: "fixture", fixture: "branching-pr-review" },
      {},
    );
    expect(context.rejectionReason).toMatch(/P_DEV_OPERATIONS_FIXTURES=1/);
  });

  it("returns sanitized bootstrap rejection without credentials", async () => {
    const payload = await buildOperationsBootstrap({
      cwd: "/tmp/unused",
      context: resolveOperationsSourceContext(
        { source: "fixture", fixture: "branching-pr-review" },
        {},
      ),
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/apiKey|CURSOR_API_KEY|LINEAR_API_KEY|secret/i);
    expect(payload.validation.errors.length).toBeGreaterThan(0);
  });
});
