"use client";

import { useCallback, useState } from "react";
import type { LinearSetupSummary } from "@harness/setup/linear-setup-summary";
import type { LinearSetupPreview } from "@harness/setup/linear-setup-apply";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SettingsMutationPanel } from "@/components/settings/settings-mutation-panel";
import {
  initialSettingsMutationState,
  sanitizeSettingsErrorMessage,
  type SettingsMutationState,
} from "@/lib/settings/settings-mutation";
import {
  applyLinearSetup,
  previewLinearSetup,
} from "@/lib/settings/settings-setup-client";

type LinearSettingsEditorProps = {
  initialSummary: LinearSetupSummary;
};

const selectClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function LinearSettingsEditor({ initialSummary }: LinearSettingsEditorProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [teams, setTeams] = useState<
    Array<{ id: string; key: string; name: string }>
  >([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [teamId, setTeamId] = useState(summary.controlPlane?.linear?.teamId ?? "");
  const [projectId, setProjectId] = useState(
    summary.controlPlane?.linear?.projectId ?? "",
  );
  const [mutation, setMutation] =
    useState<SettingsMutationState<LinearSetupPreview>>(initialSettingsMutationState());
  const [confirmed, setConfirmed] = useState(false);

  const loadOptions = useCallback(async () => {
    const response = await fetch("/api/setup/linear-options");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Failed to load Linear options");
    }
    setTeams(data.teams ?? []);
    setProjects(data.projects ?? []);
  }, []);

  const buildPlan = useCallback(
    () => ({
      team: { mode: "existing" as const, teamId },
      project: { mode: "existing" as const, projectId },
    }),
    [projectId, teamId],
  );

  const runPreview = useCallback(async () => {
    setMutation((current) => ({ ...current, phase: "previewing", error: null }));
    setConfirmed(false);
    try {
      const preview = await previewLinearSetup(buildPlan());
      if (preview.validationError) {
        throw new Error(preview.validationError);
      }
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
          error instanceof Error ? error.message : "Linear preview failed.",
        ),
        successMessage: null,
      });
    }
  }, [buildPlan]);

  const runApply = useCallback(async () => {
    if (!mutation.preview) {
      return;
    }
    setMutation((current) => ({ ...current, phase: "applying", error: null }));
    try {
      const result = await applyLinearSetup({
        plan: buildPlan(),
        fingerprint: mutation.preview.fingerprint,
      });
      if (!result.apply.verified) {
        throw new Error("Linear apply finished without verification.");
      }
      setSummary(result.summary as LinearSetupSummary);
      setMutation({
        phase: "success",
        preview: null,
        error: null,
        successMessage: "Linear workspace updated.",
      });
      setConfirmed(false);
    } catch (error) {
      setMutation({
        phase: "error",
        preview: mutation.preview,
        error: sanitizeSettingsErrorMessage(
          error instanceof Error ? error.message : "Linear apply failed.",
        ),
        successMessage: null,
      });
    }
  }, [buildPlan, mutation.preview]);

  const formComplete = Boolean(teamId && projectId);

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border p-4 text-sm">
        <p>
          <span className="text-muted-foreground">Current team:</span>{" "}
          {summary.controlPlane?.linear?.teamName ?? "Not configured"}
          {summary.controlPlane?.linear?.teamKey
            ? ` (${summary.controlPlane.linear.teamKey})`
            : ""}
        </p>
        <p className="mt-2">
          <span className="text-muted-foreground">Current project:</span>{" "}
          {summary.controlPlane?.linear?.projectName ?? "Not configured"}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Replace the active Linear team and project. Status repair runs during apply.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadOptions()}>
            Load workspace options
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-linear-team">Team</Label>
            <select
              id="settings-linear-team"
              className={selectClassName}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <option value="">Select a team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} ({team.key})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-linear-project">Project</Label>
            <select
              id="settings-linear-project"
              className={selectClassName}
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <SettingsMutationPanel
        phase={mutation.phase}
        error={mutation.error}
        successMessage={mutation.successMessage}
        previewSummary={
          mutation.preview?.manualSteps?.length
            ? mutation.preview.manualSteps.join("\n")
            : mutation.preview?.repairActions?.length
              ? mutation.preview.repairActions
                  .map((action) => action.explanation)
                  .join("\n")
              : mutation.preview
                ? "Linear setup preview is ready."
                : null
        }
        confirmScope="linear-write"
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
        onPreview={() => void runPreview()}
        onApply={() => void runApply()}
        disablePreview={!formComplete}
        disableApply={!formComplete || !mutation.preview}
      />
    </div>
  );
}
