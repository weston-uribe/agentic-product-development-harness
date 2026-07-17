"use client";

import { useCallback, useState } from "react";
import type { VercelSetupSummary } from "@harness/setup/vercel-setup-summary";
import type { VercelBridgePreview } from "@harness/setup/vercel-setup-apply";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SettingsMutationPanel } from "@/components/settings/settings-mutation-panel";
import {
  initialSettingsMutationState,
  sanitizeSettingsErrorMessage,
  type SettingsMutationState,
} from "@/lib/settings/settings-mutation";
import {
  applyVercelBridge,
  previewVercelBridge,
} from "@/lib/settings/settings-setup-client";

type DeploymentsSettingsEditorProps = {
  initialSummary: VercelSetupSummary;
};

const selectClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function DeploymentsSettingsEditor({
  initialSummary,
}: DeploymentsSettingsEditorProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [teamId, setTeamId] = useState(summary.controlPlane?.vercel?.teamId ?? "");
  const [projectId, setProjectId] = useState(
    summary.controlPlane?.vercel?.projectId ?? "",
  );
  const [mutation, setMutation] =
    useState<SettingsMutationState<VercelBridgePreview>>(initialSettingsMutationState());
  const [confirmed, setConfirmed] = useState(false);

  const loadOptions = useCallback(async (scopeId?: string) => {
    const query = scopeId ? `?teamId=${encodeURIComponent(scopeId)}` : "";
    const response = await fetch(`/api/setup/vercel-bridge-options${query}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Failed to load Vercel options");
    }
    setTeams(data.teams ?? []);
    setProjects(data.projects ?? []);
  }, []);

  const buildPlanPayload = useCallback(
    () => ({
      team: { mode: "existing" as const, teamId },
      project: { mode: "existing" as const, projectId },
      teamId,
      projectId,
      linearTeamId: summary.controlPlane?.linear?.teamId,
      envInput: {
        HARNESS_TEAM_KEY: summary.controlPlane?.linear?.teamKey,
      },
    }),
    [projectId, summary.controlPlane?.linear?.teamId, summary.controlPlane?.linear?.teamKey, teamId],
  );

  const runPreview = useCallback(async () => {
    setMutation((current) => ({ ...current, phase: "previewing", error: null }));
    setConfirmed(false);
    try {
      const preview = await previewVercelBridge(buildPlanPayload());
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
          error instanceof Error ? error.message : "Vercel preview failed.",
        ),
        successMessage: null,
      });
    }
  }, [buildPlanPayload]);

  const runApply = useCallback(async () => {
    if (!mutation.preview) {
      return;
    }
    setMutation((current) => ({ ...current, phase: "applying", error: null }));
    try {
      const result = await applyVercelBridge({
        plan: buildPlanPayload(),
        fingerprint: mutation.preview.fingerprint,
      });
      setSummary(result.summary as VercelSetupSummary);
      setMutation({
        phase: "success",
        preview: null,
        error: null,
        successMessage: "Vercel bridge updated. Redeploy verification may continue in Vercel.",
      });
      setConfirmed(false);
    } catch (error) {
      setMutation({
        phase: "error",
        preview: mutation.preview,
        error: sanitizeSettingsErrorMessage(
          error instanceof Error ? error.message : "Vercel apply failed.",
        ),
        successMessage: null,
      });
    }
  }, [buildPlanPayload, mutation.preview]);

  const formComplete = Boolean(teamId && projectId);

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border p-4 text-sm">
        <p>
          <span className="text-muted-foreground">Current project:</span>{" "}
          {summary.controlPlane?.vercel?.projectName ?? "Not configured"}
        </p>
        <p className="mt-2">
          <span className="text-muted-foreground">Production URL:</span>{" "}
          {summary.controlPlane?.vercel?.productionUrl ?? "—"}
        </p>
        <p className="mt-2">
          <span className="text-muted-foreground">Linear webhook:</span>{" "}
          {summary.controlPlane?.vercel?.linearWebhookVerified ? "Verified" : "Not verified"}
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Replace the active Vercel team and project. Endpoint and webhook verification run during apply.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadOptions(teamId)}>
            Load Vercel options
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="settings-vercel-team">Team</Label>
            <select
              id="settings-vercel-team"
              className={selectClassName}
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                void loadOptions(event.target.value);
              }}
            >
              <option value="">Select a team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-vercel-project">Project</Label>
            <select
              id="settings-vercel-project"
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
            : mutation.preview
              ? "Vercel bridge preview is ready."
              : null
        }
        confirmScope="vercel-bridge-write"
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
