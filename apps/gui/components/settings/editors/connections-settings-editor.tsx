"use client";

import { useCallback, useState } from "react";
import {
  EnvironmentConfigForm,
  type EnvironmentFormPresence,
  type EnvironmentFormValues,
  type ServiceKey,
  type ServiceVerificationMap,
} from "@/components/custom/environment-config-form";
import { SettingsMutationPanel } from "@/components/settings/settings-mutation-panel";
import {
  initialSettingsMutationState,
  sanitizeSettingsErrorMessage,
  type SettingsMutationState,
} from "@/lib/settings/settings-mutation";
import {
  applyConnectServices,
  previewConnectServices,
  verifyService,
} from "@/lib/settings/settings-setup-client";
import type { ServiceConnectionSummaryMap } from "@/lib/setup-server";
import { loadDurableServiceConnectionSummaries } from "@/lib/verification-state";
import {
  isServiceFailedForValue,
  isServiceVerifiedForValue,
  serviceVerificationFromSummaries,
  valueFingerprint,
} from "@/lib/verification-state";

const SERVICE_API_MAP: Record<ServiceKey, "linear" | "cursor" | "github" | "vercel"> = {
  LINEAR_API_KEY: "linear",
  CURSOR_API_KEY: "cursor",
  GITHUB_TOKEN: "github",
  VERCEL_TOKEN: "vercel",
};

const SERVICE_VALUE_KEY: Record<
  ServiceKey,
  keyof Pick<
    EnvironmentFormValues,
    "linearApiKey" | "cursorApiKey" | "githubToken" | "vercelToken"
  >
> = {
  LINEAR_API_KEY: "linearApiKey",
  CURSOR_API_KEY: "cursorApiKey",
  GITHUB_TOKEN: "githubToken",
  VERCEL_TOKEN: "vercelToken",
};

type ConnectionsSettingsEditorProps = {
  initialPresence: EnvironmentFormPresence;
  initialServiceConnectionSummaries: ServiceConnectionSummaryMap;
  envDefaults: {
    harnessConfigPath: string;
    githubDispatchRepository: string;
  };
};

