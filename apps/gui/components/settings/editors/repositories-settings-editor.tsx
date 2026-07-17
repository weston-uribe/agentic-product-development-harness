"use client";

import { useCallback, useState } from "react";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import { TargetRepoConfigForm } from "@/components/custom/target-repo-config-form";
import { Button } from "@/components/ui/button";
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

type RepositoriesSettingsEditorProps = {
  initialConfigForm: LocalConfigFormInput;
  initialConfigFingerprint: string;
};

export function RepositoriesSettingsEditor({
  initialConfigForm,
  initialConfigFingerprint,
}: RepositoriesSettingsEditorProps) {
  const [configForm, setConfigForm] = useState(initialConfigForm);
  const [configFingerprint, setConfigFingerprint] = useState(initialConfigFingerprint);
  const [selectedRepoId, setSelectedRepoId] = useState(
    initialConfigForm.repos[0]?.id ?? "",
  );
  const [mutation, setMutation] =
    useState<SettingsMutationState<{ fingerprint: string; configPreview: string }>>(
      initialSettingsMutationState(),
    );
  const [confirmed, setConfirmed] = useState(false);

  const selectedIndex = configForm.repos.findIndex((repo) => repo.id === selectedRepoId);
  const selectedRepo = selectedIndex >= 0 ? configForm.repos[selectedIndex] : null;

  const updateSelectedRepo = useCallback(
    (nextRepo: LocalConfigFormInput["repos"][number]) => {
      setConfigForm((current) => ({
        ...current,
        repos: current.repos.map((repo, index) =>
          index === selectedIndex ? nextRepo : repo,
        ),
      }));
    },
    [selectedIndex],
  );

  const addRepo = useCallback(() => {
    const rowId = `repo-${Date.now()}`;
    setConfigForm((current) => ({
      ...current,
      repos: [
        ...current.repos,
        { id: rowId, targetRepo: "", baseBranch: "main", productionBranch: "main" },
      ],
    }));
    setSelectedRepoId(rowId);
  }, []);

  const detachRepo = useCallback(
    (repoId: string) => {
      if (configForm.repos.length <= 1) {
        setMutation({
          phase: "error",
          preview: null,
          error: "At least one target repository must remain configured.",
          successMessage: null,
        });
        return;
      }
      const confirmedDetach = window.confirm(
        "Detach this repository from harness config only? This does not delete the GitHub repository.",
      );
      if (!confirmedDetach) {
        return;
      }
      setConfigForm((current) => {
        const nextRepos = current.repos.filter((repo) => repo.id !== repoId);
        return { ...current, repos: nextRepos };
      });
      if (selectedRepoId === repoId) {
        setSelectedRepoId(
          configForm.repos.find((repo) => repo.id !== repoId)?.id ?? "",
        );
      }
    },
    [configForm.repos, selectedRepoId],
  );

  const runPreview = useCallback(async () => {
    setMutation((current) => ({ ...current, phase: "previewing", error: null }));
    setConfirmed(false);
    try {
      const preview = await previewSettingsConfigPatch({
        kind: "repos",
        repos: configForm.repos,
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
          error instanceof Error ? error.message : "Repository preview failed.",
        ),
        successMessage: null,
      });
    }
  }, [configForm.repos]);

  const runApply = useCallback(async () => {
    if (!mutation.preview) {
      return;
    }
    setMutation((current) => ({ ...current, phase: "applying", error: null }));
    try {
      const result = await applySettingsConfigPatch({
        patch: { kind: "repos", repos: configForm.repos },
        expectedConfigFingerprint: configFingerprint,
      });
      setConfigFingerprint(result.configFingerprint);
      setMutation({
        phase: "success",
        preview: null,
        error: null,
        successMessage: "Target repositories updated in local config only.",
      });
      setConfirmed(false);
    } catch (error) {
      setMutation({
        phase: "error",
        preview: mutation.preview,
        error: sanitizeSettingsErrorMessage(
          error instanceof Error ? error.message : "Repository apply failed.",
        ),
        successMessage: null,
      });
    }
  }, [configFingerprint, configForm.repos, mutation.preview]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {configForm.repos.map((repo) => (
          <Button
            key={repo.id}
            type="button"
            size="sm"
            variant={repo.id === selectedRepoId ? "default" : "outline"}
            onClick={() => setSelectedRepoId(repo.id)}
          >
            {repo.id || "Unnamed repo"}
          </Button>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={addRepo}>
          Add repository
        </Button>
      </div>

      {selectedRepo ? (
        <div className="space-y-4">
          <TargetRepoConfigForm
            values={{
              repos: [selectedRepo],
              linearTeamKey: configForm.linearTeamKey,
              modelId: configForm.modelId,
            }}
            variant="advanced"
            onChange={(values) => updateSelectedRepo(values.repos[0]!)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => detachRepo(selectedRepo.id)}
          >
            Detach repository
          </Button>
          <p className="text-xs text-muted-foreground">
            Detach updates local harness config only. It does not delete GitHub repositories or workflows.
          </p>
        </div>
      ) : null}

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
