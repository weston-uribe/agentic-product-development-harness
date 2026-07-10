"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SetupGuiViewModel } from "@/lib/setup-server";
import type { RemoteSetupSummary } from "@/lib/setup-server";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import {
  deriveFirstRunReadiness,
  type FirstRunReadinessUiState,
  type FirstRunStepId,
} from "@harness/setup/first-run-readiness";

import { LAYOUT, RESPONSIVE, SPACING } from "@/lib/constants";
import {
  defaultGuidedDisplayStep,
  getPreviousGuidedDisplayStep,
  shouldShowGuidedBackButton,
  type GuidedDisplayStepId,
  type GuidedLocalSetupStep,
} from "@/lib/guided-setup";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/status-badge";
import { ReadinessBanner } from "@/components/custom/readiness-banner";
import { SetupDashboard } from "@/components/custom/setup-dashboard";
import { ConfigureWorkflow } from "@/components/custom/configure-workflow";
import { GuidedLocalReadinessCard } from "@/components/custom/guided-local-readiness-card";
import { GuidedCloudSecretsCard } from "@/components/custom/guided-cloud-secrets-card";
import { GuidedTargetWorkflowCard } from "@/components/custom/guided-target-workflow-card";
import { SectionCard } from "@/components/custom/section-card";

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
  const [summary, setSummary] = useState(initialSummary);
  const [remoteSummary, setRemoteSummary] = useState(initialRemoteSummary);
  const [uiState, setUiState] = useState<FirstRunReadinessUiState>({});
  const [displayedGuidedStep, setDisplayedGuidedStep] =
    useState<GuidedDisplayStepId>(() =>
      defaultGuidedDisplayStep({
        currentStepId: deriveFirstRunReadiness({
          summary: initialSummary,
          remoteSummary: initialRemoteSummary,
          uiState: {},
          staleSmokeDiagnostics: initialRemoteSummary.staleSmokeDiagnostics,
        }).currentStepId,
        summary: initialSummary,
      }),
    );
  const previousReadinessStepRef = useRef<FirstRunStepId | null>(null);

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

  useEffect(() => {
    const nextStepId = readiness.currentStepId;
    const previousStepId = previousReadinessStepRef.current;
    if (previousStepId === null) {
      previousReadinessStepRef.current = nextStepId;
      return;
    }
    if (previousStepId !== nextStepId) {
      setDisplayedGuidedStep(
        defaultGuidedDisplayStep({
          currentStepId: nextStepId,
          summary,
        }),
      );
      previousReadinessStepRef.current = nextStepId;
    }
  }, [readiness.currentStepId, summary]);

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
      secretPresence: {
        LINEAR_API_KEY: summary.envKeyPresence.LINEAR_API_KEY,
        CURSOR_API_KEY: summary.envKeyPresence.CURSOR_API_KEY,
        GITHUB_TOKEN: summary.envKeyPresence.GITHUB_TOKEN,
      },
    };
  }, [
    formDefaults.env,
    readiness.staleSmokeDiagnostics.staleHarnessDispatchRepo,
    summary.envKeyPresence.CURSOR_API_KEY,
    summary.envKeyPresence.GITHUB_TOKEN,
    summary.envKeyPresence.LINEAR_API_KEY,
  ]);

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

  const handleCloudSecretsReviewed = useCallback(() => {
    setUiState((current) => ({
      ...current,
      cloudSecretsReviewed: true,
    }));
  }, []);

  const handleSummaryUpdated = useCallback((nextSummary: SetupGuiViewModel) => {
    setSummary(nextSummary);
  }, []);

  const handleGuidedLocalStepChange = useCallback((step: GuidedLocalSetupStep) => {
    setDisplayedGuidedStep(step);
  }, []);

  const invalidateDownstreamFromGuidedStep = useCallback(
    (step: GuidedDisplayStepId) => {
      if (step === "connect-services" || step === "choose-target-repos") {
        setUiState((current) => ({
          ...current,
          localReadinessReviewed: false,
          cloudSecretsReviewed: false,
          remoteSecretPreviewStale: true,
          localPreviewStale: true,
        }));
        return;
      }

      if (step === "local-readiness") {
        setUiState((current) => ({
          ...current,
          cloudSecretsReviewed: false,
          remoteSecretPreviewStale: true,
        }));
      }
    },
    [],
  );

  const handleGuidedBack = useCallback(() => {
    const previous = getPreviousGuidedDisplayStep(displayedGuidedStep);
    if (!previous) {
      return;
    }
    setDisplayedGuidedStep(previous);
    invalidateDownstreamFromGuidedStep(previous);
  }, [displayedGuidedStep, invalidateDownstreamFromGuidedStep]);

  const showGuidedBackButton =
    mode === "guided" && shouldShowGuidedBackButton(displayedGuidedStep);

  const actionPanelRef = useRef<HTMLDivElement | null>(null);

  const renderGuidedActionPanel = () => {
    switch (displayedGuidedStep) {
      case "connect-services":
      case "choose-target-repos":
        return (
          <ConfigureWorkflow
            key="guided-local-setup-workflow"
            mode="guided"
            guidedStep={displayedGuidedStep}
            onGuidedStepChange={handleGuidedLocalStepChange}
            initialEnv={initialEnvForWorkflow}
            initialConfig={formDefaults.config}
            highlightStaleDispatch={staleDispatchRepoNeedsAttention}
            highlightStaleTarget={staleTargetRepoNeedsAttention}
            onSummaryUpdated={handleSummaryUpdated}
            onUiStateChange={handleLocalUiStateChange}
          />
        );
      case "local-readiness":
        return (
          <GuidedLocalReadinessCard
            readiness={readiness}
            onContinue={handleLocalReadinessReviewed}
          />
        );
      case "cloud-secrets":
        return (
          <GuidedCloudSecretsCard
            readiness={readiness}
            initialSummary={remoteSummary}
            onSummaryUpdated={setRemoteSummary}
            onUiStateChange={handleRemoteUiStateChange}
            onContinue={handleCloudSecretsReviewed}
            blockedByUpstream={readiness.remoteSetupBlockedByUpstream}
          />
        );
      case "target-workflow":
        return (
          <GuidedTargetWorkflowCard
            initialSummary={remoteSummary}
            onSummaryUpdated={setRemoteSummary}
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
            Complete local setup, local readiness checks, cloud secrets, and
            target workflow install before your first future harness run.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {showGuidedBackButton ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleGuidedBack}
              >
                Back
              </Button>
            ) : null}
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
          <div ref={actionPanelRef}>{renderGuidedActionPanel()}</div>
          <p className="text-sm text-muted-foreground">
            {readiness.prohibitedActionsNote}
          </p>
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
