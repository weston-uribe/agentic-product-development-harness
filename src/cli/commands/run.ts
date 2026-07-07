import "dotenv/config";
import { EXIT_CONFIG } from "../exit-codes.js";
import { executeDryRun } from "../../runner/dry-run.js";

export interface RunCommandOptions {
  issueKey: string;
  configPath: string;
  dryRun?: boolean;
  fixturePath?: string;
  json?: boolean;
}

export async function runRunCommand(options: RunCommandOptions): Promise<number> {
  if (!options.dryRun) {
    console.error(
      "Only --dry-run is implemented in Milestone 1. Re-run with --dry-run.",
    );
    return EXIT_CONFIG;
  }

  if (!options.issueKey) {
    console.error("--issue <KEY> is required.");
    return EXIT_CONFIG;
  }

  const result = await executeDryRun({
    issueKey: options.issueKey,
    configPath: options.configPath,
    fixturePath: options.fixturePath,
  });

  if (options.json) {
    console.log(JSON.stringify(result.manifest, null, 2));
  } else {
    console.log(`Dry run finished: ${result.manifest.finalOutcome}`);
    console.log(`Run directory: ${result.runDirectory}`);
    if (result.manifest.errorClassification) {
      console.log(`Error classification: ${result.manifest.errorClassification}`);
    }
  }

  return result.exitCode;
}
