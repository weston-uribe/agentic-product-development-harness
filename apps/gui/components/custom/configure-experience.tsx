"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { SetupGuiViewModel } from "@/lib/setup-server";
import type { RemoteSetupSummary } from "@/lib/setup-server";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import {
  deriveFirstRunReadiness,
  type FirstRunReadinessUiState,
} from "@harness/setup/first-run-readiness";

import { LAYOUT, RESPONSIVE, SPACING } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/status-badge";
import { ReadinessBanner } from "@/components/custom/readiness-banner";
import { PrimarySetupTaskCard } from "@/components/custom/primary-setup-task-card";
import { SetupDashboard } from "@/components/custom/setup-dashboard";
import { ConfigureWorkflow, type GuidedLocalStep } from "@/components/custom/configure-workflow";
import { RemoteSetupSection } from "@/components/custom/remote-setup-section";
import { SectionCard } from "@/components/custom/section-card";
import { DoctorChecklist } from "@/components/custom/setup-checklist";

type ConfigureMode = "guided" | "advanced";

interface ConfigureExperienceProps {
  initialSummary: SetupGuiViewModel;
  initialRemoteSummary: RemoteSetupSummary;
  formDefaults: {
    env: {
      harnessConfigPath: string;
      githubDispatchRepository: string;
      suggestedHarnessDispatchRepo?: string;
      secretPresence: {
        LINEAR_API_KEY: boolean;
        CURSOR_API_KEY: boolean;
        GITHUB_TOKEN: boolean;
      };
    };
    config: LocalConfigFormInput;
  };
}

