import { describe, expect, it } from "vitest";
import { loadAllRubrics } from "../../src/evaluation/rubrics/load.js";
import { validateRubric } from "../../src/evaluation/rubrics/validate.js";

describe("rubric schema and v1 definitions", () => {
  it("loads and validates all v1 rubrics", async () => {
    const rubrics = await loadAllRubrics();
    expect(rubrics.length).toBe(4);
    for (const rubric of rubrics) {
      const result = validateRubric(rubric);
      expect(result.ok).toBe(true);
      expect(rubric.rubricVersion).toBe("1");
      for (const dimension of rubric.dimensions) {
        expect(dimension.anchors.length).toBeGreaterThan(0);
      }
    }
    const ids = rubrics.map((r) => r.rubricId).sort();
    expect(ids).toEqual([
      "implementation-quality",
      "planning-quality",
      "revision-quality",
      "workflow-quality",
    ]);
  });

  it("rejects invalid rubrics", () => {
    const result = validateRubric({
      rubricId: "x",
      rubricVersion: "1",
      name: "x",
      description: "x",
      applicableSubjectTypes: ["phase_execution"],
      applicablePhases: ["implementation"],
      dimensions: [],
    });
    expect(result.ok).toBe(false);
  });
});
