import type {
  OperationsBootstrapPayload,
  OperationsOutcome,
  OperationsWorkflowDraft,
} from "@harness/operations/types";
import type { OperationsSelection } from "@/lib/operations/reducer";
import { Button } from "@/components/ui/button";
import { StatusInspector } from "./status-inspector";
import { RuleInspector } from "./rule-inspector";
import { findRuleForStatus } from "@/lib/operations/reducer";

type OperationsInspectorProps = {
  bootstrap: OperationsBootstrapPayload;
  draft: OperationsWorkflowDraft;
  selection: OperationsSelection;
  disabled?: boolean;
  onUpdateRule: (ruleId: string, patch: Partial<OperationsWorkflowDraft["rules"][number]>) => void;
  onSelectModel: (ruleId: string, modelId: string) => void;
  onUpdateModelParameter: (ruleId: string, parameterId: string, value: string) => void;
  onAddOutcome: (ruleId: string) => void;
  onUpdateOutcome: (
    ruleId: string,
    outcomeId: string,
    patch: Partial<OperationsOutcome>,
  ) => void;
  onDeleteOutcome: (ruleId: string, outcomeId: string) => void;
  onRemoveStatus: (statusId: string) => void;
  onCreateAutomation: (statusId: string) => void;
};

export function OperationsInspector({
  bootstrap,
  draft,
  selection,
  disabled = false,
  onUpdateRule,
  onSelectModel,
  onUpdateModelParameter,
  onAddOutcome,
  onUpdateOutcome,
  onDeleteOutcome,
  onRemoveStatus,
  onCreateAutomation,
}: OperationsInspectorProps) {
  const statusById = new Map(bootstrap.statuses.map((status) => [status.id, status]));

  return (
    <section className="space-y-2" aria-busy={disabled} aria-label="Inspector">
      <h2 className="text-sm font-medium">Inspector</h2>
      {selection.kind === "none" ? (
        <p className="text-sm text-muted-foreground">
          Select a status or connection to edit it.
        </p>
      ) : null}
      {selection.kind === "status" ? (
        <div className="space-y-4">
          <StatusInspector
            status={statusById.get(selection.statusId)!}
            disabled={disabled}
            onRemove={() => onRemoveStatus(selection.statusId)}
          />
          {(() => {
            const rule = findRuleForStatus(draft, selection.statusId);
            if (!rule) {
              return (
                <Button
                  type="button"
                  size="sm"
                  disabled={disabled}
                  onClick={() => onCreateAutomation(selection.statusId)}
                >
                  Create automation
                </Button>
              );
            }
            return (
              <RuleInspector
                rule={rule}
                executors={bootstrap.executors}
                modelCatalog={bootstrap.modelCatalog}
                statuses={bootstrap.statuses}
                disabled={disabled}
                onChange={(patch) => onUpdateRule(rule.id, patch)}
                onSelectModel={(modelId) => onSelectModel(rule.id, modelId)}
                onUpdateModelParameter={(parameterId, value) =>
                  onUpdateModelParameter(rule.id, parameterId, value)
                }
                onAddOutcome={() => onAddOutcome(rule.id)}
                onUpdateOutcome={(outcomeId, patch) =>
                  onUpdateOutcome(rule.id, outcomeId, patch)
                }
                onDeleteOutcome={(outcomeId) => onDeleteOutcome(rule.id, outcomeId)}
              />
            );
          })()}
        </div>
      ) : null}
      {selection.kind === "rule" || selection.kind === "outcome" ? (
        (() => {
          const rule = draft.rules.find((entry) =>
            selection.kind === "rule"
              ? entry.id === selection.ruleId
              : entry.id === selection.ruleId,
          );
          if (!rule) {
            return null;
          }
          return (
            <RuleInspector
              rule={rule}
              executors={bootstrap.executors}
              modelCatalog={bootstrap.modelCatalog}
              statuses={bootstrap.statuses}
              disabled={disabled}
              connectionView={selection.kind === "outcome"}
              selectedOutcomeId={
                selection.kind === "outcome" ? selection.outcomeId : undefined
              }
              onChange={(patch) => onUpdateRule(rule.id, patch)}
              onSelectModel={(modelId) => onSelectModel(rule.id, modelId)}
              onUpdateModelParameter={(parameterId, value) =>
                onUpdateModelParameter(rule.id, parameterId, value)
              }
              onAddOutcome={() => onAddOutcome(rule.id)}
              onUpdateOutcome={(outcomeId, patch) =>
                onUpdateOutcome(rule.id, outcomeId, patch)
              }
              onDeleteOutcome={(outcomeId) => onDeleteOutcome(rule.id, outcomeId)}
            />
          );
        })()
      ) : null}
    </section>
  );
}
