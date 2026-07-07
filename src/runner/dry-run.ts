import { mkdir, writeFile } from "node:fs/promises";
import { MILESTONE } from "../config/defaults.js";
import { loadConfig } from "../config/load-config.js";
import type { HarnessConfig } from "../config/types.js";
import { EventLogger } from "../artifacts/events.js";
import { createRunId } from "../artifacts/run-id.js";
import { getRunDirectory, getErrorPath } from "../artifacts/paths.js";
import { writeManifest } from "../artifacts/manifest.js";
import { writeIssueSnapshot } from "../artifacts/snapshot.js";
import { writeRunSummary } from "../artifacts/summary.js";
import { fetchLinearIssue } from "../linear/client.js";
import { parseIssueDescription } from "../linear/parser.js";
import { assertRepoAllowed } from "../resolver/allowed-repos.js";
import { ResolverError } from "../resolver/errors.js";
import { resolveTargetRepo } from "../resolver/target-repo.js";
import type { ResolvedTarget } from "../resolver/target-repo.js";
import { inferPhaseFromStatus } from "./phase-infer.js";
import { loadIssueFixture } from "./fixture.js";
import type {
  ErrorClassification,
  FinalOutcome,
  RunManifest,
  RunPhase,
} from "../types/run.js";
import type { ParsedIssue } from "../types/parsed-issue.js";

export interface DryRunOptions {
  issueKey: string;
  configPath: string;
  fixturePath?: string;
}

export interface DryRunResult {
  manifest: RunManifest;
  runDirectory: string;
  exitCode: number;
}

export async function executeDryRun(options: DryRunOptions): Promise<DryRunResult> {
  const startedAt = new Date();
  const runId = createRunId(options.issueKey, startedAt);
  let config: HarnessConfig | null = null;
  let runDirectory = "";
  let parsed: ParsedIssue = {
    task: "",
    acceptanceCriteria: [],
    outOfScope: [],
    parseErrors: [],
  };
  let resolved: ResolvedTarget | null = null;
  let phase: RunPhase = "none";
  let phaseInferredFromStatus: string | null = null;
  let finalOutcome: FinalOutcome = "failed";
  let errorClassification: ErrorClassification = null;
  let events: EventLogger | null = null;

  try {
    config = await loadConfig(options.configPath);
    runDirectory = getRunDirectory(config.logDirectory, options.issueKey, runId);
    events = new EventLogger(runDirectory);
    await events.init();
    await mkdir(runDirectory, { recursive: true });

    await events.log("run_started", "info", {
      issueKey: options.issueKey,
      dryRun: true,
      milestone: MILESTONE,
    });
    await events.log("config_loaded", "info", { configPath: options.configPath });

    const issue = options.fixturePath
      ? await loadIssueFixture(options.fixturePath, options.issueKey)
      : await fetchLinearIssue(
          options.issueKey,
          process.env.LINEAR_API_KEY ?? "",
        );

    if (!options.fixturePath && !process.env.LINEAR_API_KEY) {
      throw new Error(
        "LINEAR_API_KEY is required for live dry-run. Use --fixture for offline runs.",
      );
    }

    await events.log(
      options.fixturePath ? "issue_loaded_from_fixture" : "issue_fetched",
      "info",
      { issueKey: issue.identifier, fixturePath: options.fixturePath },
    );

    await writeIssueSnapshot(runDirectory, issue);

    parsed = parseIssueDescription(issue.description ?? "");
    await events.log("issue_parsed", "info", {
      parseErrors: parsed.parseErrors,
      hasTargetRepo: Boolean(parsed.targetRepoRaw),
    });

    const inferred = inferPhaseFromStatus(issue.status, config);
    phase = inferred.phase;
    phaseInferredFromStatus = inferred.statusLabel;
    await events.log("phase_inferred", "info", {
      phase,
      status: phaseInferredFromStatus,
    });

    if (parsed.parseErrors.length > 0) {
      errorClassification = "ambiguous_issue";
      throw new ResolverError(
        "ambiguous_issue",
        parsed.parseErrors.join("; "),
      );
    }

    try {
      resolved = resolveTargetRepo(
        parsed,
        {
          projectName: issue.projectName ?? undefined,
          teamName: issue.teamName ?? undefined,
        },
        config,
      );
      assertRepoAllowed(resolved.targetRepo, config);
      await events.log("repo_resolved", "info", { ...resolved });
      finalOutcome = "success";
      errorClassification = null;
    } catch (error) {
      if (error instanceof ResolverError) {
        errorClassification = error.classification;
        await events.log("repo_resolution_failed", "error", {
          classification: error.classification,
          message: error.message,
        });
        throw error;
      }
      throw error;
    }
  } catch (error) {
    if (!errorClassification && error instanceof ResolverError) {
      errorClassification = error.classification;
    }
    finalOutcome = "failed";

    if (runDirectory) {
      const message = error instanceof Error ? error.message : String(error);
      await writeFile(
        getErrorPath(runDirectory),
        `${JSON.stringify({ message, errorClassification }, null, 2)}\n`,
        "utf8",
      ).catch(() => undefined);
    }
  } finally {
    const finishedAt = new Date();
    const manifest: RunManifest = {
      runId,
      issueKey: options.issueKey,
      phase,
      phaseInferredFromStatus,
      targetRepo: resolved?.targetRepo ?? null,
      baseBranch: resolved?.baseBranch ?? null,
      resolutionSource: resolved?.resolutionSource ?? null,
      dryRun: true,
      finalOutcome,
      errorClassification,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      milestone: MILESTONE,
      cursorAgentId: null,
      cursorRunId: null,
      prUrl: null,
      previewUrl: null,
      model: config?.defaultModel?.id ?? null,
    };

    if (runDirectory) {
      await writeManifest(runDirectory, manifest);
      await writeRunSummary(runDirectory, manifest, parsed, resolved);
      await events?.log("run_finished", finalOutcome === "success" ? "info" : "error", {
        finalOutcome,
        errorClassification,
      });
    }

    return {
      manifest,
      runDirectory,
      exitCode: finalOutcome === "success" ? 0 : 2,
    };
  }
}
