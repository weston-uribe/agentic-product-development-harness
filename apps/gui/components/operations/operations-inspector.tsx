import type { OperationsBootstrapPayload, OperationsWorkflowDraft } from "@harness/operations/types";
import type { OperationsSelection } from "@/lib/operations/reducer";
import { StatusInspector } from "./status-inspector";
import { RuleInspector } from "./rule-inspector";
import { findRuleForStatus } from "@/lib/operations/reducer";

type OperationsInspectorProps = {
  bootstrap: OperationsBootstrapPayload;
  draft: OperationsWorkflowDraft;
  selection: OperationsSelection;
  onUpdateRule: (ruleId: string, patch: Partial<OperationsWorkflowDraft["rules"][number]>) => void;
};

export function OperationsInspector({
  bootstrap,
  draft,
  selection,
  onUpdateRule,
}: OperationsInspectorProps) {
  const statusById = new Map(bootstrap.statuses.map((status) => [status.id, status]));

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <h2 className="mb-2 text-sm font-medium">Inspector</h2>
      {selection.kind === "none" ? (
        <p className="text-sm text-muted-foreground">
          Select a status node or outcome to inspect rule semantics.
        </p>
      ) : null}
      {selection.kind === "status" ? (
        <div className="space-y-4">
          <StatusInspector status={statusById.get(selection.statusId)!} />
          {(() => {
            const rule = findRuleForStatus(draft, selection.statusId);
            if (!rule) {
              return (
                <p className="text-xs text-muted-foreground">
                  No rule exists for this status yet. Connect an outcome to create one.
                </p>
              );
            }
            return (
              <RuleInspector
                rule={rule}
                executors={bootstrap.executors}
                modelCatalog={bootstrap.modelCatalog}
                onChange={(patch) => onUpdateRule(rule.id, patch)}
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
              onChange={(patch) => onUpdateRule(rule.id, patch)}
            />
          );
        })()
      ) : null}
    </div>
  );
}
