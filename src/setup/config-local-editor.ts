import { loadHarnessConfig } from "../config/load-config.js";
import type { HarnessConfig } from "../config/types.js";
import { DEFAULT_MODEL_ID } from "../config/defaults.js";
import { buildHarnessConfig, buildHarnessConfigJson } from "./config-builder.js";
import type {
  SetupConfigBuildInput,
  TargetRepoSetupInput,
} from "./setup-state.js";

export interface TargetRepoFormInput {
  id: string;
  targetRepo: string;
  linearProjects?: string;
  linearTeams?: string;
  baseBranch?: string;
  productionBranch?: string;
  previewProvider?: string;
  integrationPreviewUrl?: string;
  productionUrl?: string;
  integrationSuccessStatus?: string;
  productionSuccessStatus?: string;
  validationCommands?: string;
}

export interface LocalConfigFormInput {
  repos: TargetRepoFormInput[];
  linearTeamKey?: string;
  modelId?: string;
}

function splitListField(value?: string): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const items = value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function splitCommandLines(value?: string): string[] | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  const commands = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return commands.length > 0 ? commands : undefined;
}

export function normalizeTargetRepoFormInput(
  input: TargetRepoFormInput,
): TargetRepoSetupInput {
  return {
    id: input.id.trim(),
    targetRepo: input.targetRepo.trim(),
    linearProjects: splitListField(input.linearProjects),
    linearTeams: splitListField(input.linearTeams),
    baseBranch: input.baseBranch?.trim() || undefined,
    productionBranch: input.productionBranch?.trim() || undefined,
    previewProvider: input.previewProvider?.trim() || undefined,
    integrationPreviewUrl: input.integrationPreviewUrl?.trim() || undefined,
    productionUrl: input.productionUrl?.trim() || undefined,
    integrationSuccessStatus:
      input.integrationSuccessStatus?.trim() || undefined,
    productionSuccessStatus:
      input.productionSuccessStatus?.trim() || undefined,
    validationCommands: splitCommandLines(input.validationCommands),
  };
}

export function normalizeConfigFormInput(
  input: LocalConfigFormInput,
): SetupConfigBuildInput {
  if (!input.repos.length) {
    throw new Error("At least one target repo is required");
  }

  return {
    repos: input.repos.map(normalizeTargetRepoFormInput),
    linearTeamKey: input.linearTeamKey?.trim() || undefined,
    modelId: input.modelId?.trim() || undefined,
  };
}

export function validateConfigFormInput(input: LocalConfigFormInput): {
  config: ReturnType<typeof buildHarnessConfig>;
  json: string;
} {
  const normalized = normalizeConfigFormInput(input);
  const config = buildHarnessConfig(normalized);
  const json = buildHarnessConfigJson(normalized);
  return { config, json };
}

export function configToFormInput(config: HarnessConfig): LocalConfigFormInput {
  return {
    linearTeamKey: config.linear?.teamKey,
    modelId:
      config.agentProvider?.model?.id ??
      config.defaultModel?.id ??
      DEFAULT_MODEL_ID,
    repos: config.repos.map((repo) => ({
      id: repo.id,
      targetRepo: repo.targetRepo,
      linearProjects: repo.linearProjects?.join(", "),
      linearTeams: repo.linearTeams?.join(", "),
      baseBranch: repo.baseBranch,
      productionBranch: repo.productionBranch,
      previewProvider: repo.previewProvider,
      integrationPreviewUrl: repo.integrationPreviewUrl,
      productionUrl: repo.productionUrl,
      integrationSuccessStatus: repo.integrationSuccessStatus,
      productionSuccessStatus: repo.productionSuccessStatus,
      validationCommands: repo.validation?.commands?.join("\n"),
    })),
  };
}

export async function loadConfigFormDefaults(options?: {
  cwd?: string;
}): Promise<LocalConfigFormInput> {
  try {
    const loaded = await loadHarnessConfig({ baseDir: options?.cwd });
    return configToFormInput(loaded.config);
  } catch {
    return {
      linearTeamKey: "TEAM",
      modelId: DEFAULT_MODEL_ID,
      repos: [
        {
          id: "target-app",
          targetRepo: "https://github.com/owner/example-target-app",
          linearProjects: "Example Target App",
          baseBranch: "dev",
          productionBranch: "main",
          previewProvider: "vercel",
          integrationSuccessStatus: "Merged to Dev",
          productionSuccessStatus: "Merged / Deployed",
          validationCommands: "npm run lint\nnpm run build",
        },
      ],
    };
  }
}
