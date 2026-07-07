import "dotenv/config";
import { EXIT_CONFIG } from "../exit-codes.js";
import { runOrchestrator } from "../../runner/orchestrator.js";

export interface RunCommandOptions {
  issueKey: string;
  configPath: string;
  dryRun?: boolean;
  fixturePath?: string;
  json?: boolean;
  phase?: "auto" | "planning" | "implementation" | "dry-run";
  force?: boolean;
}

export async function runRunCommand(options: RunCommandOptions): Promise<number> {
  if (!options.issueKey) {
    console.error("--issue <KEY> is required.");
    return EXIT_CONFIG;
  }

  if (options.fixturePath && !options.dryRun && options.phase !== "dry-run") {
    console.error("--fixture is only supported with --dry-run");
    return EXIT_CONFIG;
  }

  const result = await runOrchestrator({
    issueKey: options.issueKey,
    configPath: options.configPath,
    dryRun: options.dryRun,
    fixturePath: options.fixturePath,
    phase: options.dryRun ? "dry-run" : options.phase,
    force: options.force,
  });

  if (options.json && result.manifest) {
    console.log(JSON.stringify(result.manifest, null, 2));
  } else if (result.manifest && typeof result.manifest === "object") {
    const manifest = result.manifest as {
      finalOutcome: string;
      errorClassification?: string | null;
      dryRun?: boolean;
    };
    const label = manifest.dryRun ? "Dry run" : "Run";
    console.log(`${label} finished: ${manifest.finalOutcome}`);
    if (result.runDirectory) {
      console.log(`Run directory: ${result.runDirectory}`);
    }
    if (manifest.errorClassification) {
      console.log(`Error classification: ${manifest.errorClassification}`);
    }
  }

  return result.exitCode;
}
