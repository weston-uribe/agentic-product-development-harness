import type {
  CanonicalAgentPhaseKey,
  CanonicalStatusKey,
  CanonicalTransition,
} from "../workflow/canonical-product-development-workflow.js";
import {
  CANONICAL_HUMAN_GATES,
  CANONICAL_STATUSES,
  getEffectiveCanonicalTransitions,
  lookupCanonicalAgentPhase,
  lookupCanonicalStatus,
  type MergePathVariant,
} from "../workflow/canonical-product-development-workflow.js";
import type {
  OperationsDraftModelSelection,
  OperationsStatusRecord,
  OperationsWorkflowDraft,
} from "./types.js";

export interface CanonicalGraphNode {
  canonicalStatusKey: CanonicalStatusKey;
  statusId?: string;
  name: string;
  category: string;
  color?: string;
  role: (typeof CANONICAL_STATUSES)[number]["role"];
  actorRole: (typeof CANONICAL_STATUSES)[number]["actorRole"];
  agentPhaseKey?: CanonicalAgentPhaseKey;
  automationTrigger: boolean;
  position: { x: number; y: number };
  healthIssue?: string;
}

export interface CanonicalGraphEdge {
  id: string;
  sourceKey: CanonicalStatusKey;
  targetKey: CanonicalStatusKey;
  label: string;
  kind: CanonicalTransition["kind"];
}

export interface CanonicalGraphModel {
  nodes: CanonicalGraphNode[];
  edges: CanonicalGraphEdge[];
  mergePathVariant: MergePathVariant;
}

function resolveStatusIdForKey(
  key: CanonicalStatusKey,
  statuses: OperationsStatusRecord[],
): string | undefined {
  const byKey = statuses.find((status) => status.canonicalStatusKey === key);
  if (byKey) {
    return byKey.id;
  }
  const canonical = lookupCanonicalStatus(key);
  if (!canonical) {
    return undefined;
  }
  const matches = statuses.filter((status) => status.name === canonical.name);
  return matches.length === 1 ? matches[0]?.id : undefined;
}

export function buildCanonicalGraph(input: {
  draft: OperationsWorkflowDraft;
  statuses: OperationsStatusRecord[];
  baseBranch: string;
  productionBranch: string;
  canonicalViolations?: Array<{ statusKey?: CanonicalStatusKey; message: string }>;
}): CanonicalGraphModel {
  const violationByKey = new Map(
    (input.canonicalViolations ?? [])
      .filter((violation) => violation.statusKey)
      .map((violation) => [violation.statusKey!, violation.message]),
  );

  const mergePathVariant =
    input.baseBranch === input.productionBranch
      ? "direct-production"
      : "integration-then-production";

  const transitions = getEffectiveCanonicalTransitions({
    baseBranch: input.baseBranch,
    productionBranch: input.productionBranch,
  });

  const nodes: CanonicalGraphNode[] = CANONICAL_STATUSES.map((status) => {
    const position =
      input.draft.layout.statusPositions[status.key] ?? status.suggestedPosition;
    return {
      canonicalStatusKey: status.key,
      statusId: resolveStatusIdForKey(status.key, input.statuses),
      name: status.name,
      category: status.category,
      color: input.statuses.find((entry) => entry.canonicalStatusKey === status.key)
        ?.color,
      role: status.role,
      actorRole: status.actorRole,
      agentPhaseKey: status.agentPhaseKey,
      automationTrigger: status.automationTrigger,
      position,
      healthIssue: violationByKey.get(status.key),
    };
  });

  const edges: CanonicalGraphEdge[] = transitions.map((transition) => ({
    id: `edge:${transition.from}:${transition.to}:${transition.kind}`,
    sourceKey: transition.from,
    targetKey: transition.to,
    label: transition.label,
    kind: transition.kind,
  }));

  return { nodes, edges, mergePathVariant };
}

export function getHumanGateForStatus(
  statusKey: CanonicalStatusKey,
): (typeof CANONICAL_HUMAN_GATES)[number] | undefined {
  return CANONICAL_HUMAN_GATES.find((gate) => gate.statusKey === statusKey);
}

export function getPhaseModelSetting(
  draft: OperationsWorkflowDraft,
  phaseKey: CanonicalAgentPhaseKey,
): OperationsDraftModelSelection | undefined {
  return draft.phaseModelSettings[phaseKey];
}

export function getAgentPhaseForStatusKey(
  statusKey: CanonicalStatusKey,
): ReturnType<typeof lookupCanonicalAgentPhase> | undefined {
  const status = lookupCanonicalStatus(statusKey);
  if (!status?.agentPhaseKey) {
    return undefined;
  }
  return lookupCanonicalAgentPhase(status.agentPhaseKey);
}

export function listExtraLinearStatuses(
  statuses: OperationsStatusRecord[],
): OperationsStatusRecord[] {
  return statuses.filter((status) => !status.canonicalStatusKey);
}

export const CANONICAL_ACTOR_LABELS: Record<string, string> = {
  "planner-agent": "Planner agent",
  "implementation-agent": "Implementation agent",
  "revision-agent": "Revision agent",
  "merge-runner": "Merge runner",
  "handoff-runner": "Handoff runner",
  "production-sync-runner": "Production sync",
  "human-gate": "Human gate",
  none: "No automation",
};
