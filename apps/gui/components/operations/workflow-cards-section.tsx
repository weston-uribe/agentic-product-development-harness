"use client";

import { useEffect, useMemo, useState } from "react";
import type { CanonicalAgentPhaseKey, CanonicalStatusKey } from "@harness/workflow/canonical-product-development-workflow";
import {
  CANONICAL_AGENT_PHASES,
  CANONICAL_HUMAN_GATES,
  CANONICAL_STATUSES,
  lookupCanonicalAgentPhase,
  lookupCanonicalStatus,
} from "@harness/workflow/canonical-product-development-workflow";
import type {
  OperationsBootstrapPayload,
  OperationsWorkflowDraft,
} from "@harness/operations/types";
import {
  CANONICAL_ACTOR_LABELS,
  getAgentPhaseForStatusKey,
  getHumanGateForStatus,
  getPhaseModelSetting,
  listExtraLinearStatuses,
} from "@harness/operations/canonical-graph";
import type { OperationsSelection } from "@/lib/operations/reducer";
import { Button } from "@/components/ui/button";

const EXPANDED_CARDS_KEY = "operations-workflow-expanded-cards";

type WorkflowCardsSectionProps = {
  bootstrap: OperationsBootstrapPayload;
  draft: OperationsWorkflowDraft;
  selection: OperationsSelection;
  disabled?: boolean;
  onSelectStatus: (canonicalStatusKey: CanonicalStatusKey) => void;
  onSelectModel: (phaseKey: CanonicalAgentPhaseKey, modelId: string) => void;
  onUpdateModelParameter: (
    phaseKey: CanonicalAgentPhaseKey,
    parameterId: string,
    value: string,
  ) => void;
  scrollToCardSignal?: CanonicalStatusKey | null;
};

function readExpandedCards(): Set<CanonicalStatusKey> {
  if (typeof window === "undefined") {
    return new Set();
  }
  try {
    const raw = window.sessionStorage.getItem(EXPANDED_CARDS_KEY);
    if (!raw) {
      return new Set();
    }
    return new Set(JSON.parse(raw) as CanonicalStatusKey[]);
  } catch {
    return new Set();
  }
}

function writeExpandedCards(keys: Set<CanonicalStatusKey>): void {
  window.sessionStorage.setItem(
    EXPANDED_CARDS_KEY,
    JSON.stringify([...keys]),
  );
}

