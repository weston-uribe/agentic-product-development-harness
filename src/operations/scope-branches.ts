import type { HarnessConfig } from "../config/types.js";
import type { OperationsWorkflowScope } from "./types.js";

export function resolveScopeBranchRelationship(input: {
  scope: OperationsWorkflowScope;
  config?: HarnessConfig;
}): { baseBranch: string; productionBranch: string } {
  const repoMapping = input.config?.repos.find((repo) => repo.id === input.scope.id);
  return {
    baseBranch: repoMapping?.baseBranch ?? "main",
    productionBranch: repoMapping?.productionBranch ?? "main",
  };
}

export function enrichWorkflowScopes(
  scopes: OperationsWorkflowScope[],
  config?: HarnessConfig,
): OperationsWorkflowScope[] {
  return scopes.map((scope) => {
    const branches = resolveScopeBranchRelationship({ scope, config });
    return {
      ...scope,
      baseBranch: branches.baseBranch,
      productionBranch: branches.productionBranch,
    };
  });
}
