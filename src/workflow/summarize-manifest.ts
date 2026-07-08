import { readFileSync } from "node:fs";
import { redactSecrets } from "../artifacts/redact.js";

interface ManifestSubset {
  issueKey?: string;
  phase?: string;
  finalOutcome?: string;
  errorClassification?: string | null;
}

function readManifestSubset(path: string): ManifestSubset | null {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    const redacted = redactSecrets(raw) as Record<string, unknown>;
    return {
      issueKey: typeof redacted.issueKey === "string" ? redacted.issueKey : undefined,
      phase: typeof redacted.phase === "string" ? redacted.phase : undefined,
      finalOutcome:
        typeof redacted.finalOutcome === "string" ? redacted.finalOutcome : undefined,
      errorClassification:
        typeof redacted.errorClassification === "string" ||
        redacted.errorClassification === null
          ? (redacted.errorClassification as string | null)
          : undefined,
    };
  } catch {
    return null;
  }
}

const path = process.argv[2];
if (!path) {
  console.error("Usage: summarize-manifest <json-path>");
  process.exit(1);
}

const subset = readManifestSubset(path);
if (!subset) {
  console.log("- Manifest: (unavailable or invalid JSON)");
  process.exit(0);
}

if (subset.issueKey) {
  console.log(`- Issue key: \`${subset.issueKey}\``);
}
if (subset.phase) {
  console.log(`- Phase: \`${subset.phase}\``);
}
if (subset.finalOutcome) {
  console.log(`- Outcome: \`${subset.finalOutcome}\``);
}
console.log(`- Error classification: \`${subset.errorClassification ?? "none"}\``);
