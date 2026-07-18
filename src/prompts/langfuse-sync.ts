/**
 * Prepare Langfuse prompt sync changeset. Dry-run by default; never publishes
 * during Chunk 3 unless explicitly forced (force is rejected in this chunk).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listImplementedPromptNames, PROMPT_REGISTRY } from "./registry.js";

export interface LangfuseSyncEntry {
  name: string;
  contractVersion: string;
  type: "text";
  localTemplatePath: string;
  labels: string[];
  config: { contractVersion: string };
  action: "create_or_update";
  templateByteCount: number;
}

export interface LangfuseSyncPlan {
  dryRun: boolean;
  published: boolean;
  entries: LangfuseSyncEntry[];
  notes: string[];
}

export async function prepareLangfusePromptSync(params?: {
  dryRun?: boolean;
  label?: string;
  publish?: boolean;
}): Promise<LangfuseSyncPlan> {
  const publish = params?.publish === true;
  const label = params?.label ?? "dogfood";
  const promptsDir = path.dirname(fileURLToPath(import.meta.url));
  const entries: LangfuseSyncEntry[] = [];
  const notes: string[] = [
    "Always dry-run in this chunk — remote publish is not authorized.",
  ];

  if (label.trim().toLowerCase() === "latest") {
    throw new Error('Refusing to sync with label "latest"');
  }

  if (publish) {
    notes.push(
      "Publish requested but blocked in this chunk — changeset prepared only (dry-run).",
    );
  }

  for (const name of listImplementedPromptNames()) {
    const entry = PROMPT_REGISTRY.find((e) => e.definition.name === name);
    if (!entry?.templateFile || !entry.definition.implemented) continue;
    const abs = path.join(promptsDir, entry.templateFile);
    const template = await readFile(abs, "utf8");
    entries.push({
      name,
      contractVersion: entry.definition.contractVersion,
      type: "text",
      localTemplatePath: entry.definition.localTemplatePath,
      labels: [label],
      config: { contractVersion: entry.definition.contractVersion },
      action: "create_or_update",
      templateByteCount: Buffer.byteLength(template, "utf8"),
    });
  }

  notes.push(
    "Remote prompt config must include contractVersion matching local definitions.",
  );
  notes.push(
    "Remote prompt config must not override model ID, Fast mode, or tool permissions.",
  );

  return {
    dryRun: true,
    published: false,
    entries,
    notes,
  };
}