export function WorkflowCardsSection({
  bootstrap,
  draft,
  selection,
  disabled = false,
  onSelectStatus,
  onSelectModel,
  onUpdateModelParameter,
  scrollToCardSignal,
}: WorkflowCardsSectionProps) {
  const [expanded, setExpanded] = useState<Set<CanonicalStatusKey>>(() =>
    readExpandedCards(),
  );
  const [showExtraStatuses, setShowExtraStatuses] = useState(false);
  const cardRefs = useMemo(
    () => new Map<CanonicalStatusKey, HTMLDivElement | null>(),
    [],
  );

  useEffect(() => {
    writeExpandedCards(expanded);
  }, [expanded]);

  useEffect(() => {
    if (!scrollToCardSignal) {
      return;
    }
    setExpanded((current) => new Set([...current, scrollToCardSignal]));
    const node = cardRefs.get(scrollToCardSignal);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [cardRefs, scrollToCardSignal]);

  const extraStatuses = listExtraLinearStatuses(bootstrap.statuses);

  const toggleExpanded = (key: CanonicalStatusKey) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <section aria-label="Workflow" className="space-y-2">
      <h2 className="text-sm font-medium">Workflow</h2>
      <div className="space-y-2">
        {CANONICAL_STATUSES.map((statusDef) => {
          const isExpanded = expanded.has(statusDef.key);
          const isSelected =
            selection.kind === "status" &&
            selection.canonicalStatusKey === statusDef.key;
          const violation = bootstrap.canonicalWorkflow.violations.find(
            (entry) => entry.statusKey === statusDef.key,
          );
          const humanGate = getHumanGateForStatus(statusDef.key);
          const agentPhase = getAgentPhaseForStatusKey(statusDef.key);
          const phaseDef = statusDef.agentPhaseKey
            ? lookupCanonicalAgentPhase(statusDef.agentPhaseKey)
            : undefined;
          const modelSelection = statusDef.agentPhaseKey
            ? getPhaseModelSetting(draft, statusDef.agentPhaseKey)
            : undefined;

          return (
            <div
              key={statusDef.key}
              ref={(element) => {
                cardRefs.set(statusDef.key, element);
              }}
              className={`rounded-md border ${
                isSelected ? "border-ring ring-1 ring-ring" : "border-border"
              } ${violation ? "border-destructive/50" : ""}`}
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left"
                aria-expanded={isExpanded}
                onClick={() => {
                  onSelectStatus(statusDef.key);
                  toggleExpanded(statusDef.key);
                }}
              >
                <div>
                  <div className="text-sm font-medium">{statusDef.name}</div>
                  <div className="text-xs capitalize text-muted-foreground">
                    {statusDef.role.replace("-", " ")}
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">
                  {isExpanded ? "Collapse" : "Expand"}
                </span>
              </button>
              {isExpanded ? (
                <div className="space-y-2 border-t border-border px-3 py-2 text-xs">
                  {violation ? (
                    <p className="text-destructive">{violation.message}</p>
                  ) : (
                    <p className="text-emerald-700 dark:text-emerald-300">Status healthy</p>
                  )}
                  <p>
                    Actor: {CANONICAL_ACTOR_LABELS[statusDef.actorRole] ?? statusDef.actorRole}
                  </p>
                  {phaseDef ? (
                    <>
                      <p>In progress: {lookupCanonicalStatus(phaseDef.inProgressStatusKey)?.name}</p>
                      <p>
                        Success: {lookupCanonicalStatus(phaseDef.successDestinationKey)?.name}
                      </p>
                      <p>
                        Failure: {lookupCanonicalStatus(phaseDef.failureDestinationKey)?.name}
                      </p>
                    </>
                  ) : null}
                  {humanGate ? (
                    <p>
                      Human destinations:{" "}
                      {humanGate.allowedDestinations
                        .map((key) => lookupCanonicalStatus(key)?.name)
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  ) : null}
                  {statusDef.agentPhaseKey &&
                  CANONICAL_AGENT_PHASES.find((phase) => phase.key === statusDef.agentPhaseKey)
                    ?.supportsModelConfiguration ? (
                    <div className="space-y-2 rounded-md bg-muted/50 p-2">
                      <p className="font-medium">Draft model (not active)</p>
                      <label className="flex flex-col gap-1">
                        <span>Model</span>
                        <select
                          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                          disabled={disabled}
                          value={modelSelection?.modelId ?? ""}
                          onChange={(event) =>
                            onSelectModel(statusDef.agentPhaseKey!, event.target.value)
                          }
                        >
                          <option value="">Use global default</option>
                          {bootstrap.modelCatalog
                            .filter((model) => model.availability === "available")
                            .map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.displayName}
                              </option>
                            ))}
                        </select>
                      </label>
                      {modelSelection
                        ? bootstrap.modelCatalog
                            .find((model) => model.id === modelSelection.modelId)
                            ?.supportedParameters.filter((parameter) => parameter.type === "boolean")
                            .map((parameter) => {
                              const current = modelSelection.parameters.find(
                                (entry) => entry.id === parameter.id,
                              )?.value;
                              const checked = current === "true";
                              return (
                                <label
                                  key={parameter.id}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span>{parameter.label}</span>
                                  <input
                                    type="checkbox"
                                    role="switch"
                                    aria-label={parameter.label}
                                    disabled={disabled}
                                    checked={checked}
                                    onChange={(event) =>
                                      onUpdateModelParameter(
                                        statusDef.agentPhaseKey!,
                                        parameter.id,
                                        event.target.checked ? "true" : "false",
                                      )
                                    }
                                  />
                                </label>
                              );
                            })
                        : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {extraStatuses.length > 0 ? (
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowExtraStatuses((value) => !value)}
          >
            {showExtraStatuses ? "Hide" : "Show"} other Linear statuses ({extraStatuses.length})
          </Button>
          {showExtraStatuses ? (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {extraStatuses.map((status) => (
                <li key={status.id} className="rounded-md border border-border px-2 py-1">
                  {status.name} ({status.category})
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
