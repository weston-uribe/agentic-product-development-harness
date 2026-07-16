"use client";

import { useState } from "react";
import type {
  OperationsBootstrapPayload,
  OperationsValidationIssue,
  OperationsValidationResult,
  OperationsWorkflowDraft,
} from "@harness/operations/types";
import type { CanonicalAgentPhaseKey, CanonicalStatusKey } from "@harness/workflow/canonical-product-development-workflow";
import type { OperationsSelection } from "@/lib/operations/reducer";
import { OperationsScopeSelector } from "./operations-scope-selector";
import { OperationsIssuesPanel } from "./operations-issues-panel";
import { WorkflowHealthPanel } from "./workflow-health-panel";
import { WorkflowCardsSection } from "./workflow-cards-section";

type OperationsSidebarProps = {
  bootstrap: OperationsBootstrapPayload;
  draft: OperationsWorkflowDraft;
  selection: OperationsSelection;
  validation: OperationsValidationResult;
  disabled?: boolean;
  collapsed?: boolean;
  mobileOpen?: boolean;
  scrollToCardSignal?: CanonicalStatusKey | null;
  onScopeChange: (scopeId: string) => void;
  onIssueClick?: (issue: OperationsValidationIssue) => void;
  onSelectStatus: (canonicalStatusKey: CanonicalStatusKey) => void;
  onSelectModel: (phaseKey: CanonicalAgentPhaseKey, modelId: string) => void;
  onUpdateModelParameter: (
    phaseKey: CanonicalAgentPhaseKey,
    parameterId: string,
    value: string,
  ) => void;
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
  scrollToCardSignal,
  onScopeChange,
  onIssueClick,
  onSelectStatus,
  onSelectModel,
  onUpdateModelParameter,
  onCloseMobile,
}: OperationsSidebarProps) {
  const panelClassName = collapsed
    ? "hidden lg:flex lg:w-0 lg:overflow-hidden lg:opacity-0 lg:pointer-events-none"
    : mobileOpen
      ? "fixed inset-y-0 left-0 z-40 flex w-[min(100%,360px)] flex-col border-r border-border bg-background shadow-lg lg:static lg:z-auto lg:w-[360px] lg:shadow-none"
      : "hidden lg:flex lg:w-[360px] lg:shrink-0 lg:flex-col";

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
        role="complementary"
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

          <WorkflowHealthPanel bootstrap={bootstrap} />

          <WorkflowCardsSection
            bootstrap={bootstrap}
            draft={draft}
            selection={selection}
            disabled={disabled}
            scrollToCardSignal={scrollToCardSignal}
            onSelectStatus={onSelectStatus}
            onSelectModel={onSelectModel}
            onUpdateModelParameter={onUpdateModelParameter}
          />

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
