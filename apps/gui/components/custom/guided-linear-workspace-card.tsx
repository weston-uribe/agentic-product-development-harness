"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LinearSetupPreview } from "@harness/setup/linear-setup-apply";
import type { LinearSetupApplyResult } from "@harness/setup/linear-setup-apply";
import type { LinearSetupSummary } from "@harness/setup/linear-setup-summary";
import { formatLinearCategoryLabel } from "@harness/setup/linear-category-labels";
import type {
  LinearProjectSummary,
  LinearTeamSummary,
} from "@harness/setup/linear-setup-client";
import type { FirstRunReadiness } from "@harness/setup/first-run-readiness";

import { FORM, SPACING } from "@/lib/constants";
import { GUIDED_SETUP_STEP_COUNT } from "@/lib/guided-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GuidedSelect } from "@/components/ui/guided-select";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/custom/section-card";
import { StatusBadge } from "@/components/custom/status-badge";
import { RemoteActionConfirmation } from "@/components/custom/remote-action-confirmation";
import { SetupApplyResult } from "@/components/custom/setup-apply-result";
import { GuidedOperationPanel, buildGuidedOperationPhases } from "@/components/custom/guided-operation-panel";
import { GuidedStepSuccessPanel } from "@/components/custom/guided-step-success-panel";

const LINEAR_OPERATION_PHASES = [
  "Validating Linear plan",
  "Creating or selecting team",
  "Creating or selecting project",
  "Configuring workflow statuses",
  "Verifying Linear workspace",
] as const;

const LINEAR_PHASE_INDEX_BY_LABEL: Map<string, number> = new Map(
  LINEAR_OPERATION_PHASES.map((label, index) => [label, index]),
);

interface GuidedLinearWorkspaceCardProps {
  readiness: FirstRunReadiness;
  initialSummary: LinearSetupSummary;
  linearApiKeyConfigured?: boolean;
  onSummaryUpdated?: (summary: LinearSetupSummary) => void;
  onUiStateChange?: (state: { linearPreviewStale: boolean }) => void;
  onContinue: () => void;
  onStepCompleted?: () => void;
}

