import { Command } from "commander";
import { runDoctor } from "./commands/doctor.js";
import { runInspect } from "./commands/inspect.js";
import { runRunCommand } from "./commands/run.js";
import { runValidateIssue } from "./commands/validate-issue.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("harness")
    .description("Agentic product development harness runner")
    .option(
      "--config <path>",
      "Path to harness.config.json",
      "harness.config.json",
    );

  program
    .command("doctor")
    .description("Validate config, allowlist, and optional Linear auth")
    .action(async () => {
      const configPath = program.opts<{ config: string }>().config;
      const exitCode = await runDoctor({ configPath });
      process.exitCode = exitCode;
    });

  program
    .command("run")
    .description("Run harness against a Linear issue")
    .requiredOption("--issue <key>", "Linear issue key, e.g. WES-11")
    .option("--dry-run", "Parse and resolve without side effects", false)
    .option(
      "--phase <phase>",
      "Run phase: auto, planning, implementation, handoff, revision, merge, or dry-run (default: auto for live runs)",
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

  return program;
}