export function ConnectionsSettingsEditor({
  initialPresence,
  initialServiceConnectionSummaries,
  envDefaults,
}: ConnectionsSettingsEditorProps) {
  const [presence, setPresence] = useState(initialPresence);
  const [values, setValues] = useState<EnvironmentFormValues>({
    harnessConfigPath: envDefaults.harnessConfigPath,
    githubDispatchRepository: envDefaults.githubDispatchRepository,
    linearApiKey: "",
    cursorApiKey: "",
    githubToken: "",
    vercelToken: "",
  });
  const [verification, setVerification] = useState<ServiceVerificationMap>(() =>
    serviceVerificationFromSummaries(initialServiceConnectionSummaries),
  );
  const [verifyingKey, setVerifyingKey] = useState<ServiceKey | null>(null);
  const [mutation, setMutation] =
    useState<SettingsMutationState<{ fingerprint: string }>>(initialSettingsMutationState());
  const [confirmed, setConfirmed] = useState(false);
  const [activeKey, setActiveKey] = useState<ServiceKey | null>(null);

  const buildEnvPayload = useCallback(
    () => ({
      harnessConfigPath: values.harnessConfigPath,
      githubDispatchRepository: values.githubDispatchRepository,
      linearApiKey: values.linearApiKey,
      cursorApiKey: values.cursorApiKey,
      githubToken: values.githubToken,
      vercelToken: values.vercelToken,
    }),
    [values],
  );

  const verifyAndSave = useCallback(
    async (key: ServiceKey) => {
      const token = values[SERVICE_VALUE_KEY[key]].trim();
      if (!token) {
        return;
      }

      setActiveKey(key);
      setVerifyingKey(key);
      setMutation(initialSettingsMutationState());
      setConfirmed(false);

      try {
        const verifyResult = await verifyService({
          service: SERVICE_API_MAP[key],
          token,
        });

        if (verifyResult.status !== "connected") {
          setVerification((current) => ({
            ...current,
            [key]: {
              state: "failed",
              attemptedValueFingerprint: valueFingerprint(token),
              message: verifyResult.message,
              limitation: verifyResult.limitation,
              label: verifyResult.label,
            },
          }));
          return;
        }

        setVerification((current) => ({
          ...current,
          [key]: {
            state: "connected",
            verifiedValueFingerprint: valueFingerprint(token),
            message: verifyResult.message,
            limitation: verifyResult.limitation,
            label: verifyResult.label,
          },
        }));

        setMutation((current) => ({ ...current, phase: "previewing" }));
        const preview = await previewConnectServices(buildEnvPayload());
        if (preview.validationError) {
          throw new Error(preview.validationError);
        }

        setMutation({
          phase: "preview-ready",
          preview: { fingerprint: preview.fingerprint },
          error: null,
          successMessage: null,
        });
      } catch (error) {
        setMutation({
          phase: "error",
          preview: null,
          error: sanitizeSettingsErrorMessage(
            error instanceof Error ? error.message : "Verification failed.",
          ),
          successMessage: null,
        });
      } finally {
        setVerifyingKey(null);
      }
    },
    [buildEnvPayload, values],
  );

  const applyCredential = useCallback(async () => {
    if (!mutation.preview || !activeKey) {
      return;
    }

    setMutation((current) => ({ ...current, phase: "applying", error: null }));
    try {
      const result = await applyConnectServices({
        env: buildEnvPayload(),
        fingerprint: mutation.preview.fingerprint,
      });
      const summary = result.summary as {
        envKeyPresence: EnvironmentFormPresence;
      };
      setPresence(summary.envKeyPresence);
      setValues((current) => ({
        ...current,
        [SERVICE_VALUE_KEY[activeKey]]: "",
      }));
      setVerification(
        serviceVerificationFromSummaries(
          loadDurableServiceConnectionSummaries(summary.envKeyPresence),
        ),
      );
      setMutation({
        phase: "success",
        preview: null,
        error: null,
        successMessage: "Credential updated. Previous value was preserved on failure paths.",
      });
      setConfirmed(false);
      setActiveKey(null);
    } catch (error) {
      setMutation({
        phase: "error",
        preview: mutation.preview,
        error: sanitizeSettingsErrorMessage(
          error instanceof Error ? error.message : "Credential update failed.",
        ),
        successMessage: null,
      });
    }
  }, [activeKey, buildEnvPayload, mutation.preview]);

  return (
    <div className="space-y-6">
      <EnvironmentConfigForm
        values={values}
        presence={presence}
        variant="guided-services"
        verification={verification}
        verifyingKey={verifyingKey}
        onChange={setValues}
        onVerifyService={(key) => void verifyAndSave(key)}
        onServiceBlur={(key) => {
          const token = values[SERVICE_VALUE_KEY[key]].trim();
          if (!token) {
            setVerification((current) => ({ ...current, [key]: { state: "unchecked" } }));
            return;
          }
          if (
            isServiceVerifiedForValue(verification[key], token) ||
            isServiceFailedForValue(verification[key], token)
          ) {
            return;
          }
          setVerification((current) => ({ ...current, [key]: { state: "unchecked" } }));
        }}
      />

      {mutation.phase === "preview-ready" || mutation.phase === "applying" ? (
        <SettingsMutationPanel
          title="Save verified credential"
          phase={mutation.phase}
          error={mutation.error}
          successMessage={mutation.successMessage}
          confirmed={confirmed}
          onConfirmedChange={setConfirmed}
          onApply={() => void applyCredential()}
          applyLabel="Save credential"
          disableApply={!confirmed}
        />
      ) : null}

      {mutation.phase === "success" || mutation.phase === "error" ? (
        <SettingsMutationPanel
          phase={mutation.phase}
          error={mutation.error}
          successMessage={mutation.successMessage}
          confirmed={false}
          onConfirmedChange={() => undefined}
        />
      ) : null}
    </div>
  );
}
