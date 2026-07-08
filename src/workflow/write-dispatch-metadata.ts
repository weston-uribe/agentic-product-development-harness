import { mkdirSync, writeFileSync } from "node:fs";

function readEnv(name: string): string {
  return process.env[name] ?? "";
}

const payload = {
  githubRunId: readEnv("GITHUB_RUN_ID"),
  linearDeliveryId: readEnv("LINEAR_DELIVERY_ID"),
  trigger: readEnv("TRIGGER"),
  issueKey: readEnv("ISSUE_KEY"),
  phase: readEnv("PHASE"),
  repoConfigId: readEnv("REPO_CONFIG_ID"),
  baseBranch: readEnv("BASE_BRANCH"),
  mergeConcurrencyGroup: readEnv("MERGE_CONCURRENCY_GROUP"),
  eventAction: readEnv("EVENT_ACTION"),
  repo: readEnv("REPO"),
  productionBranch: readEnv("PRODUCTION_BRANCH"),
  sourceRepo: readEnv("SOURCE_REPO"),
  after: readEnv("AFTER"),
  receivedAt: readEnv("RECEIVED_AT"),
};

const cleaned = Object.fromEntries(
  Object.entries(payload).filter(([, value]) => value !== ""),
);

mkdirSync("runs", { recursive: true });
writeFileSync(
  "runs/dispatch-metadata.json",
  `${JSON.stringify(cleaned, null, 2)}\n`,
  "utf8",
);
