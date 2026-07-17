"use client";

import { useCallback, useState } from "react";
import type { AutomationSettingsPatch } from "@harness/setup/settings-config-patch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsMutationPanel } from "@/components/settings/settings-mutation-panel";
import {
  initialSettingsMutationState,
  sanitizeSettingsErrorMessage,
  type SettingsMutationState,
} from "@/lib/settings/settings-mutation";
import {
  applySettingsConfigPatch,
  previewSettingsConfigPatch,
} from "@/lib/settings/settings-setup-client";

type AutomationSettingsEditorProps = {
  initialAutomation: AutomationSettingsPatch;
  initialConfigFingerprint: string;
};

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value.trim();
          onChange(next ? Number(next) : undefined);
        }}
      />
    </div>
  );
}

export function AutomationSettingsEditor({
  initialAutomation,
  initialConfigFingerprint,
}: AutomationSettingsEditorProps) {
  const [automation, setAutomation] = useState(initialAutomation);
  const [configFingerprint, setConfigFingerprint] = useState(initialConfigFingerprint);
  const [mutation, setMutation] =
    useState<SettingsMutationState<{ fingerprint: string; configPreview: string }>>(
      initialSettingsMutationState(),
    );
  const [confirmed, setConfirmed] = useState(false);

  const runPreview = useCallback(async () => {
    setMutation((current) => ({ ...current, phase: "previewing", error: null }));
    setConfirmed(false);
    try {
      const preview = await previewSettingsConfigPatch({
        kind: "automation",
        automation,
      });
      setMutation({
        phase: "preview-ready",
        preview,
        error: null,
        successMessage: null,
      });
    } catch (error) {
      setMutation({
        phase: "error",
        preview: null,
        error: sanitizeSettingsErrorMessage(
          error instanceof Error ? error.message : "Automation preview failed.",
        ),
        successMessage: null,
      });
    }
  }, [automation]);

  const runApply = useCallback(async () => {
    if (!mutation.preview) {
      return;
    }
    setMutation((current) => ({ ...current, phase: "applying", error: null }));
    try {
      const result = await applySettingsConfigPatch({
        patch: { kind: "automation", automation },
        expectedConfigFingerprint: configFingerprint,
      });
      setConfigFingerprint(result.configFingerprint);
      setMutation({
        phase: "success",
        preview: null,
        error: null,
        successMessage: "Automation settings updated in local config.",
      });
      setConfirmed(false);
    } catch (error) {
      setMutation({
        phase: "error",
        preview: mutation.preview,
        error: sanitizeSettingsErrorMessage(
          error instanceof Error ? error.message : "Automation apply failed.",
        ),
        successMessage: null,
      });
    }
  }, [automation, configFingerprint, mutation.preview]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Schema-backed automation timeouts and merge behavior. Repository-specific fields are edited under Target repositories.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <NumberField
          id="planning-timeout"
          label="Planning timeout (seconds)"
          value={automation.planningTimeoutSeconds}
          onChange={(value) =>
            setAutomation((current) => ({ ...current, planningTimeoutSeconds: value }))
          }
        />
        <NumberField
          id="implementation-timeout"
          label="Implementation timeout (seconds)"
          value={automation.implementationTimeoutSeconds}
          onChange={(value) =>
            setAutomation((current) => ({
              ...current,
              implementationTimeoutSeconds: value,
            }))
          }
        />
        <div className="space-y-2">
          <Label htmlFor="implementation-branch-prefix">Implementation branch prefix</Label>
          <Input
            id="implementation-branch-prefix"
            value={automation.implementationBranchPrefix ?? ""}
            onChange={(event) =>
              setAutomation((current) => ({
                ...current,
                implementationBranchPrefix: event.target.value || undefined,
              }))
            }
          />
        </div>
        <NumberField
          id="revision-timeout"
          label="Revision timeout (seconds)"
          value={automation.revisionTimeoutSeconds}
          onChange={(value) =>
            setAutomation((current) => ({ ...current, revisionTimeoutSeconds: value }))
          }
        />
        <div className="space-y-2">
          <Label htmlFor="merge-method">Merge method</Label>
          <select
            id="merge-method"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={automation.mergeMethod ?? "squash"}
            onChange={(event) =>
              setAutomation((current) => ({
                ...current,
                mergeMethod: event.target.value as AutomationSettingsPatch["mergeMethod"],
              }))
            }
          >
            <option value="squash">squash</option>
            <option value="merge">merge</option>
            <option value="rebase">rebase</option>
          </select>
        </div>
        <NumberField
          id="watch-poll-interval"
          label="Watch poll interval (seconds)"
          value={automation.watchPollIntervalSeconds}
          onChange={(value) =>
            setAutomation((current) => ({ ...current, watchPollIntervalSeconds: value }))
          }
        />
        <NumberField
          id="preview-poll-timeout"
          label="Preview poll timeout (seconds)"
          value={automation.previewPollTimeoutSeconds}
          onChange={(value) =>
            setAutomation((current) => ({ ...current, previewPollTimeoutSeconds: value }))
          }
        />
      </div>

      <SettingsMutationPanel
        phase={mutation.phase}
        error={mutation.error}
        successMessage={mutation.successMessage}
        previewSummary={mutation.preview?.configPreview ?? null}
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
        onPreview={() => void runPreview()}
        onApply={() => void runApply()}
        disableApply={!mutation.preview || !confirmed}
      />
    </div>
  );
}
