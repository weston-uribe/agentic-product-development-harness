import { z } from "zod";
import { DEFAULT_LOG_DIRECTORY, DEFAULT_ORCHESTRATOR_MARKER } from "./defaults.js";

const githubRepoUrl = z
  .string()
  .regex(
    /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/,
    "must be a https://github.com/<owner>/<repo> URL",
  );

const repoMappingSchema = z.object({
  id: z.string().min(1),
  linearProjects: z.array(z.string()).optional(),
  linearTeams: z.array(z.string()).optional(),
  targetRepo: githubRepoUrl,
  baseBranch: z.string().min(1).default("main"),
  previewProvider: z.string().optional(),
  validation: z
    .object({
      commands: z.array(z.string()).optional(),
    })
    .optional(),
});

const linearConfigSchema = z.object({
  teamKey: z.string().optional(),
  eligibleStatuses: z
    .object({
      planning: z.array(z.string()).optional(),
      implementation: z.array(z.string()).optional(),
    })
    .optional(),
  transitionalStatuses: z
    .object({
      planningInProgress: z.string().optional(),
      buildingInProgress: z.string().optional(),
      prOpen: z.string().optional(),
      pmReview: z.string().optional(),
      blocked: z.string().optional(),
    })
    .optional(),
});

export const harnessConfigSchema = z
  .object({
    version: z.literal(1),
    orchestratorMarker: z.string().default(DEFAULT_ORCHESTRATOR_MARKER),
    logDirectory: z.string().default(DEFAULT_LOG_DIRECTORY),
    defaultModel: z.object({ id: z.string() }).optional(),
    linear: linearConfigSchema.optional(),
    watch: z
      .object({
        pollIntervalSeconds: z.number().positive().optional(),
        maxConcurrentRuns: z.number().positive().optional(),
      })
      .optional(),
    preview: z
      .object({
        pollTimeoutSeconds: z.number().positive().optional(),
        pollIntervalSeconds: z.number().positive().optional(),
      })
      .optional(),
    repos: z.array(repoMappingSchema).min(1),
    allowedTargetRepos: z.array(githubRepoUrl).min(1),
  })
  .strict();

export type HarnessConfig = z.infer<typeof harnessConfigSchema>;
export type RepoMapping = z.infer<typeof repoMappingSchema>;
