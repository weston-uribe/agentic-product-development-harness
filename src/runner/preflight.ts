import { mkdir, writeFile } from "node:fs/promises";
import { MILESTONE } from "../config/defaults.js";
import { loadConfig } from "../config/load-config.js";
import type { HarnessConfig } from "../config/types.js";
import { EventLogger } from "../artifacts/events.js";
import { createRunId } from "../artifacts/run-id.js";
import { getRunDirectory, getErrorPath } from "../artifacts/paths.js";
import { writeIssueSnapshot } from "../artifacts/snapshot.js";
import { fetchLinearIssue } from "../linear/client.js";
import { parseIssueDescription } from "../linear/parser.js";
import { assertRepoAllowed } from "../resolver/allowed-repos.js";
import { ResolverError } from "../resolver/errors.js";
import { resolveTargetRepo } from "../resolver/target-repo.js";
import type { ResolvedTarget } from "../resolver/target-repo.js";
import { assertBaseBranchExists } from "../github/base-branch.js";
import { GitHubClient } from "../github/client.js";
import { inferPhaseFromStatus } from "./phase-infer.js";
import { loadIssueFixture } from "./fixture.js";
import type { ErrorClassification, RunPhase } from "../types/run.js";
import type { ParsedIssue } from "../types/parsed-issue.js";
import type { LinearIssueSnapshot } from "../linear/client.js";

export interface PreflightOptions {
  issueKey: string;
  configPath: string;
  fixturePath?: string;
  linearApiKey?: string;
}

export interface PreflightContext {
  config: HarnessConfig;
  issue: LinearIssueSnapshot;
  parsed: ParsedIssue;
  resolved: ResolvedTarget;
  runId: string;
  runDirectory: string;
  events: EventLogger;
  phase: RunPhase;
  phaseInferredFromStatus: string | null;
  startedAt: Date;
}

export interface PreflightFailure {
  success: false;
  config: HarnessConfig | null;
  issue: LinearIssueSnapshot | null;
  parsed: ParsedIssue;
  resolved: ResolvedTarget | null;
  runId: string;
  runDirectory: string;
  events: EventLogger | null;
  phase: RunPhase;
  phaseInferredFromStatus: string | null;
  startedAt: Date;
  errorClassification: ErrorClassification;
  message: string;
}

export type PreflightResult =
  | { success: true; context: PreflightContext }
  | PreflightFailure;

export async function runPreflight(
  options: PreflightOptions,
): Promise<PreflightResult> {
  const startedAt = new Date();
  const runId = createRunId(options.issueKey, startedAt);
  let config: HarnessConfig | null = null;
  let runDirectory = "";
  let events: EventLogger | null = null;
  let issue: LinearIssueSnapshot | null = null;
  let parsed: ParsedIssue = {
    task: "",
    acceptanceCriteria: [],
    outOfScope: [],
    parseErrors: [],
  };
  let resolved: ResolvedTarget | null = null;
  let phase: RunPhase = "none";
  let phaseInferredFromStatus: string | null = null;

  try {
    config = await loadConfig(options.configPath);
    runDirectory = getRunDirectory(config.logDirectory, options.issueKey, runId);
    events = new EventLogger(runDirectory);
    await events.init();
    await mkdir(runDirectory, { recursive: true });

    await events.log("run_started", "info", {
      issueKey: options.issueKey,
      milestone: MILESTONE,
    });
    await events.log("config_loaded", "info", { configPath: options.configPath });

    if (options.fixturePath) {
      issue = await loadIssueFixture(options.fixturePath, options.issueKey);
      await events.log("issue_loaded_from_fixture", "info", {
        issueKey: issue.identifier,
        fixturePath: options.fixturePath,
      });
    } else {
      const apiKey = options.linearApiKey ?? process.env.LINEAR_API_KEY ?? "";
      if (!apiKey) {
        throw new Error("LINEAR_API_KEY is required for live issue fetch");
      }
      issue = await fetchLinearIssue(options.issueKey, apiKey);
      await events.log("issue_fetched", "info", { issueKey: issue.identifier });
    }

    await writeIssueSnapshot(runDirectory, issue);

    parsed = parseIssueDescription(issue.description ?? "");
    await events.log("issue_parsed", "info", {
      parseErrors: parsed.parseErrors,
      hasTargetRepo: Boolean(parsed.targetRepoRaw),
    });

    const inferred = inferPhaseFromStatus(issue.status, config);
    phase = inferred.phase;
    phaseInferredFromStatus = inferred.statusLabel;
    await events.log("phase_inferred", "info", { phase, status: phaseInferredFromStatus });

    if (parsed.parseErrors.length > 0) {
      throw new ResolverError("ambiguous_issue", parsed.parseErrors.join("; "));
    }

    resolved = resolveTargetRepo(
      parsed,
      {
        projectName: issue.projectName ?? undefined,
        teamName: issue.teamName ?? undefined,
      },
      config,
    );
    assertRepoAllowed(resolved.targetRepo, config);
    if (process.env.GITHUB_TOKEN) {
      await assertBaseBranchExists(
        new GitHubClient({ token: process.env.GITHUB_TOKEN }),
        resolved.targetRepo,
        resolved.baseBranch,
      );
    }
    await events.log("repo_resolved", "info", { ...resolved });

    return {
      success: true,
      context: {
        config,
        issue,
        parsed,
        resolved,
        runId,
        runDirectory,
        events,
        phase,
        phaseInferredFromStatus,
        startedAt,
      },
    };
  } catch (error) {
    let errorClassification: ErrorClassification = null;
    if (error instanceof ResolverError) {
      errorClassification = error.classification;
    } else if (error instanceof Error && error.message.startsWith("wrong_status")) {
      errorClassification = "wrong_status";
    } else if (
      error instanceof Error &&
      error.message.startsWith("base_branch_missing")
    ) {
      errorClassification = "base_branch_missing";
    } else if (
      error instanceof Error &&
      error.message.startsWith("wrong_pr_base_branch")
    ) {
      errorClassification = "wrong_pr_base_branch";
    }

    const message = error instanceof Error ? error.message : String(error);
    if (runDirectory) {
      await writeFile(
        getErrorPath(runDirectory),
        `${JSON.stringify({ message, errorClassification }, null, 2)}\n`,
        "utf8",
      ).catch(() => undefined);
    }

    return {
      success: false,
      config,
      issue,
      parsed,
      resolved,
      runId,
      runDirectory,
      events,
      phase,
      phaseInferredFromStatus,
      startedAt,
      errorClassification,
      message,
    };
  }
}
