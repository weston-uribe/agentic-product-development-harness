import { executeDryRun } from "./dry-run.js";
import { executePlanningPhase } from "./phases/planning.js";
import { fetchLinearIssue } from "../linear/client.js";
import { inferPhaseFromStatus } from "./phase-infer.js";
import { loadConfig } from "../config/load-config.js";
import { EXIT_CONFIG } from "../cli/exit-codes.js";

export type RunPhaseArg = "auto" | "planning" | "dry-run";

export interface OrchestratorOptions {
  issueKey: string;
  configPath: string;
  dryRun?: boolean;
  fixturePath?: string;
  phase?: RunPhaseArg;
  force?: boolean;
}

export async function runOrchestrator(
  options: OrchestratorOptions,
): Promise<{ exitCode: number; runDirectory?: string; manifest?: unknown }> {
  if (options.dryRun || options.phase === "dry-run") {
    const result = await executeDryRun({
      issueKey: options.issueKey,
      configPath: options.configPath,
      fixturePath: options.fixturePath,
    });
    return {
      exitCode: result.exitCode,
      runDirectory: result.runDirectory,
      manifest: result.manifest,
    };
  }

  if (options.fixturePath) {
    console.error("--fixture is only supported with --dry-run");
    return { exitCode: EXIT_CONFIG };
  }

  let phase = options.phase ?? "auto";
  if (phase === "auto") {
    const linearApiKey = process.env.LINEAR_API_KEY;
    if (!linearApiKey) {
      console.error("LINEAR_API_KEY is required for live runs");
      return { exitCode: EXIT_CONFIG };
    }
    const config = await loadConfig(options.configPath);
    const issue = await fetchLinearIssue(options.issueKey, linearApiKey);
    const inferred = inferPhaseFromStatus(issue.status, config);
    if (inferred.phase === "planning") {
      phase = "planning";
    } else if (inferred.phase === "implementation") {
      console.error("Implementation phase is not implemented in Milestone 2");
      return { exitCode: EXIT_CONFIG };
    } else {
      console.error(
        `Issue status "${issue.status ?? "unknown"}" is not eligible for harness run`,
      );
      return { exitCode: EXIT_CONFIG };
    }
  }

  if (phase === "planning") {
    const result = await executePlanningPhase({
      issueKey: options.issueKey,
      configPath: options.configPath,
      force: options.force,
    });
    return {
      exitCode: result.exitCode,
      runDirectory: result.runDirectory,
      manifest: result.manifest,
    };
  }

  console.error(`Unsupported phase: ${phase}`);
  return { exitCode: EXIT_CONFIG };
}
