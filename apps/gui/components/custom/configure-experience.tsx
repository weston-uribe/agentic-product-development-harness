"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SetupGuiViewModel } from "@/lib/setup-server";
import type { RemoteSetupSummary } from "@/lib/setup-server";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import type { LinearSetupSummary } from "@harness/setup/linear-setup-summary";
import type { VercelSetupSummary } from "@harness/setup/vercel-setup-summary";
import type { ControlPlaneReadinessContext } from "@harness/setup/control-plane-types";
import {
  deriveFirstRunReadiness,
  shouldInvalidateCloudSecretsApplyEvidence,
  type CloudSecretsApplyEvidence,
  type FirstRunReadinessUiState,
  type FirstRunStepId,
} from "@harness/setup/first-run-readiness";
import { computeCloudSecretsConfigStateFingerprint } from "@harness/setup/control-plane-readiness";

import { LAYOUT, RESPONSIVE, SPACING } from "@/lib/constants";
import {
  clampGuidedDisplayStep,
  defaultGuidedDisplayStep,
  getPreviousGuidedDisplayStep,
  GUIDED_DISPLAY_STEP_AFTER_LOCAL_APPLY,
  GUIDED_DISPLAY_STEP_AFTER_LOCAL_READINESS,
  GUIDED_DISPLAY_STEP_AFTER_WORKFLOW_READY,
  GUIDED_DISPLAY_STEP_AFTER_CONNECT_SERVICES,
  GUIDED_DISPLAY_STEP_AFTER_CLOUD_SECRETS,
  localSetupFilesExist,
  shouldReadinessAdvanceGuidedDisplay,
  shouldShowGuidedBackButton,
  type GuidedDisplayStepId,
  type GuidedLocalSetupStep,
} from "@/lib/guided-setup";
import {
  syncLinearSummaryFromEnvPresence,
  syncRemoteSummaryFromEnvPresence,
  syncVercelSummaryFromEnvPresence,
} from "@harness/setup/sync-downstream-summaries";
import type { RemoteTargetWorkflowApplyResult } from "@harness/setup/remote-actions";
import type { TargetWorkflowFinalizationResult } from "@harness/setup/target-workflow-finalization-types";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/status-badge";
import { ReadinessBanner } from "@/components/custom/readiness-banner";
import { SetupDashboard } from "@/components/custom/setup-dashboard";
import { ConfigureWorkflow } from "@/components/custom/configure-workflow";
import { GuidedLinearWorkspaceCard } from "@/components/custom/guided-linear-workspace-card";
import { GuidedVercelBridgeCard } from "@/components/custom/guided-vercel-bridge-card";
import { GuidedLocalReadinessCard } from "@/components/custom/guided-local-readiness-card";
import { GuidedCloudSecretsCard } from "@/components/custom/guided-cloud-secrets-card";
import { GuidedTargetWorkflowCard } from "@/components/custom/guided-target-workflow-card";
import { SectionCard } from "@/components/custom/section-card";
import { ObservabilitySettingsCard } from "@/components/custom/observability-settings-card";
import {
  guidedDisplayStepIndex,
} from "@/lib/guided-setup";
import { postObservabilityAnalyticsEvent } from "@/lib/observability-client";
import { bucketDurationMs } from "@harness/observability/privacy-schema.js";

type ConfigureMode = "guided" | "advanced";

interface ConfigureExperienceProps {
  initialSummary: SetupGuiViewModel;
  initialRemoteSummary: RemoteSetupSummary;
  initialLinearSummary: LinearSetupSummary;
  initialVercelSummary: VercelSetupSummary;
  formDefaults: {
    env: {
      harnessConfigPath: string;
      githubDispatchRepository: string;
      suggestedHarnessDispatchRepo?: string;
      secretPresence: {
        LINEAR_API_KEY: boolean;
        CURSOR_API_KEY: boolean;
        GITHUB_TOKEN: boolean;
        VERCEL_TOKEN: boolean;
      };
    };
    config: LocalConfigFormInput;
  };
  observabilityNonce: string | null;
}

