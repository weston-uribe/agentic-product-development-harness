import { Command } from "commander";
import {
  DISPATCH_PHASE_CLI_DESCRIPTION,
  RUN_PHASE_CLI_DESCRIPTION,
} from "../runner/phase-args.js";
import { runDoctor } from "./commands/doctor.js";
import { runInspect } from "./commands/inspect.js";
import { runRunCommand } from "./commands/run.js";
import { runValidateIssue } from "./commands/validate-issue.js";
import { runSyncProductionCommand } from "./commands/sync-production.js";
import { runResolveRouteCommand } from "./commands/resolve-route.js";
import { runRedactOutputCommand } from "./commands/redact-output.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("harness")
    .description("Agentic product development harness runner")
    .option(
      "--config <path>",
      "Path to harness.config.json (explicit flag overrides HARNESS_CONFIG_* env)",
      "harness.config.json",
    );

  program
    .command("doctor")
    .description("Validate config, allowlist, and optional Linear auth")
    .option(
      "--profile <profile>",
      "Validation profile: full (default) or merge (GitHub/Linear only)",
      "full",
    )
    .action(async (options: { profile?: string }) => {
      const configPath = program.opts<{ config: string }>().config;
      const profile = options.profile === "merge" ? "merge" : "full";
      const exitCode = await runDoctor({ configPath, profile });
      process.exitCode = exitCode;
    });

  program
    .command("run")
    .description("Run harness against a Linear issue")
    .requiredOption("--issue <key>", "Linear issue key, e.g. WES-11")
    .option("--dry-run", "Parse and resolve without side effects", false)
    .option(
      "--phase <phase>",
      `Run phase: ${RUN_PHASE_CLI_DESCRIPTION} (default: auto for live runs)`,
      "auto",
    )
    .option("--force", "Re-run planning even when idempotency markers exist", false)
    .option("--fixture <path>", "Load issue description from a local markdown fixture")
    .option("--json", "Print manifest JSON to stdout", false)
    .action(async (opts) => {
      const configPath = program.opts<{ config: string }>().config;
      const exitCode = await runRunCommand({
        issueKey: opts.issue,
        configPath,
        dryRun: opts.dryRun,
        fixturePath: opts.fixture,
        json: opts.json,
        phase: opts.phase,
        force: opts.force,
      });
      process.exitCode = exitCode;
    });

  program
    .command("inspect")
    .description("Inspect a prior harness run directory")
    .requiredOption("--run <path>", "Path to run directory under runs/")
    .action(async (opts) => {
      const exitCode = await runInspect({ runPath: opts.run });
      process.exitCode = exitCode;
    });

  program
    .command("validate-issue")
    .description("Validate a Linear issue description without side effects")
    .option("--file <path>", "Path to issue markdown file")
    .option("--issue <key>", "Linear issue key, e.g. WES-11")
    .option(
      "--intended-phase <phase>",
      "Route-specific validation: planning or implementation",
    )
    .option("--json", "Print validation result JSON to stdout", false)
    .action(async (opts) => {
      const configPath = program.opts<{ config: string }>().config;
      const exitCode = await runValidateIssue({
        configPath,
        filePath: opts.file,
        issueKey: opts.issue,
        intendedPhase: opts.intendedPhase,
        json: opts.json,
      });
      process.exitCode = exitCode;
    });

  program
    .command("resolve-route")
    .description("Resolve harness phase and target repo for workflow routing")
    .requiredOption("--issue <key>", "Linear issue key, e.g. WES-11")
    .option(
      "--phase <phase>",
      `Phase override: ${DISPATCH_PHASE_CLI_DESCRIPTION}`,
      "auto",
    )
    .option("--json", "Print route JSON to stdout", false)
    .option(
      "--github-output",
      "Append route fields to GITHUB_OUTPUT for Actions",
      false,
    )
    .action(async (opts) => {
      const configPath = program.opts<{ config: string }>().config;
      const exitCode = await runResolveRouteCommand({
        issueKey: opts.issue,
        configPath,
        phase: opts.phase,
        json: opts.json,
        githubOutput: opts.githubOutput,
      });
      process.exitCode = exitCode;
    });

  program
    .command("sync-production")
    .description("Sync Linear issues from Merged to Dev to Merged / Deployed when promoted")
    .option("--repo <id>", "Repo config id, e.g. target-app")
    .option("--issue <key>", "Single Linear issue key, e.g. WES-11")
    .option(
      "--source-repo <slug>",
      "Dispatch sourceRepo slug, e.g. owner/example-target-app",
    )
    .option(
      "--production-branch <branch>",
      "Dispatch productionBranch, e.g. main",
    )
    .option("--ref <ref>", "Dispatch git ref, e.g. refs/heads/main")
    .option("--dry-run", "Inspect without Linear writes", false)
    .option("--force", "Re-run even when markers exist", false)
    .option("--json", "Print sync summary JSON to stdout", false)
    .action(async (opts) => {
      const configPath = program.opts<{ config: string }>().config;
      const exitCode = await runSyncProductionCommand({
        configPath,
        repo: opts.repo,
        issue: opts.issue,
        sourceRepo: opts.sourceRepo,
        productionBranch: opts.productionBranch,
        ref: opts.ref,
        dryRun: opts.dryRun,
        force: opts.force,
        json: opts.json,
      });
      process.exitCode = exitCode;
    });

  program
    .command("redact-output")
    .description("Read stdin and write redacted JSON or text to stdout")
    .action(async () => {
      const exitCode = await runRedactOutputCommand();
      process.exitCode = exitCode;
    });

  return program;
}
