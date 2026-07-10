"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import { prepareGuidedConfigFormInput } from "@harness/setup/guided-config-form";
import type {
  LocalSetupFormPayload,
  LocalSetupPreviewResult,
} from "@harness/setup/local-apply-actions";
import type { SetupGuiViewModel } from "@/lib/setup-server";
import { FORM, SPACING } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SectionCard } from "@/components/custom/section-card";
import {
  EnvironmentConfigForm,
  INITIAL_SERVICE_VERIFICATION,
  type EnvironmentFormValues,
  type EnvironmentFormPresence,
  type ServiceKey,
  type ServiceVerificationMap,
} from "@/components/custom/environment-config-form";
import {
  GITHUB_REPO_URL_PATTERN,
  TargetRepoConfigForm,
  type RepoVerificationUi,
} from "@/components/custom/target-repo-config-form";
import { LocalWritePreview } from "@/components/custom/local-write-preview";
import { LocalWriteConfirmation } from "@/components/custom/local-write-confirmation";
import { ReviewGeneratedFilesDisclosure } from "@/components/custom/review-generated-files-disclosure";
import { SetupApplyResult } from "@/components/custom/setup-apply-result";
import { GuidedStepTransition } from "@/components/custom/guided-step-transition";
import {
  createGuidedRepoRowId,
  guidedRowsFromConfig,
  guidedRowsToConfigRepos,
  isRepoVerifiedForUrl,
  isServiceVerifiedForValue,
  valueFingerprint,
  type GuidedRepoRow,
} from "@/lib/verification-state";
import type { GuidedLocalSetupStep } from "@/lib/guided-setup";

export type GuidedLocalStep = GuidedLocalSetupStep;

interface ConfigureWorkflowProps {
  mode?: "guided" | "advanced";
  guidedStep?: GuidedLocalStep;
  onGuidedStepChange?: (step: GuidedLocalStep) => void;
  initialEnv: {
    harnessConfigPath: string;
    githubDispatchRepository: string;
    suggestedHarnessDispatchRepo?: string;
    secretPresence: EnvironmentFormPresence;
  };
  initialConfig: LocalConfigFormInput;
  highlightStaleDispatch?: boolean;
  highlightStaleTarget?: boolean;
  onSummaryUpdated?: (summary: SetupGuiViewModel) => void;
  onUiStateChange?: (state: { localPreviewStale: boolean }) => void;
}

const SERVICE_API_MAP: Record<ServiceKey, "linear" | "cursor" | "github"> = {
  LINEAR_API_KEY: "linear",
  CURSOR_API_KEY: "cursor",
  GITHUB_TOKEN: "github",
};

const SERVICE_VALUE_KEY: Record<
  ServiceKey,
  keyof Pick<EnvironmentFormValues, "linearApiKey" | "cursorApiKey" | "githubToken">
> = {
  LINEAR_API_KEY: "linearApiKey",
  CURSOR_API_KEY: "cursorApiKey",
  GITHUB_TOKEN: "githubToken",
};

