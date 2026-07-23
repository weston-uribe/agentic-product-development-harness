import { launchAttemptIdPrefix } from "./launch-attempt-id.js";
import type { ProvenanceEventType } from "./events.js";

const ROOT = ".p-dev/cursor-cloud-agent-provenance/events";

/** Singleton per-attempt events. */
const SINGLETON_EVENTS = new Set<ProvenanceEventType>([
  "launch_intent",
  "provider_call_started",
  "provider_agent_acknowledged",
]);

export function provenanceEventRemotePath(input: {
  launchAttemptId: string;
  eventType: ProvenanceEventType;
  /** Required for run-bound/completed (runHash) and failure/reconciliation (stage/resolution id). */
  bindingOrStageId?: string;
}): string {
  const prefix = launchAttemptIdPrefix(input.launchAttemptId);
  const base = `${ROOT}/${prefix}/${input.launchAttemptId}`;

  if (SINGLETON_EVENTS.has(input.eventType)) {
    return `${base}/${input.eventType}.json`;
  }

  const binding = input.bindingOrStageId?.trim();
  if (!binding) {
    throw new Error(
      `bindingOrStageId required for event type ${input.eventType}`,
    );
  }
  // Public-safe binding id only (hashes / deterministic stage keys).
  const safe = binding.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128);
  return `${base}/${input.eventType}/${safe}.json`;
}

export function provenanceEventsRootPrefix(): string {
  return ROOT;
}
