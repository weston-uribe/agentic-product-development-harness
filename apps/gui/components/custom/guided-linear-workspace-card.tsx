"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LinearSetupPreview } from "@harness/setup/linear-setup-apply";
import type { LinearSetupApplyResult } from "@harness/setup/linear-setup-apply";
import type { LinearSetupSummary } from "@harness/setup/linear-setup-summary";
import type {
  LinearProjectSummary,
  LinearTeamSummary,
} from "@harness/setup/linear-setup-client";
import type { FirstRunReadiness } from "@harness/setup/first-run-readiness";

import { FORM, SPACING } from "@/lib/constants";
import { GUIDED_SETUP_STEP_COUNT } from "@/lib/guided-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/custom/section-card";
import { StatusBadge } from "@/components/custom/status-badge";
import { RemoteActionConfirmation } from "@/components/custom/remote-action-confirmation";
import { SetupApplyResult } from "@/components/custom/setup-apply-result";

interface GuidedLinearWorkspaceCardProps {
  readiness: FirstRunReadiness;
  initialSummary: LinearSetupSummary;
  linearApiKeyConfigured?: boolean;
  onSummaryUpdated?: (summary: LinearSetupSummary) => void;
  onUiStateChange?: (state: { linearPreviewStale: boolean }) => void;
  onContinue: () => void;
}

const selectClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function GuidedLinearWorkspaceCard({
  readiness,
  initialSummary,
  linearApiKeyConfigured,
  onSummaryUpdated,
  onUiStateChange,
  onContinue,
}: GuidedLinearWorkspaceCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [teamMode, setTeamMode] = useState<"existing" | "create">("existing");
  const [teamId, setTeamId] = useState(summary.controlPlane?.linear?.teamId ?? "");
  const [teamKey, setTeamKey] = useState(summary.controlPlane?.linear?.teamKey ?? "");
  const [teamName, setTeamName] = useState(summary.controlPlane?.linear?.teamName ?? "");
  const [projectMode, setProjectMode] = useState<"existing" | "create">("existing");
  const [projectId, setProjectId] = useState(
    summary.controlPlane?.linear?.projectId ?? "",
  );
  const [projectName, setProjectName] = useState(
    summary.controlPlane?.linear?.projectName ?? "",
  );
  const [teams, setTeams] = useState<LinearTeamSummary[]>([]);
  const [projects, setProjects] = useState<LinearProjectSummary[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LinearSetupPreview | null>(null);
  const [previewGenerated, setPreviewGenerated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState<"preview" | "apply" | "refresh" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<LinearSetupApplyResult | null>(
    null,
  );
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  const previewIsCurrent = preview !== null && previewGenerated;

  useEffect(() => {
    onUiStateChange?.({
      linearPreviewStale: preview !== null && !previewIsCurrent,
    });
  }, [onUiStateChange, preview, previewIsCurrent]);

  const apiKeyConfigured =
    linearApiKeyConfigured ?? summary.linearApiKeyConfigured;

  const clearVerifiedSuccess = useCallback(() => {
    setVerifiedSuccess(false);
    setApplyResult(null);
  }, []);

  const invalidatePreview = useCallback(() => {
    setPreview(null);
    setPreviewGenerated(false);
    clearVerifiedSuccess();
  }, [clearVerifiedSuccess]);

  const loadWorkspaceOptions = useCallback(async () => {
    if (!apiKeyConfigured) {
      return;
    }
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const response = await fetch("/api/setup/linear-options");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load Linear teams and projects");
      }
      setTeams((data.teams ?? []) as LinearTeamSummary[]);
      setProjects((data.projects ?? []) as LinearProjectSummary[]);
    } catch (loadError) {
      setTeams([]);
      setProjects([]);
      setOptionsError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load Linear teams and projects",
      );
    } finally {
      setOptionsLoading(false);
    }
  }, [apiKeyConfigured]);

  useEffect(() => {
    void loadWorkspaceOptions();
  }, [loadWorkspaceOptions]);

  const projectOptions = useMemo(() => {
    if (!teamId) {
      return projects;
    }
    const scoped = projects.filter(
      (project) =>
        project.teamIds.length === 0 || project.teamIds.includes(teamId),
    );
    return scoped.length > 0 ? scoped : projects;
  }, [projects, teamId]);

  const refreshSummary = useCallback(async () => {
    setLoading("refresh");
    try {
      const response = await fetch("/api/setup/linear-summary");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Linear summary refresh failed");
      }
      setSummary(data as LinearSetupSummary);
      onSummaryUpdated?.(data as LinearSetupSummary);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Linear summary refresh failed",
      );
    } finally {
      setLoading(null);
    }
  }, [onSummaryUpdated]);

  const buildPlanPayload = useCallback(
    () => ({
      team: {
        mode: teamMode,
        teamId: teamMode === "existing" ? teamId : undefined,
        teamKey: teamMode === "create" ? teamKey : undefined,
        teamName: teamMode === "create" ? teamName : undefined,
      },
      project: {
        mode: projectMode,
        projectId: projectMode === "existing" ? projectId : undefined,
        projectName: projectMode === "create" ? projectName : undefined,
      },
    }),
    [projectId, projectMode, projectName, teamId, teamKey, teamMode, teamName],
  );

  const runPreview = useCallback(async () => {
    const response = await fetch("/api/setup/preview-linear-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPlanPayload()),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Preview failed");
    }
    const nextPreview = data as LinearSetupPreview;
    setPreview(nextPreview);
    setPreviewGenerated(true);
    return nextPreview;
  }, [buildPlanPayload]);

  const handlePreview = useCallback(async () => {
    setLoading("preview");
    setError(null);
    setPreviewError(null);
    clearVerifiedSuccess();
    setConfirmed(false);
    try {
      await runPreview();
    } catch (nextPreviewError) {
      setPreview(null);
      setPreviewGenerated(false);
      setPreviewError(
        nextPreviewError instanceof Error
          ? nextPreviewError.message
          : "Preview failed",
      );
    } finally {
      setLoading(null);
    }
  }, [clearVerifiedSuccess, runPreview]);

  const handleApply = async () => {
    if (!confirmed) {
      return;
    }

    setLoading("apply");
    setError(null);
    clearVerifiedSuccess();
    try {
      const currentPreview =
        previewIsCurrent && preview ? preview : await runPreview();
      if (currentPreview.validationError) {
        throw new Error(currentPreview.validationError);
      }

      const response = await fetch("/api/setup/apply-linear-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: buildPlanPayload(),
          confirmed: true,
          fingerprint: currentPreview.fingerprint,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Apply failed");
      }

      const apply = data.apply as LinearSetupApplyResult;
      if (!apply.verified) {
        throw new Error(
          "Linear workspace apply finished, but post-apply verification did not pass.",
        );
      }

      setApplyResult(apply);
      setSummary(data.summary as LinearSetupSummary);
      onSummaryUpdated?.(data.summary as LinearSetupSummary);
      setVerifiedSuccess(true);
      setPreview(null);
      setPreviewGenerated(false);
      setConfirmed(false);
      void loadWorkspaceOptions();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Apply failed");
    } finally {
      setLoading(null);
    }
  };

  const canContinue =
    verifiedSuccess ||
    readiness.steps.find((step) => step.id === "linear-workspace")?.status ===
      "complete" ||
    summary.workspace.configured;

  const formComplete =
    teamMode === "existing"
      ? Boolean(teamId) && (projectMode === "existing" ? Boolean(projectId) : Boolean(projectName))
      : Boolean(teamKey && teamName) &&
        (projectMode === "existing" ? Boolean(projectId) : Boolean(projectName));

  return (
    <SectionCard
      title={`Step 2 of ${GUIDED_SETUP_STEP_COUNT} · Set up Linear workspace`}
      description="Choose or create the Linear team and project, then ensure issue workflow statuses exist for the team."
    >
      <div className={SPACING.stackSm}>
        {!apiKeyConfigured ? (
          <p className="text-sm text-muted-foreground">
            Add your Linear API key in Step 1 before configuring the Linear workspace.
          </p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="linear-team-mode">Team</Label>
                <select
                  id="linear-team-mode"
                  className={selectClassName}
                  value={teamMode}
                  onChange={(event) => {
                    setTeamMode(event.target.value as "existing" | "create");
                    invalidatePreview();
                  }}
                >
                  <option value="existing">Use existing team</option>
                  <option value="create">Create new team</option>
                </select>
                {teamMode === "existing" ? (
                  <>
                    <select
                      className={selectClassName}
                      value={teamId}
                      onChange={(event) => {
                        setTeamId(event.target.value);
                        setProjectId("");
                        invalidatePreview();
                      }}
                      disabled={optionsLoading}
                    >
                      <option value="">Select a team…</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} ({team.key})
                        </option>
                      ))}
                    </select>
                    {optionsLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Loading Linear teams…
                      </p>
                    ) : null}
                    {!optionsLoading && teams.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No Linear teams found for this API key.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Team name"
                      value={teamName}
                      onChange={(event) => {
                        setTeamName(event.target.value);
                        invalidatePreview();
                      }}
                    />
                    <Input
                      placeholder="Team key (e.g. ENG)"
                      value={teamKey}
                      onChange={(event) => {
                        setTeamKey(event.target.value);
                        invalidatePreview();
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="linear-project-mode">Project</Label>
                <select
                  id="linear-project-mode"
                  className={selectClassName}
                  value={projectMode}
                  onChange={(event) => {
                    setProjectMode(event.target.value as "existing" | "create");
                    invalidatePreview();
                  }}
                >
                  <option value="existing">Use existing project</option>
                  <option value="create">Create new project</option>
                </select>
                {projectMode === "existing" ? (
                  <>
                    <select
                      className={selectClassName}
                      value={projectId}
                      onChange={(event) => {
                        setProjectId(event.target.value);
                        invalidatePreview();
                      }}
                      disabled={optionsLoading}
                    >
                      <option value="">Select a project…</option>
                      {projectOptions.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                    {optionsLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Loading Linear projects…
                      </p>
                    ) : null}
                    {!optionsLoading && projectOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No Linear projects found for this API key.
                      </p>
                    ) : null}
                    {!optionsLoading &&
                    projectOptions.length > 0 &&
                    teamId &&
                    projects.some((project) => project.teamIds.length > 0) &&
                    projectOptions.length === projects.length ? (
                      <p className="text-sm text-muted-foreground">
                        Showing all workspace projects because team association
                        could not be narrowed further.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <Input
                    placeholder="Project name"
                    value={projectName}
                    onChange={(event) => {
                      setProjectName(event.target.value);
                      invalidatePreview();
                    }}
                  />
                )}
              </div>
            </div>

            {optionsError ? (
              <p className="text-sm text-destructive">{optionsError}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {summary.workspace.configured ? (
                <StatusBadge
                  label={`Team ${summary.workspace.teamKey} configured`}
                  variant="success"
                />
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handlePreview()}
                disabled={loading !== null}
              >
                {loading === "preview" ? "Previewing…" : "Preview Linear setup"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void refreshSummary()}
                disabled={loading !== null}
              >
                Refresh
              </Button>
            </div>

            {previewIsCurrent && preview ? (
              <div className="rounded-md border border-border bg-muted/10 p-3 text-sm space-y-2">
                <p>
                  Missing creatable statuses:{" "}
                  {preview.missingStatuses.length > 0
                    ? preview.missingStatuses.join(", ")
                    : "none"}
                </p>
                <p>
                  Dispatch triggers: {preview.dispatchTriggerStatuses.join(", ")}
                </p>
                {preview.manualSteps.length > 0 ? (
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {preview.manualSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                ) : null}
                {previewError ? (
                  <p className="text-destructive">{previewError}</p>
                ) : null}
              </div>
            ) : null}

            <RemoteActionConfirmation
              scope="linear-write"
              variant="guided"
              confirmed={confirmed}
              disabled={loading !== null || !formComplete}
              disabledReason={
                !formComplete
                  ? "Select or enter the Linear team and project before confirming."
                  : undefined
              }
              onConfirmedChange={setConfirmed}
            />

            {!verifiedSuccess ? (
              <div className={FORM.actions}>
                <Button
                  type="button"
                  onClick={() => void handleApply()}
                  disabled={
                    loading !== null ||
                    !confirmed ||
                    !formComplete ||
                    Boolean(preview?.validationError)
                  }
                >
                  {loading === "apply" ? "Applying…" : "Apply Linear workspace setup"}
                </Button>
              </div>
            ) : null}

            {error ? <SetupApplyResult success={false} message={error} /> : null}
            {verifiedSuccess && applyResult ? (
              <SetupApplyResult
                success
                message={`Linear workspace verified. Created: ${applyResult.created.join(", ") || "none"}. Reused: ${applyResult.skipped.join(", ") || "none"}.`}
              />
            ) : null}

            {canContinue ? (
              <Button type="button" onClick={onContinue}>
                Continue to Vercel bridge
              </Button>
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );
}
