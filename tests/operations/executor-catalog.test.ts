import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_EXECUTOR_IDS,
  getExecutorCatalog,
  getNestedCapabilities,
  isAssignableExecutorId,
  isStatusTransitionExecutor,
} from "../../src/operations/executor-catalog.js";

describe("executor catalog", () => {
  it("exposes only assignable status-transition executors in the canvas catalog", () => {
    const catalog = getExecutorCatalog();
    expect(catalog.every((entry) => entry.triggerScope === "status-transition")).toBe(
      true,
    );
    expect(catalog.map((entry) => entry.id)).toEqual([...ASSIGNABLE_EXECUTOR_IDS]);
  });

  it("keeps integration-repair and production-sync out of assignable executors", () => {
    expect(isAssignableExecutorId("integration-repair")).toBe(false);
    expect(isAssignableExecutorId("production-sync")).toBe(false);
    expect(isStatusTransitionExecutor("merge-runner")).toBe(true);
  });

  it("discloses integration repair under merge runner and production sync as external", () => {
    const nested = getNestedCapabilities();
    expect(nested.find((entry) => entry.id === "integration-repair")?.ownerExecutorId).toBe(
      "merge-runner",
    );
    expect(nested.find((entry) => entry.id === "production-sync")?.triggerScope).toBe(
      "external-system",
    );
  });
});
