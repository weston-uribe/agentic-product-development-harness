import { describe, expect, it } from "vitest";
import {
  normalizeRepoUrl,
  repoUrlsEquivalent,
  isValidGithubRepoUrl,
} from "../../src/resolver/normalize-repo.js";

describe("normalizeRepoUrl", () => {
  const canonical = "https://github.com/weston-uribe/weston-uribe-portfolio";

  it.each([
    ["https://github.com/weston-uribe/weston-uribe-portfolio", canonical],
    ["https://github.com/weston-uribe/weston-uribe-portfolio/", canonical],
    ["github.com/weston-uribe/weston-uribe-portfolio", canonical],
    ["github.com/weston-uribe/weston-uribe-portfolio/", canonical],
    ["weston-uribe/weston-uribe-portfolio", canonical],
    ["weston-uribe/weston-uribe-portfolio/", canonical],
    ["http://github.com/weston-uribe/weston-uribe-portfolio", canonical],
  ])("normalizes %s to canonical https URL", (input, expected) => {
    expect(normalizeRepoUrl(input)).toBe(expected);
  });

  it("treats equivalent forms as the same repo", () => {
    expect(
      repoUrlsEquivalent(
        "github.com/weston-uribe/weston-uribe-portfolio",
        "https://github.com/weston-uribe/weston-uribe-portfolio",
      ),
    ).toBe(true);
    expect(
      repoUrlsEquivalent(
        "weston-uribe/weston-uribe-portfolio",
        "https://github.com/weston-uribe/weston-uribe-portfolio/",
      ),
    ).toBe(true);
  });

  it("validates canonical github URLs", () => {
    expect(isValidGithubRepoUrl(canonical)).toBe(true);
    expect(isValidGithubRepoUrl("github.com/weston-uribe/weston-uribe-portfolio")).toBe(
      false,
    );
  });
});
