import { describe, expect, it } from "vitest";
import { assertRepoAllowed } from "../../src/resolver/allowed-repos.js";
import { ResolverError } from "../../src/resolver/errors.js";
import type { HarnessConfig } from "../../src/config/types.js";

const config: HarnessConfig = {
  version: 1,
  orchestratorMarker: "harness-orchestrator-v1",
  logDirectory: "runs",
  repos: [
    {
      id: "portfolio",
      targetRepo: "https://github.com/weston-uribe/weston-uribe-portfolio",
      baseBranch: "main",
    },
  ],
  allowedTargetRepos: [
    "https://github.com/weston-uribe/weston-uribe-portfolio",
  ],
};

describe("assertRepoAllowed", () => {
  it("allows configured repo", () => {
    expect(() =>
      assertRepoAllowed(
        "https://github.com/weston-uribe/weston-uribe-portfolio",
        config,
      ),
    ).not.toThrow();
  });

  it("denies unknown repo", () => {
    expect(() =>
      assertRepoAllowed("https://github.com/example/forbidden", config),
    ).toThrowError(ResolverError);

    try {
      assertRepoAllowed("https://github.com/example/forbidden", config);
    } catch (error) {
      expect(error).toBeInstanceOf(ResolverError);
      expect((error as ResolverError).classification).toBe("unknown_repo_denied");
    }
  });
});