export function ConfigureExperience({
  initialSummary,
  initialRemoteSummary,
  formDefaults,
}: ConfigureExperienceProps) {
  const [mode, setMode] = useState<ConfigureMode>("guided");
  const [showGuidedDetails, setShowGuidedDetails] = useState(false);
  const [summary, setSummary] = useState(initialSummary);
  const [remoteSummary, setRemoteSummary] = useState(initialRemoteSummary);
  const [uiState, setUiState] = useState<FirstRunReadinessUiState>({});
  const [guidedWorkflowStep, setGuidedWorkflowStep] =
    useState<GuidedLocalStep>("connect-services");

  const readiness = useMemo(
    () =>
      deriveFirstRunReadiness({
        summary,
        remoteSummary,
        uiState,
        staleSmokeDiagnostics: remoteSummary.staleSmokeDiagnostics,
      }),
    [summary, remoteSummary, uiState],
  );

  const staleTargetRepoNeedsAttention =
    readiness.staleSmokeDiagnostics.staleTargetRepos.length > 0;
  const staleDispatchRepoNeedsAttention = Boolean(
    readiness.staleSmokeDiagnostics.staleHarnessDispatchRepo,
  );

  const initialEnvForWorkflow = useMemo(() => {
    const suggested = formDefaults.env.suggestedHarnessDispatchRepo;
    const shouldResetDispatch =
      readiness.staleSmokeDiagnostics.staleHarnessDispatchRepo && suggested;

    return {
      harnessConfigPath: formDefaults.env.harnessConfigPath,
      githubDispatchRepository: shouldResetDispatch
        ? suggested
        : formDefaults.env.githubDispatchRepository,
      suggestedHarnessDispatchRepo: suggested,
      secretPresence: formDefaults.env.secretPresence,
    };
  }, [formDefaults.env, readiness.staleSmokeDiagnostics.staleHarnessDispatchRepo]);

  const handleLocalUiStateChange = useCallback(
    (state: { localPreviewStale: boolean }) => {
      setUiState((current) => {
        if (current.localPreviewStale === state.localPreviewStale) {
          return current;
        }
        return {
          ...current,
          localPreviewStale: state.localPreviewStale,
        };
      });
    },
    [],
  );

  const handleRemoteUiStateChange = useCallback(
    (state: { remoteSecretPreviewStale: boolean }) => {
      setUiState((current) => {
        if (current.remoteSecretPreviewStale === state.remoteSecretPreviewStale) {
          return current;
        }
        return {
          ...current,
          remoteSecretPreviewStale: state.remoteSecretPreviewStale,
        };
      });
    },
    [],
  );

  const handleLocalReadinessReviewed = useCallback(() => {
    setUiState((current) => ({
      ...current,
      localReadinessReviewed: true,
    }));
  }, []);

  const actionPanelRef = useRef<HTMLDivElement | null>(null);

  const handlePrimaryTaskAction = useCallback(() => {
    if (
      readiness.currentStepId === "local-readiness" &&
      readiness.localReadinessBlockersCleared &&
      !readiness.localReadinessReviewed
    ) {
      handleLocalReadinessReviewed();
      return;
    }

    actionPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const previewButton = actionPanelRef.current?.querySelector<HTMLButtonElement>(
      "[data-primary-preview-button='true']",
    );
    previewButton?.focus();
  }, [
    handleLocalReadinessReviewed,
    readiness.currentStepId,
    readiness.localReadinessBlockersCleared,
    readiness.localReadinessReviewed,
  ]);

  const renderGuidedActionPanel = () => {
    if (readiness.currentStepId === "local-setup") {
      return (
        <ConfigureWorkflow
          key="guided-local-setup-workflow"
          mode="guided"
          guidedStep={guidedWorkflowStep}
          onGuidedStepChange={setGuidedWorkflowStep}
          initialEnv={initialEnvForWorkflow}
          initialConfig={formDefaults.config}
          highlightStaleDispatch={staleDispatchRepoNeedsAttention}
          highlightStaleTarget={staleTargetRepoNeedsAttention}
          onSummaryUpdated={setSummary}
          onUiStateChange={handleLocalUiStateChange}
        />
      );
    }

    switch (readiness.currentStepId) {
      case "local-readiness":
        return (
          <SectionCard
            title="Local readiness checks"
            description="Local setup files were created. Next, check whether this machine is ready to run the harness."
          >
            <div className={SPACING.stackSm}>
              <p className="text-sm text-muted-foreground">
                Your <code className="text-xs">.env.local</code> and{" "}
                <code className="text-xs">.harness/config.local.json</code> files
                are in place. Review the checks below, then continue when you are
                ready.
              </p>

              <DoctorChecklist checks={summary.doctor.checks} />

              {summary.doctor.remoteChecksNote ? (
                <p className="text-sm text-muted-foreground">
                  {summary.doctor.remoteChecksNote}
                </p>
              ) : null}

              {readiness.highestPriorityBlocker?.stepId === "local-readiness" ? (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Next action</p>
                  <p className="text-sm text-muted-foreground">
                    {readiness.highestPriorityBlocker.action.replace(/^Next:\s*/, "")}
                  </p>
                </div>
              ) : readiness.nextRecommendedAction?.stepId === "local-readiness" ? (
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="text-sm font-medium">Next action</p>
                  <p className="text-sm text-muted-foreground">
                    {readiness.nextRecommendedAction.label}
                  </p>
                </div>
              ) : null}

              {readiness.localReadinessBlockersCleared &&
              !readiness.localReadinessReviewed ? (
                <Button type="button" onClick={handleLocalReadinessReviewed}>
                  Continue to remote setup
                </Button>
              ) : null}
            </div>
          </SectionCard>
        );
      case "remote-setup":
        return (
          <RemoteSetupSection
            initialSummary={remoteSummary}
            onSummaryUpdated={setRemoteSummary}
            onUiStateChange={handleRemoteUiStateChange}
            blockedByUpstream={readiness.remoteSetupBlockedByUpstream}
          />
        );
      case "ready-for-first-run":
        return (
          <SectionCard
            title="Ready for first run"
            description="Setup readiness only. No live harness phase is available in M6."
          >
            <div className={SPACING.stackSm}>
              <StatusBadge
                label={
                  readiness.readyForFirstRun
                    ? "Ready for first run"
                    : "Blocked for first run"
                }
                variant={readiness.readyForFirstRun ? "success" : "warning"}
              />
              {readiness.readyForFirstRun ? (
                <p className="text-sm text-muted-foreground">
                  Your harness setup is ready. A later milestone can add a safe
                  first-issue dry run or no-op harness validation.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {readiness.highestPriorityBlocker?.action ??
                    "Complete the earlier setup steps first."}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {readiness.prohibitedActionsNote}
              </p>
            </div>
          </SectionCard>
        );
    }
  };

  const showGuidedPrimaryTaskCard =
    readiness.primaryTask !== undefined &&
    readiness.currentStepId !== "local-setup";

  const configBadgeLabel = summary.overview.operatorConfigResolved
    ? "Config resolved"
    : summary.overview.configResolved
      ? "Template config loaded"
      : "Not configured yet";
  const configBadgeVariant = summary.overview.operatorConfigResolved
    ? "success"
    : "secondary";

  return (
    <div className={LAYOUT.sectionStack}>
      <section className={SPACING.section}>
        <div className={SPACING.stackSm}>
          <h2 className={RESPONSIVE.pageTitle}>Settings / Configure</h2>
          <p className={RESPONSIVE.pageDescription}>
            Guided first-run readiness for the Product Development Harness.
            Complete local setup, local readiness checks, and remote setup before
            your first future harness run.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={SPACING.inline}>
            <StatusBadge
              label={
                readiness.readyForFirstRun
                  ? "Ready for first run"
                  : "Setup in progress"
              }
              variant={readiness.readyForFirstRun ? "success" : "warning"}
            />
            {mode === "advanced" ? (
              <StatusBadge
                label={configBadgeLabel}
                variant={configBadgeVariant}
              />
            ) : null}
          </div>
          {mode === "guided" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode("advanced")}
            >
              Advanced checklist view
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode("guided")}
            >
              Back to guided flow
            </Button>
          )}
        </div>
      </section>

      {mode === "advanced" ? <ReadinessBanner readiness={readiness} /> : null}

      {mode === "guided" ? (
        <div className={SPACING.section}>
          {showGuidedPrimaryTaskCard ? (
            <PrimarySetupTaskCard
              task={readiness.primaryTask!}
              onPrimaryAction={handlePrimaryTaskAction}
              onShowDetails={() => {
                setShowGuidedDetails(true);
                setMode("advanced");
              }}
            />
          ) : null}

          <div ref={actionPanelRef}>{renderGuidedActionPanel()}</div>

          {showGuidedDetails ? (
            <ReadinessBanner readiness={readiness} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {readiness.prohibitedActionsNote}
            </p>
          )}
        </div>
      ) : (
        <SetupDashboard
          summary={summary}
          remoteSummary={remoteSummary}
          readiness={readiness}
          formDefaults={formDefaults}
          onSummaryUpdated={setSummary}
          onRemoteSummaryUpdated={setRemoteSummary}
          onLocalUiStateChange={handleLocalUiStateChange}
          onRemoteUiStateChange={handleRemoteUiStateChange}
        />
      )}
    </div>
  );
}
