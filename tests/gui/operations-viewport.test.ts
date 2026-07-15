import { describe, expect, it } from "vitest";
import {
  mergeViewportIfChanged,
  normalizeViewport,
  shouldInitialFit,
  viewportsEqual,
} from "../../apps/gui/lib/operations/reducer.ts";

describe("operations viewport helpers", () => {
  it("compares viewports for equality", () => {
    expect(viewportsEqual({ x: 1, y: 2, zoom: 1 }, { x: 1, y: 2, zoom: 1 })).toBe(true);
    expect(viewportsEqual({ x: 1, y: 2, zoom: 1 }, { x: 2, y: 2, zoom: 1 })).toBe(false);
  });

  it("decides initial fit only for default viewport", () => {
    expect(shouldInitialFit(undefined)).toBe(true);
    expect(shouldInitialFit({ x: 0, y: 0, zoom: 1 })).toBe(true);
    expect(shouldInitialFit({ x: 10, y: 0, zoom: 1 })).toBe(false);
  });

  it("no-ops mergeViewport when unchanged", () => {
    const layout = {
      statusPositions: {},
      viewport: { x: 5, y: 6, zoom: 0.8 },
    };
    const merged = mergeViewportIfChanged(layout, { x: 5, y: 6, zoom: 0.8 });
    expect(merged).toBe(layout);
  });

  it("normalizes viewport floats before comparing", () => {
    expect(
      viewportsEqual(
        { x: 1.0000004, y: 2, zoom: 0.8000001 },
        { x: 1, y: 2, zoom: 0.8 },
      ),
    ).toBe(true);
    expect(normalizeViewport({ x: 1.2345678, y: -2.3456789, zoom: 0.87654321 })).toEqual({
      x: 1.235,
      y: -2.346,
      zoom: 0.877,
    });
  });
});
