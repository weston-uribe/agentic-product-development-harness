import { readFile } from "node:fs/promises";
import path from "node:path";
import { harnessConfigSchema, type HarnessConfig } from "./schema.js";
import { normalizeRepoUrl } from "../resolver/normalize-repo.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export async function loadConfig(configPath: string): Promise<HarnessConfig> {
  const absolutePath = path.resolve(configPath);
  let raw: string;

  try {
    raw = await readFile(absolutePath, "utf8");
  } catch {
    throw new ConfigError(`Config file not found: ${absolutePath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(`Config file is not valid JSON: ${absolutePath}`);
  }

  const result = harnessConfigSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ConfigError(`Invalid harness config: ${details}`);
  }

  validateRepoClosure(result.data);
  return result.data;
}

export function validateRepoClosure(config: HarnessConfig): void {
  const allowed = new Set(
    config.allowedTargetRepos.map((url) => normalizeRepoUrl(url)),
  );

  for (const repo of config.repos) {
    const normalized = normalizeRepoUrl(repo.targetRepo);
    if (!allowed.has(normalized)) {
      throw new ConfigError(
        `repos[].targetRepo "${repo.targetRepo}" is not listed in allowedTargetRepos`,
      );
    }
  }
}