export function ConfigureWorkflow({
  mode = "advanced",
  guidedStep: guidedStepProp,
  onGuidedStepChange,
  initialEnv,
  initialConfig,
  highlightStaleDispatch = false,
  highlightStaleTarget = false,
  onSummaryUpdated,
  onUiStateChange,
}: ConfigureWorkflowProps) {
  const prefersReducedMotion = useReducedMotion();
  const guidedTopRef = useRef<HTMLDivElement | null>(null);
  const guidedRepoRowCounter = useRef(1);

  const [internalGuidedStep, setInternalGuidedStep] =
    useState<GuidedLocalStep>("connect-services");
  const guidedStep = guidedStepProp ?? internalGuidedStep;
  const [envValues, setEnvValues] = useState<EnvironmentFormValues>({
    harnessConfigPath: initialEnv.harnessConfigPath,
    githubDispatchRepository: initialEnv.githubDispatchRepository,
    linearApiKey: "",
    cursorApiKey: "",
    githubToken: "",
  });
  const [configValues, setConfigValues] =
    useState<LocalConfigFormInput>(initialConfig);
  const [guidedRepoRows, setGuidedRepoRows] = useState<GuidedRepoRow[]>(() =>
    guidedRowsFromConfig(initialConfig, guidedRepoRowCounter.current),
  );
  const [presence, setPresence] = useState<EnvironmentFormPresence>(
    initialEnv.secretPresence,
  );
  const [serviceVerification, setServiceVerification] =
    useState<ServiceVerificationMap>(INITIAL_SERVICE_VERIFICATION);
  const [verifyingServiceKey, setVerifyingServiceKey] =
    useState<ServiceKey | null>(null);
  const [repoVerification, setRepoVerification] = useState<
    Record<string, RepoVerificationUi>
  >({});
  const [verifyingRepoRowId, setVerifyingRepoRowId] = useState<string | null>(
    null,
  );
  const [showPreviewDisclosure, setShowPreviewDisclosure] = useState(false);
  const [preview, setPreview] = useState<LocalSetupPreviewResult | null>(null);
  const [previewPayload, setPreviewPayload] =
    useState<LocalSetupFormPayload | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState<"preview" | "apply" | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<SetupGuiViewModel | null>(
    null,
  );
  const [applySuccess, setApplySuccess] = useState<boolean | null>(null);

  const guidedConfigValues = useMemo<LocalConfigFormInput>(
    () => ({
      ...configValues,
      repos: guidedRowsToConfigRepos(guidedRepoRows),
    }),
    [configValues, guidedRepoRows],
  );

  const preparedConfig = useMemo(
    () =>
      mode === "guided"
        ? prepareGuidedConfigFormInput(guidedConfigValues)
        : configValues,
    [configValues, guidedConfigValues, mode],
  );

  const currentPayload = useMemo<LocalSetupFormPayload>(
    () => ({
      env: envValues,
      config: preparedConfig,
    }),
    [envValues, preparedConfig],
  );

  const previewIsCurrent =
    preview !== null &&
    previewPayload !== null &&
    JSON.stringify(previewPayload) === JSON.stringify(currentPayload);

  useEffect(() => {
    if (mode !== "guided" || guidedStepProp === undefined) {
      return;
    }
    setInternalGuidedStep(guidedStepProp);
  }, [guidedStepProp, mode]);

  useEffect(() => {
    onUiStateChange?.({
      localPreviewStale: preview !== null && !previewIsCurrent,
    });
  }, [onUiStateChange, preview, previewIsCurrent]);

  const setGuidedStep = useCallback(
    (step: GuidedLocalStep) => {
      if (onGuidedStepChange) {
        onGuidedStepChange(step);
        return;
      }
      setInternalGuidedStep(step);
    },
    [onGuidedStepChange],
  );

  const goToGuidedStep = useCallback(
    (nextStep: GuidedLocalStep) => {
      setGuidedStep(nextStep);
      requestAnimationFrame(() => {
        guidedTopRef.current?.scrollIntoView({
          block: "start",
          behavior: prefersReducedMotion ? "auto" : "smooth",
        });
      });
    },
    [prefersReducedMotion, setGuidedStep],
  );

  const serviceKeyReady = (key: ServiceKey) => {
    if (presence[key]) {
      return true;
    }
    return Boolean(envValues[SERVICE_VALUE_KEY[key]].trim());
  };

  const serviceConnectionReady = (key: ServiceKey) => {
    if (!serviceKeyReady(key)) {
      return false;
    }
    const typedValue = envValues[SERVICE_VALUE_KEY[key]].trim();
    if (typedValue) {
      return isServiceVerifiedForValue(serviceVerification[key], typedValue);
    }
    if (presence[key]) {
      return true;
    }
    return false;
  };

  const connectServicesReady =
    serviceConnectionReady("LINEAR_API_KEY") &&
    serviceConnectionReady("CURSOR_API_KEY") &&
    serviceConnectionReady("GITHUB_TOKEN");

  const guidedRepos =
    preparedConfig.repos.length > 0
      ? preparedConfig.repos
      : [{ id: "", targetRepo: "" }];

  const targetReposReady = guidedRepoRows.every((repo) =>
    GITHUB_REPO_URL_PATTERN.test(repo.targetRepo.trim()),
  );

  const allReposVerified = guidedRepoRows.every((row) =>
    isRepoVerifiedForUrl(
      repoVerification[row.rowId],
      row.targetRepo.trim(),
    ),
  );

  const resetApplyState = () => {
    setApplySuccess(null);
    setApplySummary(null);
    setError(null);
  };

  const invalidatePreview = useCallback(() => {
    resetApplyState();
    setPreview(null);
    setPreviewPayload(null);
    setPreviewError(null);
    setConfirmed(false);
  }, []);

  const markServiceUnchecked = (key: ServiceKey) => {
    setServiceVerification((current) => ({
      ...current,
      [key]: { state: "unchecked" },
    }));
  };

  const resetRepoVerificationIfUrlChanged = useCallback(
    (rows: GuidedRepoRow[]) => {
      setRepoVerification((current) => {
        const next = { ...current };
        for (const row of rows) {
          const existing = current[row.rowId];
          if (!existing) {
            continue;
          }
          const trimmedUrl = row.targetRepo.trim();
          if (
            existing.verifiedTargetRepo &&
            existing.verifiedTargetRepo !== trimmedUrl
          ) {
            next[row.rowId] = { state: "unchecked" };
          } else if (
            existing.attemptedTargetRepo &&
            existing.attemptedTargetRepo !== trimmedUrl
          ) {
            next[row.rowId] = { state: "unchecked" };
          }
        }
        return next;
      });
    },
    [],
  );

  const verifyService = useCallback(
    async (key: ServiceKey) => {
      const token = envValues[SERVICE_VALUE_KEY[key]].trim();
      const fingerprint = token ? valueFingerprint(token) : undefined;

      setVerifyingServiceKey(key);
      setServiceVerification((current) => ({
        ...current,
        [key]: { state: "checking" },
      }));

      try {
        const response = await fetch("/api/setup/verify-service", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service: SERVICE_API_MAP[key],
            ...(token ? { token } : {}),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Verification failed");
        }

        setServiceVerification((current) => ({
          ...current,
          [key]:
            data.status === "connected"
              ? {
                  state: "connected",
                  verifiedValueFingerprint: fingerprint,
                  message: data.message,
                  limitation: data.limitation,
                  label: data.label,
                }
              : {
                  state: "failed",
                  attemptedValueFingerprint: fingerprint,
                  message: data.message,
                  limitation: data.limitation,
                  label: data.label,
                },
        }));
      } catch (verifyError) {
        setServiceVerification((current) => ({
          ...current,
          [key]: {
            state: "failed",
            attemptedValueFingerprint: fingerprint,
            message:
              verifyError instanceof Error
                ? verifyError.message
                : "Verification failed",
          },
        }));
      } finally {
        setVerifyingServiceKey(null);
      }
    },
    [envValues],
  );

  const verifyRepo = useCallback(
    async (rowId: string) => {
      const repo = guidedRepoRows.find((row) => row.rowId === rowId);
      if (!repo) {
        return;
      }

      const targetRepo = repo.targetRepo.trim();

      setVerifyingRepoRowId(rowId);
      setRepoVerification((current) => ({
        ...current,
        [rowId]: { state: "checking" },
      }));

      try {
        const response = await fetch("/api/setup/verify-target-repo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetRepo,
            ...(envValues.githubToken.trim()
              ? { githubToken: envValues.githubToken }
              : {}),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Repo verification failed");
        }

        setRepoVerification((current) => ({
          ...current,
          [rowId]:
            data.status === "connected" && data.workflowInstallReady !== false
              ? {
                  state: "connected",
                  verifiedTargetRepo: targetRepo,
                  message: data.message,
                  repoSlug: data.repoSlug,
                  limitation: data.limitation,
                  workflowInstallReady: data.workflowInstallReady,
                }
              : {
                  state: "failed",
                  attemptedTargetRepo: targetRepo,
                  message: data.message,
                  repoSlug: data.repoSlug,
                  limitation: data.limitation,
                  workflowInstallReady: data.workflowInstallReady,
                },
        }));
      } catch (verifyError) {
        setRepoVerification((current) => ({
          ...current,
          [rowId]: {
            state: "failed",
            attemptedTargetRepo: targetRepo,
            message:
              verifyError instanceof Error
                ? verifyError.message
                : "Repo verification failed",
          },
        }));
      } finally {
        setVerifyingRepoRowId(null);
      }
    },
    [envValues.githubToken, guidedRepoRows],
  );

  const handleServiceBlur = useCallback(
    (key: ServiceKey) => {
      const value = envValues[SERVICE_VALUE_KEY[key]].trim();
      if (!value) {
        return;
      }
      if (isServiceVerifiedForValue(serviceVerification[key], value)) {
        return;
      }
      void verifyService(key);
    },
    [envValues, serviceVerification, verifyService],
  );

  const handleRepoBlur = useCallback(
    (rowId: string) => {
      const repo = guidedRepoRows.find((row) => row.rowId === rowId);
      if (!repo || !GITHUB_REPO_URL_PATTERN.test(repo.targetRepo.trim())) {
        return;
      }
      if (isRepoVerifiedForUrl(repoVerification[rowId], repo.targetRepo.trim())) {
        return;
      }
      void verifyRepo(rowId);
    },
    [guidedRepoRows, repoVerification, verifyRepo],
  );

  const handlePreview = useCallback(async () => {
    setLoading("preview");
    setPreviewError(null);
    setConfirmed(false);
    try {
      const response = await fetch("/api/setup/preview-local-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentPayload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Preview failed");
      }
      setPreview(data as LocalSetupPreviewResult);
      setPreviewPayload(currentPayload);
      setShowPreviewDisclosure(true);
    } catch (previewFailure) {
      setPreview(null);
      setPreviewPayload(null);
      setPreviewError(
        previewFailure instanceof Error
          ? previewFailure.message
          : "Preview failed",
      );
      setShowPreviewDisclosure(true);
    } finally {
      setLoading(null);
    }
  }, [currentPayload]);

  const handlePreviewDisclosureOpenChange = useCallback(
    (open: boolean) => {
      setShowPreviewDisclosure(open);
      if (open && !previewIsCurrent && loading !== "preview") {
        void handlePreview();
      }
    },
    [handlePreview, loading, previewIsCurrent],
  );

  const handleApply = async () => {
    if (!preview || !previewIsCurrent || !confirmed) {
      return;
    }

    setLoading("apply");
    resetApplyState();
    try {
      const response = await fetch("/api/setup/apply-local-files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...currentPayload,
          confirmed: true,
          fingerprint: preview.fingerprint,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Apply failed");
      }

      setApplySuccess(true);
      setApplySummary(data.summary as SetupGuiViewModel);
      onSummaryUpdated?.(data.summary as SetupGuiViewModel);
      setPresence({
        LINEAR_API_KEY: data.summary.envKeyPresence.LINEAR_API_KEY,
        CURSOR_API_KEY: data.summary.envKeyPresence.CURSOR_API_KEY,
        GITHUB_TOKEN: data.summary.envKeyPresence.GITHUB_TOKEN,
      });
      setEnvValues((current) => ({
        ...current,
        linearApiKey: "",
        cursorApiKey: "",
        githubToken: "",
      }));
      setPreview(null);
      setPreviewPayload(null);
      setConfirmed(false);
      setShowPreviewDisclosure(false);
    } catch (applyError) {
      setApplySuccess(false);
      setError(
        applyError instanceof Error ? applyError.message : "Apply failed",
      );
    } finally {
      setLoading(null);
    }
  };

  const handleCreateSetupFiles = async () => {
    await handleApply();
  };

  const previewDisabledReason =
    loading !== null ? "Wait for the current action to finish." : undefined;
  const confirmDisabledReason = !previewIsCurrent
    ? "Generate a preview before you can confirm this write."
    : preview?.validationError
      ? "Fix validation errors before confirming this write."
      : undefined;
  const guidedConfirmDisabledReason = preview?.validationError
    ? "Fix validation errors before confirming this write."
    : undefined;
  const applyDisabledReason =
    confirmDisabledReason ??
    (!confirmed
      ? "Confirm that you understand local setup files will be created on this machine."
      : undefined);

  const canCreateSetupFiles =
    loading === null &&
    connectServicesReady &&
    targetReposReady &&
    allReposVerified &&
    previewIsCurrent &&
    !preview?.validationError &&
    confirmed;

  if (mode === "guided") {
    const renderGuidedStep = () => {
      switch (guidedStep) {
        case "connect-services":
          return (
            <SectionCard
              title="Step 1 of 5 · Connect services"
              description="Add the API keys the harness needs on this machine."
            >
              <EnvironmentConfigForm
                values={envValues}
                presence={presence}
                variant="guided-services"
                verification={serviceVerification}
                verifyingKey={verifyingServiceKey}
                onChange={(values) => {
                  invalidatePreview();
                  setEnvValues(values);
                  if (values.linearApiKey !== envValues.linearApiKey) {
                    markServiceUnchecked("LINEAR_API_KEY");
                  }
                  if (values.cursorApiKey !== envValues.cursorApiKey) {
                    markServiceUnchecked("CURSOR_API_KEY");
                  }
                  if (values.githubToken !== envValues.githubToken) {
                    markServiceUnchecked("GITHUB_TOKEN");
                  }
                }}
                onVerifyService={verifyService}
                onServiceBlur={handleServiceBlur}
              />
              <div className={FORM.actions}>
                <Button
                  type="button"
                  onClick={() => goToGuidedStep("choose-target-repos")}
                  disabled={!connectServicesReady}
                >
                  Continue
                </Button>
              </div>
              {!connectServicesReady ? (
                <p className="text-sm text-muted-foreground">
                  Enter each key above, verify new values when possible, or use
                  keys already saved in `.env.local`.
                </p>
              ) : null}
            </SectionCard>
          );
        case "choose-target-repos":
          return (
            <SectionCard
              title="Step 2 of 5 · Choose target repo(s) and create setup files"
              description="Tell the harness which GitHub repo(s) it should work against, then create local setup files on this machine."
            >
              <TargetRepoConfigForm
                values={guidedConfigValues}
                highlightStaleTarget={highlightStaleTarget}
                variant="guided-minimal"
                suggestedHarnessDispatchRepo={
                  initialEnv.suggestedHarnessDispatchRepo
                }
                guidedRepos={guidedRepoRows}
                repoVerification={repoVerification}
                verifyingRepoRowId={verifyingRepoRowId}
                onChange={(values) => {
                  invalidatePreview();
                  setConfigValues(values);
                }}
                onGuidedReposChange={(rows) => {
                  invalidatePreview();
                  resetRepoVerificationIfUrlChanged(rows);
                  setGuidedRepoRows(rows);
                }}
                onVerifyRepo={verifyRepo}
                onRepoBlur={handleRepoBlur}
                onAddRepo={() => {
                  invalidatePreview();
                  guidedRepoRowCounter.current += 1;
                  const rowId = createGuidedRepoRowId(
                    guidedRepoRowCounter.current,
                  );
                  setGuidedRepoRows((current) => [
                    ...current,
                    { rowId, id: "", targetRepo: "" },
                  ]);
                }}
                onRemoveRepo={(rowId) => {
                  invalidatePreview();
                  setGuidedRepoRows((current) =>
                    current.filter((row) => row.rowId !== rowId),
                  );
                  setRepoVerification((current) => {
                    const next = { ...current };
                    delete next[rowId];
                    return next;
                  });
                }}
              />

              <Separator className="my-6" />

              <div className="rounded-md border border-border bg-muted/20 p-4 space-y-3">
                <p className="text-sm font-medium">Create local setup files</p>
                <p className="text-sm text-muted-foreground">
                  This is the point where the app writes local gitignored setup
                  files to this machine: `.env.local` and
                  `.harness/config.local.json`.
                </p>

                <ReviewGeneratedFilesDisclosure
                  open={showPreviewDisclosure}
                  onOpenChange={handlePreviewDisclosureOpenChange}
                  isLoading={loading === "preview"}
                  previewError={previewError ?? undefined}
                  envPreview={previewIsCurrent ? preview?.envPreview : undefined}
                  configPreview={
                    previewIsCurrent ? preview?.configPreview : undefined
                  }
                  validationError={
                    previewIsCurrent ? preview?.validationError : undefined
                  }
                  previewIsCurrent={previewIsCurrent}
                />

                <LocalWriteConfirmation
                  variant="guided"
                  plan={previewIsCurrent ? preview?.plan : undefined}
                  confirmed={confirmed}
                  disabled={
                    !previewIsCurrent || Boolean(preview?.validationError)
                  }
                  disabledReason={guidedConfirmDisabledReason}
                  onConfirmedChange={setConfirmed}
                />
              </div>

              <div className={FORM.actions}>
                <Button
                  type="button"
                  onClick={handleCreateSetupFiles}
                  disabled={!canCreateSetupFiles}
                  data-primary-preview-button="true"
                >
                  {loading === "apply"
                    ? "Creating…"
                    : "Create local setup files"}
                </Button>
              </div>
              {!targetReposReady ? (
                <p className="text-sm text-muted-foreground">
                  Enter a valid GitHub target repo URL for each repo row to
                  continue.
                </p>
              ) : !allReposVerified ? (
                <p className="text-sm text-muted-foreground">
                  Verify access for each target repo before creating setup
                  files.
                </p>
              ) : !previewIsCurrent ? (
                <p className="text-sm text-muted-foreground">
                  Open Review generated files to preview the local changes
                  before confirming.
                </p>
              ) : !confirmed ? (
                <p className="text-sm text-muted-foreground">
                  Confirm that you understand local setup files will be created
                  on this machine.
                </p>
              ) : null}
            </SectionCard>
          );
      }
    };

    return (
      <div className={SPACING.section}>
        <div ref={guidedTopRef} />
        <GuidedStepTransition stepKey={guidedStep}>
          {renderGuidedStep()}
        </GuidedStepTransition>

        {error ? (
          <SetupApplyResult success={false} message={error} />
        ) : null}
        {applySuccess !== null && !error ? (
          <SetupApplyResult
            success={applySuccess}
            message={
              applySuccess
                ? "Local setup files were written successfully."
                : "Apply failed."
            }
            summary={applySummary ?? undefined}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={SPACING.section}>
      <SectionCard
        title="Environment (.env.local)"
        description="Edit local env keys. Existing secret values are never shown."
      >
        <EnvironmentConfigForm
          values={envValues}
          presence={presence}
          highlightDispatchRepo={highlightStaleDispatch}
          variant="advanced"
          onChange={(values) => {
            invalidatePreview();
            setEnvValues(values);
          }}
        />
      </SectionCard>

      <SectionCard
        title="Target repo config"
        description="Guided fields for .harness/config.local.json."
      >
        <TargetRepoConfigForm
          values={configValues}
          highlightStaleTarget={highlightStaleTarget}
          variant="advanced"
          onChange={(values) => {
            invalidatePreview();
            setConfigValues(values);
          }}
        />
      </SectionCard>

      <SectionCard
        title="Preview local changes"
        description="Required before apply. Secret values are redacted in previews."
      >
        <LocalWritePreview
          envPreview={previewIsCurrent ? preview?.envPreview : undefined}
          configPreview={previewIsCurrent ? preview?.configPreview : undefined}
          validationError={
            previewIsCurrent ? preview?.validationError : undefined
          }
        />
        <div className={FORM.actions}>
          <Button
            type="button"
            onClick={handlePreview}
            disabled={loading !== null}
            data-primary-preview-button="true"
          >
            {loading === "preview" ? "Generating preview…" : "Preview setup files"}
          </Button>
        </div>
        {previewDisabledReason ? (
          <p className="text-sm text-muted-foreground">{previewDisabledReason}</p>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Confirm and apply"
        description="Writes only local gitignored setup files through setup core."
      >
        <LocalWriteConfirmation
          plan={previewIsCurrent ? preview?.plan : undefined}
          confirmed={confirmed}
          disabled={!previewIsCurrent || Boolean(preview?.validationError)}
          disabledReason={confirmDisabledReason}
          onConfirmedChange={setConfirmed}
        />
        <div className={FORM.actions}>
          <Button
            type="button"
            onClick={handleApply}
            disabled={
              loading !== null ||
              !previewIsCurrent ||
              !confirmed ||
              Boolean(preview?.validationError)
            }
          >
            {loading === "apply" ? "Creating…" : "Create local setup files"}
          </Button>
        </div>
        {applyDisabledReason ? (
          <p className="text-sm text-muted-foreground">{applyDisabledReason}</p>
        ) : null}
      </SectionCard>

      {error ? (
        <SetupApplyResult success={false} message={error} />
      ) : null}
      {applySuccess !== null && !error ? (
        <SetupApplyResult
          success={applySuccess}
          message={
            applySuccess
              ? "Local setup files were written successfully."
              : "Apply failed."
          }
          summary={applySummary ?? undefined}
        />
      ) : null}
    </div>
  );
}
