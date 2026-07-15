import type {
  OperationsExecutorCatalogEntry,
  OperationsNestedCapability,
} from "./types.js";

export const ASSIGNABLE_EXECUTOR_IDS = [
  "planner-agent",
  "implementation-agent",
  "handoff-pm-review-prep",
  "revision-agent",
  "merge-runner",
  "human-decision",
  "pr-review-agent",
] as const;

export type AssignableExecutorId = (typeof ASSIGNABLE_EXECUTOR_IDS)[number];

export const NON_ASSIGNABLE_EXECUTOR_IDS = [
  "integration-repair",
  "production-sync",
] as const;

export function isAssignableExecutorId(executorId: string): boolean {
  return (ASSIGNABLE_EXECUTOR_IDS as readonly string[]).includes(executorId);
}

export function isStatusTransitionExecutor(executorId: string): boolean {
  return isAssignableExecutorId(executorId);
}

export function getExecutorCatalog(): OperationsExecutorCatalogEntry[] {
  return [
    {
      id: "planner-agent",
      label: "Planner Agent",
      kind: "cursor-agent",
      maturity: "implemented",
      triggerScope: "status-transition",
      supportsDraftModelSelection: true,
      modelSelectionMode: "draft-configurable",
      allowsSelfLoop: false,
      defaultOutcomeTemplates: [{ label: "Plan complete" }],
      honestyNote:
        "Implemented Cursor agent. Draft model selection is prototype-only; runtime still uses the global resolved model.",
    },
    {
      id: "implementation-agent",
      label: "Implementation Agent",
      kind: "cursor-agent",
      maturity: "implemented",
      triggerScope: "status-transition",
      supportsDraftModelSelection: true,
      modelSelectionMode: "draft-configurable",
      allowsSelfLoop: false,
      defaultOutcomeTemplates: [{ label: "Implementation complete" }],
      honestyNote:
        "Implemented Cursor agent. Draft model selection is prototype-only; runtime still uses the global resolved model.",
    },
    {
      id: "handoff-pm-review-prep",
      label: "Handoff / PM Review Prep",
      kind: "system-runner",
      maturity: "implemented",
      triggerScope: "status-transition",
      supportsDraftModelSelection: false,
      modelSelectionMode: "none",
      allowsSelfLoop: false,
      defaultOutcomeTemplates: [{ label: "Handoff complete" }],
      honestyNote: "Implemented system runner with no model selector.",
    },
    {
      id: "revision-agent",
      label: "Revision Agent",
      kind: "cursor-agent",
      maturity: "implemented",
      triggerScope: "status-transition",
      supportsDraftModelSelection: true,
      modelSelectionMode: "draft-configurable",
      allowsSelfLoop: true,
      defaultOutcomeTemplates: [{ label: "Revision complete" }],
      honestyNote:
        "Implemented Cursor agent. Self-loops are permitted for revision cycles.",
    },
    {
      id: "merge-runner",
      label: "Merge Runner",
      kind: "system-runner",
      maturity: "implemented",
      triggerScope: "status-transition",
      supportsDraftModelSelection: false,
      modelSelectionMode: "none",
      allowsSelfLoop: false,
      defaultOutcomeTemplates: [
        { label: "Merged successfully" },
        { label: "Merge blocked" },
      ],
      honestyNote:
        "Implemented system runner. Integration Repair is configured as a nested recovery policy, not a separate canvas executor.",
    },
    {
      id: "human-decision",
      label: "Human Decision",
      kind: "human-gate",
      maturity: "human",
      triggerScope: "status-transition",
      supportsDraftModelSelection: false,
      modelSelectionMode: "none",
      allowsSelfLoop: false,
      defaultOutcomeTemplates: [
        { label: "Approved" },
        { label: "Changes requested" },
      ],
      honestyNote: "Human/manual gate with no model selector.",
    },
    {
      id: "pr-review-agent",
      label: "PR Review Agent",
      kind: "cursor-agent",
      maturity: "planned",
      triggerScope: "status-transition",
      supportsDraftModelSelection: true,
      modelSelectionMode: "draft-only-planned",
      allowsSelfLoop: false,
      defaultOutcomeTemplates: [
        { label: "Approved" },
        { label: "Changes requested" },
        { label: "Unable to review" },
      ],
      honestyNote:
        "Planned/prototype-only. No PR Review Agent exists in the harness runtime today.",
    },
  ];
}

export function getNestedCapabilities(): OperationsNestedCapability[] {
  return [
    {
      id: "integration-repair",
      label: "Integration Repair",
      ownerExecutorId: "merge-runner",
      triggerScope: "nested-recovery",
      maturity: "implemented",
      currentRuntimeBehavior:
        "Deterministic integration repair with Cursor-agent fallback when deterministic repair fails.",
      prototypeOptions: [
        "deterministicRepairEnabled",
        "cursorAgentFallbackEnabled",
        "prototypeFutureModelOverride",
      ],
      honestyNote:
        "Subordinate recovery capability owned by Merge Runner. Not assignable as a status-transition executor.",
    },
    {
      id: "production-sync",
      label: "Production Sync",
      triggerScope: "external-system",
      maturity: "system",
      currentRuntimeBehavior:
        "Responds to production-promotion evidence and updates issues previously merged to an integration branch.",
      honestyNote:
        "Externally triggered system capability. Not initiated by entering a Linear status and not assignable on the canvas.",
    },
  ];
}

export function lookupExecutor(
  executorId: string,
): OperationsExecutorCatalogEntry | undefined {
  return getExecutorCatalog().find((entry) => entry.id === executorId);
}
