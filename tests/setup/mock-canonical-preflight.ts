import { vi } from "vitest";

vi.mock("../../src/workflow/preflight-canonical.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/workflow/preflight-canonical.js")>();
  return {
    ...actual,
    runCanonicalWorkflowPreflight: vi.fn().mockResolvedValue({
      valid: true,
      violations: [],
      resolvedStatuses: {},
    }),
  };
});
