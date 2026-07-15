"use client";

import { useMemo, useState } from "react";
import type {
  OperationsBootstrapPayload,
  OperationsOutcome,
  OperationsValidationIssue,
  OperationsValidationResult,
  OperationsWorkflowDraft,
} from "@harness/operations/types";
import type { OperationsSelection } from "@/lib/operations/reducer";
import { Button } from "@/components/ui/button";
import { OperationsScopeSelector } from "./operations-scope-selector";
import { OperationsInspector } from "./operations-inspector";
import { OperationsIssuesPanel } from "./operations-issues-panel";

type OperationsSidebarProps = {
  bootstrap: OperationsBootstrapPayload;
  draft: OperationsWorkflowDraft;
  selection: OperationsSelection;
  validation: OperationsValidationResult;
  disabled?: boolean;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onScopeChange: (scopeId: string) => void;
  onIssueClick?: (issue: OperationsValidationIssue) => void;
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
  onAddStatus: (statusId: string) => void;
  onCloseMobile?: () => void;
};

export function OperationsSidebar({
  bootstrap,
  draft,
  selection,
  validation,
  disabled = false,
  collapsed = false,
  mobileOpen = false,
  onScopeChange,
  onIssueClick,
  onUpdateRule,
  onSelectModel,
  onUpdateModelParameter,
  onAddOutcome,
  onUpdateOutcome,
  onDeleteOutcome,
  onRemoveStatus,
  onCreateAutomation,
  onAddStatus,
  onCloseMobile,
}: OperationsSidebarProps) {
  const [statusFilter, setStatusFilter] = useState("");
  const onCanvas = useMemo(() => new Set(draft.statusIdsOnCanvas), [draft.statusIdsOnCanvas]);

  const filteredStatuses = useMemo(() => {
    const query = statusFilter.trim().toLowerCase();
    return bootstrap.statuses.filter((status) =>
      query ? status.name.toLowerCase().includes(query) : true,
    );
  }, [bootstrap.statuses, statusFilter]);

  const onWorkflow = filteredStatuses.filter((status) => onCanvas.has(status.id));
  const available = filteredStatuses.filter((status) => !onCanvas.has(status.id));

  const panelClassName = collapsed
    ? "hidden lg:flex lg:w-0 lg:overflow-hidden lg:opacity-0 lg:pointer-events-none"
    : mobileOpen
      ? "fixed inset-y-0 left-0 z-40 flex w-[min(100%,320px)] flex-col border-r border-border bg-background shadow-lg lg:static lg:z-auto lg:w-[320px] lg:shadow-none"
      : "hidden lg:flex lg:w-[320px] lg:shrink-0 lg:flex-col";

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
        />
      ) : null}
      <aside
        className={`${panelClassName} min-h-0 min-w-0 flex-col overflow-hidden border-border`}
        aria-hidden={collapsed && !mobileOpen}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
          <OperationsScopeSelector
            scopes={bootstrap.scopes}
            selectedScopeId={bootstrap.selectedScopeId}
            legacyDraftReviewRequired={bootstrap.legacyDraftReviewRequired}
            disabled={disabled}
            onScopeChange={onScopeChange}
          />

          <OperationsInspector
            bootstrap={bootstrap}
            draft={draft}
            selection={selection}
            disabled={disabled}
            onUpdateRule={onUpdateRule}
            onSelectModel={onSelectModel}
            onUpdateModelParameter={onUpdateModelParameter}
            onAddOutcome={onAddOutcome}
            onUpdateOutcome={onUpdateOutcome}
            onDeleteOutcome={onDeleteOutcome}
            onRemoveStatus={onRemoveStatus}
            onCreateAutomation={onCreateAutomation}
          />

          <section className="space-y-2" aria-label="Statuses">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Statuses</h2>
            </div>
            <input
              type="search"
              placeholder="Search statuses"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            {onWorkflow.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">On workflow</p>
                <ul className="space-y-1">
                  {onWorkflow.map((status) => (
                    <li
                      key={status.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                    >
                      <span className="truncate">{status.name}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onRemoveStatus(status.id)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {available.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Available</p>
                <ul className="space-y-1">
                  {available.map((status) => (
                    <li
                      key={status.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
                    >
                      <span className="truncate">{status.name}</span>
                      <Button
                        type="button"
                        size="sm"
                        disabled={disabled}
                        onClick={() => onAddStatus(status.id)}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <OperationsIssuesPanel validation={validation} onIssueClick={onIssueClick} />

          {bootstrap.debugEnabled && bootstrap.warnings.length > 0 ? (
            <section className="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
              <p className="mb-1 font-medium">Debug diagnostics</p>
              {bootstrap.warnings.map((warning, index) => (
                <p key={`${index}-${warning}`}>{warning}</p>
              ))}
            </section>
          ) : null}
        </div>
      </aside>
    </>
  );
}
