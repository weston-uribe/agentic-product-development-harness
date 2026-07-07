import { describe, expect, it } from "vitest";
import { parsePrUrl } from "../../src/github/pr-url.js";

describe("parsePrUrl", () => {
  it("parses a valid GitHub PR URL", () => {
    const parsed = parsePrUrl(
      "https://github.com/weston-uribe/weston-uribe-portfolio/pull/4",
    );

    expect(parsed).toEqual({
      owner: "weston-uribe",
      repo: "weston-uribe-portfolio",
      pullNumber: 4,
      repoUrl: "https://github.com/weston-uribe/weston-uribe-portfolio",
    });
  });

  it("accepts trailing slash", () => {
    const parsed = parsePrUrl(
      "https://github.com/weston-uribe/weston-uribe-portfolio/pull/4/",
    );
    expect(parsed?.pullNumber).toBe(4);
  });

  it("returns null for invalid URLs", () => {
    expect(parsePrUrl("https://github.com/o/r/issues/1")).toBeNull();
    expect(parsePrUrl("not-a-url")).toBeNull();
    expect(parsePrUrl("")).toBeNull();
  });
});
