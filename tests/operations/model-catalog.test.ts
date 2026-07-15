import { describe, expect, it } from "vitest";
import {
  buildModelCatalogFingerprint,
  normalizeCursorModelCatalog,
} from "../../src/operations/model-catalog-utils.js";

describe("model catalog", () => {
  it("normalizes Cursor model parameters", () => {
    const catalog = normalizeCursorModelCatalog(
      [
        {
          id: "composer-2.5",
          displayName: "Composer 2.5",
          parameters: [
            {
              id: "fast",
              label: "Fast",
              type: "boolean",
              allowedValues: ["true", "false"],
              defaultValue: "true",
            },
          ],
        },
      ],
      "fixture",
      "2026-01-01T00:00:00.000Z",
    );
    expect(catalog[0]?.supportedParameters[0]?.id).toBe("fast");
    expect(buildModelCatalogFingerprint(catalog)).toMatch(/^[a-f0-9]{64}$/);
  });
});
