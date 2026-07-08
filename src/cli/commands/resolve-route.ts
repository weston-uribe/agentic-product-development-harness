import "dotenv/config";
import { EXIT_CONFIG, EXIT_PLANNING_FAILURE, EXIT_RUN_FAILURE } from "../exit-codes.js";
import { resolveRoute, type ResolveRoutePhaseArg, LinearAuthError } from "../../runner/resolve-route.js";
import { ResolverError } from "../../resolver/errors.js";

export interface ResolveRouteCommandOptions {
  issueKey: string;
  configPath: string;
  phase?: ResolveRoutePhaseArg;
  json?: boolean;
  githubOutput?: boolean;
}

const VALID_PHASES = new Set<ResolveRoutePhaseArg>([
  "auto",
  "planning",
  "implementation",
  "handoff",
  "revision",
  "merge",
]);

export async function runResolveRouteCommand(
  options: ResolveRouteCommandOptions,
): Promise<number> {
  if (!options.issueKey) {
    console.error("--issue <KEY> is required.");
    return EXIT_CONFIG;
  }

  const phase = options.phase ?? "auto";
  if (!VALID_PHASES.has(phase)) {
    console.error(`Invalid --phase "${phase}".`);
    return EXIT_CONFIG;
  }

  try {
    const result = await resolveRoute({
      issueKey: options.issueKey,
      configPath: options.configPath,
      phase,
    });

    if (options.githubOutput) {
      const outputPath = process.env.GITHUB_OUTPUT;
      if (outputPath) {
        const { appendFileSync } = await import("node:fs");
        const lines = [
          `issue_key=${result.issueKey}`,
          `phase=${result.phase}`,
          `repo_config_id=${result.repoConfigId}`,
          `base_branch=${result.baseBranch}`,
          `target_repo=${result.targetRepo}`,
          `linear_status=${result.linearStatus ?? ""}`,
          `merge_concurrency_group=${result.mergeConcurrencyGroup}`,
          `should_run=${result.shouldRun}`,
        ];
        appendFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
      }
    }

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Issue: ${result.issueKey}`);
      console.log(`Phase: ${result.phase}`);
      console.log(`Repo: ${result.repoConfigId}`);
      console.log(`Base branch: ${result.baseBranch}`);
      console.log(`Merge concurrency group: ${result.mergeConcurrencyGroup}`);
      console.log(`Should run: ${result.shouldRun}`);
    }

    if (!result.shouldRun) {
      return 0;
    }

    return 0;
  } catch (error) {
    if (error instanceof LinearAuthError) {
      console.error(error.message);
      return EXIT_PLANNING_FAILURE;
    }
    if (error instanceof ResolverError) {
      console.error(error.message);
      return EXIT_RUN_FAILURE;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return EXIT_RUN_FAILURE;
  }
}
