import { describe, expect, it } from "vitest";
import {
  FIXTURE_MODEL_CATALOG_CAPTURED_AT,
  FIXTURE_MODEL_CATALOG_LIMITATION,
  getFixtureModelCatalog,
} from "../../src/operations/fixtures/model-catalog-snapshot.js";

describe("fixture model catalog snapshot", () => {
  it("returns a deterministic catalog with capture metadata", () => {
    const first = getFixtureModelCatalog();
    const second = getFixtureModelCatalog();
    expect(first).toEqual(second);
    expect(first[0]?.fetchedAt).toBe(FIXTURE_MODEL_CATALOG_CAPTURED_AT);
    expect(FIXTURE_MODEL_CATALOG_LIMITATION).toMatch(/verified Cursor.models.list/i);
  });
});