function buildControlPlaneContext(input: {
  linearSummary: LinearSetupSummary;
  vercelSummary: VercelSetupSummary;
  summary: SetupGuiViewModel;
}): ControlPlaneReadinessContext {
  return {
    state: {
      version: 1,
      linear: input.linearSummary.controlPlane?.linear,
      vercel: input.vercelSummary.controlPlane?.vercel,
    },
    linearTeamKeyFromConfig: input.summary.configSummary?.linearTeamKey,
  };
}

export function ConfigureExperience({
  initialSummary,
  initialRemoteSummary,
  initialLinearSummary,
  initialVercelSummary,
  formDefaults,
  observabilityNonce,
}: ConfigureExperienceProps) {
  const [mode, setMode] = useState<ConfigureMode>("guided");
  const [summary, setSummary] = useState(initialSummary);
  const [remoteSummary, setRemoteSummary] = useState(initialRemoteSummary);
  const [linearSummary, setLinearSummary] = useState(initialLinearSummary);
  const [vercelSummary, setVercelSummary] = useState(initialVercelSummary);
  const [uiState, setUiState] = useState<FirstRunReadinessUiState>({});
  const controlPlaneContext = useMemo(
    () =>
      buildControlPlaneContext({
        linearSummary,
        vercelSummary,
        summary,
      }),
    [linearSummary, vercelSummary, summary],
  );

  const [displayedGuidedStep, setDisplayedGuidedStep] =
    useState<GuidedDisplayStepId>(() =>
      defaultGuidedDisplayStep({
        currentStepId: deriveFirstRunReadiness({
          summary: initialSummary,
          remoteSummary: initialRemoteSummary,
          uiState: {},
          staleSmokeDiagnostics: initialRemoteSummary.staleSmokeDiagnostics,
          controlPlaneContext: buildControlPlaneContext({
            linearSummary: initialLinearSummary,
            vercelSummary: initialVercelSummary,
            summary: initialSummary,
          }),
        }).currentStepId,
        summary: initialSummary,
      }),
    );
  const [workflowInstallPendingByRepo, setWorkflowInstallPendingByRepo] =
    useState<Record<string, RemoteTargetWorkflowApplyResult>>({});
  const [workflowFinalizationByRepo, setWorkflowFinalizationByRepo] = useState<
    Record<string, TargetWorkflowFinalizationResult>
  >({});
  const [workflowAwaitingMerge, setWorkflowAwaitingMerge] = useState(false);
  const previousReadinessStepRef = useRef<FirstRunStepId | null>(null);
  const stepVisitCountsRef = useRef<Partial<Record<GuidedDisplayStepId, number>>>(
    {},
  );
  const lastRecordedStepViewRef = useRef<GuidedDisplayStepId | null>(null);
  const stepStartedAtRef = useRef<Partial<Record<GuidedDisplayStepId, number>>>(
    {},
  );

  const recordStepViewed = useCallback(
    (stepId: GuidedDisplayStepId) => {
      if (lastRecordedStepViewRef.current === stepId) {
        return;
      }
      lastRecordedStepViewRef.current = stepId;
      const visitOrdinal = stepVisitCountsRef.current[stepId] ?? 0;
      stepVisitCountsRef.current[stepId] = visitOrdinal + 1;
      stepStartedAtRef.current[stepId] = Date.now();
      const stepNumber = guidedDisplayStepIndex(stepId) + 1;
      const payload = {
        type: "p_dev_configure_step_viewed" as const,
        stepId,
        stepNumber,
        resumed: false,
        revisited: visitOrdinal > 0,
      };
      if (observabilityNonce) {
        void postObservabilityAnalyticsEvent(payload, observabilityNonce);
      }
    },
    [observabilityNonce],
  );

  const recordStepCompleted = useCallback(
    (
      stepId: GuidedDisplayStepId,
      outcome:
        | "success"
        | "skipped_already_complete"
        | "user_correctable_blocked"
        | "operational_failure"
        | "unknown" = "success",
    ) => {
      if (!observabilityNonce) {
        return;
      }
      const startedAt = stepStartedAtRef.current[stepId];
      const durationBucket = bucketDurationMs(
        startedAt ? Date.now() - startedAt : -1,
      );
      const stepNumber = guidedDisplayStepIndex(stepId) + 1;
      void postObservabilityAnalyticsEvent(
        {
          type: "p_dev_configure_step_completed",
          stepId,
          stepNumber,
          resumed: false,
          revisited: (stepVisitCountsRef.current[stepId] ?? 0) > 1,
          durationBucket,
          completionOutcome: outcome,
        },
        observabilityNonce,
      );
    },
    [observabilityNonce],
  );

  useEffect(() => {
    recordStepViewed(displayedGuidedStep);
  }, [displayedGuidedStep, recordStepViewed]);

  const readiness = useMemo(
    () =>
      deriveFirstRunReadiness({
        summary,
        remoteSummary,
        uiState,
        staleSmokeDiagnostics: remoteSummary.staleSmokeDiagnostics,
        controlPlaneContext,
      }),
    [summary, remoteSummary, uiState, controlPlaneContext],
  );

  useEffect(() => {
    const nextStepId = readiness.currentStepId;
    const previousStepId = previousReadinessStepRef.current;
    if (previousStepId === null) {
      previousReadinessStepRef.current = nextStepId;
      return;
    }
    if (shouldReadinessAdvanceGuidedDisplay(previousStepId, nextStepId)) {
      setDisplayedGuidedStep(
        defaultGuidedDisplayStep({
          currentStepId: nextStepId,
          summary,
        }),
      );
    }
    previousReadinessStepRef.current = nextStepId;
  }, [readiness.currentStepId, summary]);

  useEffect(() => {
    if (readiness.readyForFirstRun) {
      setDisplayedGuidedStep("ready-for-first-run");
    }
  }, [readiness.readyForFirstRun]);

  useEffect(() => {
    if (
      displayedGuidedStep === "ready-for-first-run" &&
      !readiness.readyForFirstRun
    ) {
      setDisplayedGuidedStep(
        defaultGuidedDisplayStep({
          currentStepId: readiness.currentStepId,
          summary,
        }),
      );
    }
  }, [
    displayedGuidedStep,
    readiness.readyForFirstRun,
    readiness.currentStepId,
    summary,
  ]);

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
        ? suggested ?? ""
        : formDefaults.env.githubDispatchRepository || suggested || "",
      savedHarnessDispatchRepository: formDefaults.env.githubDispatchRepository,
      suggestedHarnessDispatchRepo: suggested,
      secretPresence: {
        LINEAR_API_KEY: summary.envKeyPresence.LINEAR_API_KEY,
        CURSOR_API_KEY: summary.envKeyPresence.CURSOR_API_KEY,
        GITHUB_TOKEN: summary.envKeyPresence.GITHUB_TOKEN,
        VERCEL_TOKEN: summary.envKeyPresence.VERCEL_TOKEN,
      },
    };
  }, [
    formDefaults.env,
    readiness.staleSmokeDiagnostics.staleHarnessDispatchRepo,
    summary.envKeyPresence.CURSOR_API_KEY,
    summary.envKeyPresence.GITHUB_TOKEN,
    summary.envKeyPresence.LINEAR_API_KEY,
    summary.envKeyPresence.VERCEL_TOKEN,
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
    (state: {
      remoteSecretPreviewStale?: boolean;
      cloudSecretsApplyEvidence?: CloudSecretsApplyEvidence;
    }) => {
      setUiState((current) => {
        let next = current;
        if (
          state.remoteSecretPreviewStale !== undefined &&
          current.remoteSecretPreviewStale !== state.remoteSecretPreviewStale
        ) {
          next = {
            ...next,
            remoteSecretPreviewStale: state.remoteSecretPreviewStale,
          };
        }
        if ("cloudSecretsApplyEvidence" in state) {
          if (
            current.cloudSecretsApplyEvidence === state.cloudSecretsApplyEvidence
          ) {
            return next === current ? current : next;
          }
          next = {
            ...next,
            cloudSecretsApplyEvidence: state.cloudSecretsApplyEvidence,
          };
        }
        return next === current ? current : next;
      });
    },
    [],
  );

  const handleLinearUiStateChange = useCallback(
    (state: { linearPreviewStale: boolean }) => {
      setUiState((current) => {
        if (current.linearPreviewStale === state.linearPreviewStale) {
          return current;
        }
        return {
          ...current,
          linearPreviewStale: state.linearPreviewStale,
        };
      });
    },
    [],
  );

  const handleVercelUiStateChange = useCallback(
    (state: { vercelPreviewStale: boolean }) => {
      setUiState((current) => {
        if (current.vercelPreviewStale === state.vercelPreviewStale) {
          return current;
        }
        return {
          ...current,
          vercelPreviewStale: state.vercelPreviewStale,
        };
      });
    },
    [],
  );

  const handleConnectServicesComplete = useCallback(async () => {
    recordStepCompleted("connect-services");
    setDisplayedGuidedStep(GUIDED_DISPLAY_STEP_AFTER_CONNECT_SERVICES);
    try {
      const response = await fetch("/api/setup/linear-summary");
      const data = await response.json();
      if (response.ok) {
        setLinearSummary(data as LinearSetupSummary);
      }
    } catch {
      // Fall back to env presence synced via handleSummaryUpdated after Step 1 save.
    }
  }, [recordStepCompleted]);

  const handleLinearWorkspaceContinue = useCallback(() => {
    recordStepCompleted("linear-workspace");
    setDisplayedGuidedStep("vercel-bridge");
  }, [recordStepCompleted]);

  const handleVercelBridgeContinue = useCallback(() => {
    recordStepCompleted("vercel-bridge");
    setDisplayedGuidedStep("choose-target-repos");
  }, [recordStepCompleted]);

  const handleLocalReadinessReviewed = useCallback(() => {
    recordStepCompleted("local-readiness");
    setUiState((current) => ({
      ...current,
      localReadinessReviewed: true,
    }));
    setDisplayedGuidedStep(GUIDED_DISPLAY_STEP_AFTER_LOCAL_READINESS);
  }, [recordStepCompleted]);

  const handleCloudSecretsReviewed = useCallback(() => {
    recordStepCompleted("cloud-secrets");
    setUiState((current) => ({
      ...current,
      cloudSecretsReviewed: true,
    }));
    setDisplayedGuidedStep(GUIDED_DISPLAY_STEP_AFTER_CLOUD_SECRETS);
  }, [recordStepCompleted]);

  const handleSummaryUpdated = useCallback((nextSummary: SetupGuiViewModel) => {
    setSummary(nextSummary);
    setLinearSummary((current) =>
      syncLinearSummaryFromEnvPresence(current, nextSummary.envKeyPresence),
    );
    setVercelSummary((current) =>
      syncVercelSummaryFromEnvPresence(current, nextSummary.envKeyPresence),
    );
    setRemoteSummary((current) =>
      syncRemoteSummaryFromEnvPresence(current, nextSummary.envKeyPresence),
    );
    setUiState((current) => {
      const nextControlPlaneContext = buildControlPlaneContext({
        linearSummary,
        vercelSummary,
        summary: nextSummary,
      });
      const invalidateEvidence = shouldInvalidateCloudSecretsApplyEvidence({
        evidence: current.cloudSecretsApplyEvidence,
        currentConfigStateFingerprint: computeCloudSecretsConfigStateFingerprint({
          setupSummary: nextSummary,
          controlPlaneContext: nextControlPlaneContext,
        }),
        harnessDispatchRepo: remoteSummary.harnessDispatchRepo,
      });
      return {
        ...current,
        linearPreviewStale: true,
        vercelPreviewStale: true,
        remoteSecretPreviewStale: true,
        cloudSecretsApplyEvidence: invalidateEvidence
          ? undefined
          : current.cloudSecretsApplyEvidence,
      };
    });
  }, [linearSummary, remoteSummary.harnessDispatchRepo, vercelSummary]);

  const handleGuidedWorkflowSetupComplete = useCallback(() => {
    recordStepCompleted("target-workflow");
    if (observabilityNonce) {
      void postObservabilityAnalyticsEvent(
        { type: "p_dev_setup_completed" },
        observabilityNonce,
      );
    }
    setWorkflowAwaitingMerge(false);
    setWorkflowInstallPendingByRepo({});
    setWorkflowFinalizationByRepo({});
  }, [observabilityNonce, recordStepCompleted]);

  const handleGuidedLocalApplySuccess = useCallback(() => {
    recordStepCompleted("choose-target-repos");
    setUiState((current) => ({
      ...current,
      localReadinessReviewed: false,
      cloudSecretsReviewed: false,
      cloudSecretsApplyEvidence: undefined,
      remoteSecretPreviewStale: true,
      localPreviewStale: false,
    }));
    setDisplayedGuidedStep(GUIDED_DISPLAY_STEP_AFTER_LOCAL_APPLY);
  }, [recordStepCompleted]);

  const handleGuidedLocalStepChange = useCallback((step: GuidedLocalSetupStep) => {
    setDisplayedGuidedStep(step);
  }, []);

  const invalidateDownstreamFromGuidedStep = useCallback(
    (step: GuidedDisplayStepId) => {
      if (
        step === "connect-services" ||
        step === "linear-workspace" ||
        step === "vercel-bridge" ||
        step === "choose-target-repos"
      ) {
        setUiState((current) => ({
          ...current,
          localReadinessReviewed: false,
          cloudSecretsReviewed: false,
          cloudSecretsApplyEvidence: undefined,
          remoteSecretPreviewStale: true,
          linearPreviewStale: step === "connect-services" || step === "linear-workspace"
            ? true
            : current.linearPreviewStale,
          vercelPreviewStale: step === "connect-services" ||
            step === "linear-workspace" ||
            step === "vercel-bridge"
            ? true
            : current.vercelPreviewStale,
        }));
        return;
      }

      if (step === "local-readiness") {
        setUiState((current) => ({
          ...current,
          cloudSecretsReviewed: false,
          cloudSecretsApplyEvidence: undefined,
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
    const nextDisplay = clampGuidedDisplayStep({
      target: previous,
      currentStepId: readiness.currentStepId,
    });
    setDisplayedGuidedStep(nextDisplay);
    invalidateDownstreamFromGuidedStep(nextDisplay);
  }, [
    displayedGuidedStep,
    invalidateDownstreamFromGuidedStep,
    readiness.currentStepId,
  ]);

  const showGuidedBackButton =
    mode === "guided" && shouldShowGuidedBackButton(displayedGuidedStep);

  const actionPanelRef = useRef<HTMLDivElement | null>(null);

  const renderGuidedActionPanel = () => {
    switch (displayedGuidedStep) {
      case "connect-services":
        return (
          <ConfigureWorkflow
            key="guided-connect-services"
            mode="guided"
            guidedStep="connect-services"
            initialEnv={initialEnvForWorkflow}
            initialConfig={formDefaults.config}
            onSummaryUpdated={handleSummaryUpdated}
            onConnectServicesComplete={handleConnectServicesComplete}
          />
        );
      case "linear-workspace":
        return (
          <GuidedLinearWorkspaceCard
            readiness={readiness}
            initialSummary={linearSummary}
            linearApiKeyConfigured={summary.envKeyPresence.LINEAR_API_KEY}
            onSummaryUpdated={setLinearSummary}
            onUiStateChange={handleLinearUiStateChange}
            onContinue={handleLinearWorkspaceContinue}
          />
        );
      case "vercel-bridge":
        return (
          <GuidedVercelBridgeCard
            readiness={readiness}
            initialSummary={vercelSummary}
            onSummaryUpdated={setVercelSummary}
            onUiStateChange={handleVercelUiStateChange}
            onContinue={handleVercelBridgeContinue}
          />
        );
      case "choose-target-repos":
        return (
          <ConfigureWorkflow
            key="guided-local-setup"
            mode="guided"
            guidedStep="choose-target-repos"
            initialEnv={initialEnvForWorkflow}
            initialConfig={formDefaults.config}
            highlightStaleDispatch={staleDispatchRepoNeedsAttention}
            highlightStaleTarget={staleTargetRepoNeedsAttention}
            onSummaryUpdated={handleSummaryUpdated}
            onUiStateChange={handleLocalUiStateChange}
            onGuidedLocalApplySuccess={handleGuidedLocalApplySuccess}
            localSetupFilesExist={localSetupFilesExist(summary)}
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
            setupSummary={summary}
            controlPlaneContext={controlPlaneContext}
            remoteSecretPreviewStale={uiState.remoteSecretPreviewStale}
            cloudSecretsApplyEvidence={uiState.cloudSecretsApplyEvidence}
            initialSummary={remoteSummary}
            onSummaryUpdated={setRemoteSummary}
            onUiStateChange={handleRemoteUiStateChange}
            onContinue={handleCloudSecretsReviewed}
            blockedByUpstream={readiness.remoteSetupBlockedByUpstream}
            onGoToHarnessRepo={() => setDisplayedGuidedStep("choose-target-repos")}
            onGoToConnectServices={() =>
              setDisplayedGuidedStep("connect-services")
            }
          />
        );
      case "target-workflow":
        return (
          <GuidedTargetWorkflowCard
            initialSummary={remoteSummary}
            onSummaryUpdated={setRemoteSummary}
            onWorkflowSetupComplete={handleGuidedWorkflowSetupComplete}
            onWorkflowAwaitingMergeChange={setWorkflowAwaitingMerge}
            pendingInstallByRepo={workflowInstallPendingByRepo}
            finalizationByRepo={workflowFinalizationByRepo}
            onPendingInstallChange={setWorkflowInstallPendingByRepo}
            onFinalizationChange={setWorkflowFinalizationByRepo}
            blockedByUpstream={readiness.remoteSetupBlockedByUpstream}
          />
        );
      case "ready-for-first-run":
        return (
          <SectionCard
            title="Setup complete"
            description="Harness setup is ready for a future first run."
          >
            <div className={SPACING.stackSm}>
              <StatusBadge label="Setup complete" variant="success" />
              <p className="text-sm text-muted-foreground">
                Your harness setup is ready. The target workflow install finished
                automatically when production verification succeeded.
                A later milestone can add a safe first-issue dry run or no-op
                harness validation.
              </p>
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

  const guidedStatusBadgeLabel = readiness.readyForFirstRun
    ? "Setup complete"
    : workflowAwaitingMerge
      ? "Finalizing workflow install"
      : "Setup in progress";

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
                label={guidedStatusBadgeLabel}
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

      <ObservabilitySettingsCard nonce={observabilityNonce} />

      {mode === "advanced" ? <ReadinessBanner readiness={readiness} /> : null}

      {mode === "guided" ? (
        <div className={SPACING.section}>
          <div ref={actionPanelRef}>{renderGuidedActionPanel()}</div>
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