export function GuidedLinearWorkspaceCard({
  readiness,
  initialSummary,
  linearApiKeyConfigured,
  onSummaryUpdated,
  onUiStateChange,
  onContinue,
  onStepCompleted,
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
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [preview, setPreview] = useState<LinearSetupPreview | null>(null);
  const [previewGenerated, setPreviewGenerated] = useState(false);
  const [previewDisclosed, setPreviewDisclosed] = useState(false);
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
  const [operationActiveIndex, setOperationActiveIndex] = useState(0);
  const [operationSupportingText, setOperationSupportingText] = useState<string | null>(null);
  const applyInFlightRef = useRef(false);

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
    setPreviewDisclosed(false);
    clearVerifiedSuccess();
  }, [clearVerifiedSuccess]);

  useEffect(() => {
    if (loading !== "apply") {
      return;
    }

    let cancelled = false;
    const pollProgress = async () => {
      try {
        const response = await fetch("/api/setup/linear-setup-progress");
        if (!response.ok || cancelled) {
          return;
        }
        const report = (await response.json()) as {
          uiPhaseLabel?: string | null;
          completed?: boolean;
        };
        if (!report.uiPhaseLabel) {
          return;
        }
        const index = LINEAR_PHASE_INDEX_BY_LABEL.get(report.uiPhaseLabel);
        if (index !== undefined) {
          setOperationActiveIndex(
            report.completed ? LINEAR_OPERATION_PHASES.length : index,
          );
        }
        setOperationSupportingText(report.uiPhaseLabel);
      } catch {
        // Progress polling is best-effort; apply response remains authoritative.
      }
    };

    setOperationActiveIndex(0);
    setOperationSupportingText(LINEAR_OPERATION_PHASES[0]);
    void pollProgress();
    const intervalId = window.setInterval(() => void pollProgress(), 500);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [loading]);

  const loadWorkspaceOptions = useCallback(async () => {
    if (!apiKeyConfigured) {
      return;
    }
    setOptionsLoaded(false);
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
      setOptionsLoaded(true);
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
    return projects.filter(
      (project) =>
        project.teamIds.length === 0 || project.teamIds.includes(teamId),
    );
  }, [projects, teamId]);

  const hasEligibleProjects = projectOptions.length > 0;
  const forceCreateProject = optionsLoaded && !hasEligibleProjects;

  useEffect(() => {
    if (!optionsLoaded) {
      return;
    }

    const selectedProjectStillEligible =
      projectId === "" || projectOptions.some((project) => project.id === projectId);

    if (hasEligibleProjects) {
      if (!selectedProjectStillEligible) {
        setProjectId("");
        invalidatePreview();
      }
      return;
    }

    if (projectMode !== "create") {
      setProjectMode("create");
    }
    if (projectId !== "") {
      setProjectId("");
    }
    if (projectMode !== "create" || projectId !== "") {
      invalidatePreview();
    }
  }, [
    hasEligibleProjects,
    invalidatePreview,
    optionsLoaded,
    projectId,
    projectMode,
    projectOptions,
  ]);

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
      setPreviewDisclosed(true);
    } catch (nextPreviewError) {
      setPreview(null);
      setPreviewGenerated(false);
      setPreviewDisclosed(true);
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
    if (!confirmed || loading !== null || applyInFlightRef.current) {
      return;
    }

    applyInFlightRef.current = true;
    setLoading("apply");
    setOperationActiveIndex(0);
    setOperationSupportingText(LINEAR_OPERATION_PHASES[0]);
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
      onStepCompleted?.();
      setVerifiedSuccess(true);
      setPreview(null);
      setPreviewGenerated(false);
      setPreviewDisclosed(false);
      setConfirmed(false);
      setOperationActiveIndex(LINEAR_OPERATION_PHASES.length);
      setOperationSupportingText("Linear workspace verified.");
      void loadWorkspaceOptions();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Apply failed");
    } finally {
      applyInFlightRef.current = false;
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
  const controlsLocked = loading === "apply";

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
                <GuidedSelect
                  id="linear-team-mode"
                  value={teamMode}
                  onChange={(event) => {
                    setTeamMode(event.target.value as "existing" | "create");
                    invalidatePreview();
                  }}
                  disabled={controlsLocked}
                >
                  <option value="existing">Use existing team</option>
                  <option value="create">Create new team</option>
                </GuidedSelect>
                {teamMode === "existing" ? (
                  <>
                    <GuidedSelect
                      value={teamId}
                      onChange={(event) => {
                        setTeamId(event.target.value);
                        setProjectId("");
                        invalidatePreview();
                      }}
                      disabled={controlsLocked || optionsLoading}
                    >
                      <option value="">Select a team…</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name} ({team.key})
                        </option>
                      ))}
                    </GuidedSelect>
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
                      disabled={controlsLocked}
                      onChange={(event) => {
                        setTeamName(event.target.value);
                        invalidatePreview();
                      }}
                    />
                    <Input
                      placeholder="Team key (e.g. ENG)"
                      value={teamKey}
                      disabled={controlsLocked}
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
                {!forceCreateProject ? (
                  <GuidedSelect
                    id="linear-project-mode"
                    value={projectMode}
                    onChange={(event) => {
                      setProjectMode(event.target.value as "existing" | "create");
                      invalidatePreview();
                    }}
                    disabled={controlsLocked}
                  >
                    <option value="existing">Use existing project</option>
                    <option value="create">Create new project</option>
                  </GuidedSelect>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Create a new project for this Linear team.
                  </p>
                )}
                {!forceCreateProject && projectMode === "existing" ? (
                  <>
                    <GuidedSelect
                      value={projectId}
                      onChange={(event) => {
                        setProjectId(event.target.value);
                        invalidatePreview();
                      }}
                      disabled={controlsLocked || optionsLoading}
                    >
                      <option value="">Select a project…</option>
                      {projectOptions.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </GuidedSelect>
                    {optionsLoading ? (
                      <p className="text-sm text-muted-foreground">
                        Loading Linear projects…
                      </p>
                    ) : null}
                  </>
                ) : (
                  <Input
                    placeholder="Project name"
                    value={projectName}
                    disabled={controlsLocked}
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

            {previewDisclosed && previewIsCurrent && preview ? (
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
                {preview.repairActions.length > 0 ? (
                  <div className="space-y-2">
                    <p className="font-medium">Workflow status repairs</p>
                    <ul className="space-y-2">
                      {preview.repairActions.map((repair) => (
                        <li
                          key={repair.existingStatusId}
                          className="rounded-md border border-border bg-background p-2"
                        >
                          <p className="font-medium">{repair.statusName}</p>
                          <p className="text-muted-foreground">{repair.explanation}</p>
                          <p>
                            Current category:{" "}
                            {formatLinearCategoryLabel(repair.actualCategory)} · Required:{" "}
                            {formatLinearCategoryLabel(repair.expectedCategory)}
                          </p>
                          <p>
                            Affected issues: {repair.affectedIssueCount} · Strategy:{" "}
                            {repair.repairStrategy}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
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

            {loading === "apply" ? (
              <GuidedOperationPanel
                phases={buildGuidedOperationPhases({
                  labels: [...LINEAR_OPERATION_PHASES],
                  activeIndex: operationActiveIndex,
                })}
                supportingText={operationSupportingText}
              />
            ) : null}

            {!verifiedSuccess && loading !== "apply" ? (
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
                  Apply Linear workspace setup
                </Button>
              </div>
            ) : null}

            {error ? <SetupApplyResult success={false} message={error} /> : null}
            {verifiedSuccess && applyResult ? (
              <GuidedStepSuccessPanel
                heading="Linear workspace verified"
                explanation="The selected Linear team, project, and workflow statuses are ready."
                details={[
                  `Created: ${applyResult.created.join(", ") || "none"}`,
                  `Reused: ${applyResult.skipped.join(", ") || "none"}`,
                  `Repaired: ${applyResult.repaired.join(", ") || "none"}`,
                ]}
                continueLabel="Continue to Vercel bridge"
                onContinue={onContinue}
              />
            ) : null}

            {canContinue && !verifiedSuccess ? (
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
