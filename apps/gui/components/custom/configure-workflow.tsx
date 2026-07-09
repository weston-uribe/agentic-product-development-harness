"use client";

import { useEffect, useMemo, useState } from "react";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import type {
  LocalSetupFormPayload,
  LocalSetupPreviewResult,
} from "@harness/setup/local-apply-actions";
import type { SetupGuiViewModel } from "@/lib/setup-server";
import { FORM, SPACING } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/custom/section-card";
import {
  EnvironmentConfigForm,
  type EnvironmentFormValues,
  type EnvironmentFormPresence,
} from "@/components/custom/environment-config-form";
import { TargetRepoConfigForm } from "@/components/custom/target-repo-config-form";
import { LocalWritePreview } from "@/components/custom/local-write-preview";
import { LocalWriteConfirmation } from "@/components/custom/local-write-confirmation";
import { SetupApplyResult } from "@/components/custom/setup-apply-result";

interface ConfigureWorkflowProps {
  initialEnv: {
    harnessConfigPath: string;
    secretPresence: EnvironmentFormPresence;
  };
  initialConfig: LocalConfigFormInput;
  onSummaryUpdated?: (summary: SetupGuiViewModel) => void;
  onUiStateChange?: (state: { localPreviewStale: boolean }) => void;
}

export function ConfigureWorkflow({
  initialEnv,
  initialConfig,
  onSummaryUpdated,
  onUiStateChange,
}: ConfigureWorkflowProps) {
  const [envValues, setEnvValues] = useState<EnvironmentFormValues>({
    harnessConfigPath: initialEnv.harnessConfigPath,
    linearApiKey: "",
    cursorApiKey: "",
    githubToken: "",
  });
  const [configValues, setConfigValues] =
    useState<LocalConfigFormInput>(initialConfig);
  const [presence, setPresence] = useState<EnvironmentFormPresence>(
    initialEnv.secretPresence,
  );
  const [preview, setPreview] = useState<LocalSetupPreviewResult | null>(null);
  const [previewPayload, setPreviewPayload] =
    useState<LocalSetupFormPayload | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<SetupGuiViewModel | null>(
    null,
  );
  const [applySuccess, setApplySuccess] = useState<boolean | null>(null);

  const currentPayload = useMemo<LocalSetupFormPayload>(
    () => ({
      env: envValues,
      config: configValues,
    }),
    [envValues, configValues],
  );

  const previewIsCurrent =
    preview !== null &&
    previewPayload !== null &&
    JSON.stringify(previewPayload) === JSON.stringify(currentPayload);

  useEffect(() => {
    onUiStateChange?.({
      localPreviewStale: preview !== null && !previewIsCurrent,
    });
  }, [onUiStateChange, preview, previewIsCurrent]);

  const resetApplyState = () => {
    setApplySuccess(null);
    setApplySummary(null);
    setError(null);
  };

  const handlePreview = async () => {
    setLoading("preview");
    resetApplyState();
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
    } catch (previewError) {
      setPreview(null);
      setPreviewPayload(null);
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Preview failed",
      );
    } finally {
      setLoading(null);
    }
  };

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
    } catch (applyError) {
      setApplySuccess(false);
      setError(
        applyError instanceof Error ? applyError.message : "Apply failed",
      );
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={SPACING.section}>
      <SectionCard
        title="Environment (.env.local)"
        description="Edit local env keys. Existing secret values are never shown."
      >
        <EnvironmentConfigForm
          values={envValues}
          presence={presence}
          onChange={(values) => {
            resetApplyState();
            setPreview(null);
            setPreviewPayload(null);
            setConfirmed(false);
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
          onChange={(values) => {
            resetApplyState();
            setPreview(null);
            setPreviewPayload(null);
            setConfirmed(false);
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
          >
            {loading === "preview" ? "Generating preview…" : "Generate preview"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="Confirm and apply"
        description="Writes only local gitignored setup files through setup core."
      >
        <LocalWriteConfirmation
          plan={previewIsCurrent ? preview?.plan : undefined}
          confirmed={confirmed}
          disabled={!previewIsCurrent || Boolean(preview?.validationError)}
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
            {loading === "apply" ? "Applying…" : "Apply local setup files"}
          </Button>
        </div>
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
