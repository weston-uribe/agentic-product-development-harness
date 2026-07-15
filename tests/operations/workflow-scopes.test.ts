import { describe, expect, it } from "vitest";
import {
  buildLiveWorkflowScopes,
  deriveSafeScopeFilename,
  parseOwnerRepoFromTargetUrl,
  scopeStorageKey,
  validateRequestedScopeId,
} from "../../src/operations/workflow-scopes.js";

describe("workflow scopes", () => {
  const config = {
    version: 1 as const,
    orchestratorMarker: "harness-orchestrator-v1",
    logDirectory: "runs",
    repos: [
      {
        id: "target-app",
        targetRepo: "https://github.com/weston-uribe/example-target-app",
        baseBranch: "main",
        productionBranch: "main",
      },
      {
        id: "harness-repo",
        targetRepo: "https://github.com/weston-uribe/agentic-product-development-harness",
        baseBranch: "main",
        productionBranch: "main",
      },
    ],
    allowedTargetRepos: [],
  };

  it("derives live scopes from configured repo ids", () => {
    const scopes = buildLiveWorkflowScopes(config);
    expect(scopes).toHaveLength(2);
    expect(scopes[0]?.id).toBe("target-app");
    expect(scopes[0]?.targetRepo).toBe("weston-uribe/example-target-app");
  });

  it("derives safe filenames from validated scope ids only", () => {
    const filename = deriveSafeScopeFilename("target-app");
    expect(filename).toMatch(/^[a-f0-9]{32}$/);
    expect(filename).not.toContain("github.com");
    expect(filename).not.toContain("target-app");
  });

  it("rejects unknown scope ids against the allowlist", () => {
    const allowlist = new Map(
      buildLiveWorkflowScopes(config).map((scope) => [scope.id, scope]),
    );
    const result = validateRequestedScopeId("not-a-scope", allowlist);
    expect(result.scope).toBeUndefined();
    expect(result.error).toMatch(/Unknown workflow scope/);
  });

  it("builds fixture storage keys from fixture id and scope id", () => {
    expect(
      scopeStorageKey({ fixtureId: "branching-pr-review", scopeId: "harness-repo" }),
    ).toBe("branching-pr-review::harness-repo");
  });

  it("parses owner/repo from github URLs", () => {
    expect(parseOwnerRepoFromTargetUrl("https://github.com/o/r")).toBe("o/r");
  });
});
