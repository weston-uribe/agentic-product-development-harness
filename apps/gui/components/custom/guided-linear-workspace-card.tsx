"use client";

import { useCallback, useEffect, useState } from "react";
import type { LinearSetupPreview } from "@harness/setup/linear-setup-apply";
import type { LinearSetupApplyResult } from "@harness/setup/linear-setup-apply";
import type { LinearSetupSummary } from "@harness/setup/linear-setup-summary";
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
  onSummaryUpdated?: (summary: LinearSetupSummary) => void;
  onUiStateChange?: (state: { linearPreviewStale: boolean }) => void;
  onContinue: () => void;
}

export function GuidedLinearWorkspaceCard({
  readiness,
  initialSummary,
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

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  const previewIsCurrent = preview !== null && previewGenerated;

  useEffect(() => {
    onUiStateChange?.({
      linearPreviewStale: preview !== null && !previewIsCurrent,
    });
  }, [onUiStateChange, preview, previewIsCurrent]);

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

  const handlePreview = useCallback(async () => {
    setLoading("preview");
    setError(null);
    setPreviewError(null);
    setApplyResult(null);
    setConfirmed(false);
    try {
      const response = await fetch("/api/setup/preview-linear-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPlanPayload()),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Preview failed");
      }
      setPreview(data as LinearSetupPreview);
      setPreviewGenerated(true);
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
  }, [buildPlanPayload]);

  const handleApply = async () => {
    if (!preview || !previewIsCurrent || !confirmed) {
      return;
    }

    setLoading("apply");
    setError(null);
    try {
      const response = await fetch("/api/setup/apply-linear-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: buildPlanPayload(),
          confirmed: true,
          fingerprint: preview.fingerprint,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Apply failed");
      }
      setApplyResult(data.apply as LinearSetupApplyResult);
      setSummary(data.summary as LinearSetupSummary);
      onSummaryUpdated?.(data.summary as LinearSetupSummary);
      setPreview(null);
      setPreviewGenerated(false);
      setConfirmed(false);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Apply failed");
    } finally {
      setLoading(null);
    }
  };

  const canContinue =
    readiness.steps.find((step) => step.id === "linear-workspace")?.status ===
      "complete" || summary.workspace.configured;

  return (
    <SectionCard
      title={`Step 2 of ${GUIDED_SETUP_STEP_COUNT} · Set up Linear workspace`}
      description="Choose or create the Linear team, project, and workflow statuses the harness automation expects."
    >
      <div className={SPACING.stackSm}>
        {!summary.linearApiKeyConfigured ? (
          <p className="text-sm text-muted-foreground">
            Add LINEAR_API_KEY in Step 1 before configuring the Linear workspace.
          </p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="linear-team-mode">Team</Label>
                <select
                  id="linear-team-mode"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={teamMode}
                  onChange={(event) => {
                    setTeamMode(event.target.value as "existing" | "create");
                    setPreview(null);
                    setPreviewGenerated(false);
                  }}
                >
                  <option value="existing">Use existing team</option>
                  <option value="create">Create new team</option>
                </select>
                {teamMode === "existing" ? (
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={teamId}
                    onChange={(event) => {
                      setTeamId(event.target.value);
                      setPreview(null);
                      setPreviewGenerated(false);
                    }}
                  >
                    <option value="">Select a team…</option>
                    {summary.controlPlane?.linear?.teamId ? (
                      <option value={summary.controlPlane.linear.teamId}>
                        {summary.controlPlane.linear.teamName} (
                        {summary.controlPlane.linear.teamKey})
                      </option>
                    ) : null}
                  </select>
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Team name"
                      value={teamName}
                      onChange={(event) => setTeamName(event.target.value)}
                    />
                    <Input
                      placeholder="Team key (e.g. ENG)"
                      value={teamKey}
                      onChange={(event) => setTeamKey(event.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="linear-project-mode">Project</Label>
                <select
                  id="linear-project-mode"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={projectMode}
                  onChange={(event) => {
                    setProjectMode(event.target.value as "existing" | "create");
                    setPreview(null);
                    setPreviewGenerated(false);
                  }}
                >
                  <option value="existing">Use existing project</option>
                  <option value="create">Create new project</option>
                </select>
                {projectMode === "existing" ? (
                  <Input
                    placeholder="Project ID"
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                  />
                ) : (
                  <Input
                    placeholder="Project name"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge
                label={
                  summary.workspace.configured
                    ? `Team ${summary.workspace.teamKey} configured`
                    : "Workspace not applied yet"
                }
                variant={summary.workspace.configured ? "success" : "secondary"}
              />
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
              disabled={!previewIsCurrent || Boolean(preview?.validationError)}
              disabledReason={
                !previewIsCurrent
                  ? "Generate a current preview before confirming."
                  : preview?.validationError
              }
              onConfirmedChange={setConfirmed}
            />

            <div className={FORM.actions}>
              <Button
                type="button"
                onClick={() => void handleApply()}
                disabled={
                  loading !== null ||
                  !previewIsCurrent ||
                  !confirmed ||
                  Boolean(preview?.validationError)
                }
              >
                {loading === "apply" ? "Applying…" : "Apply Linear workspace setup"}
              </Button>
            </div>

            {error ? <SetupApplyResult success={false} message={error} /> : null}
            {applyResult ? (
              <SetupApplyResult
                success
                message={`Linear workspace updated. Created: ${applyResult.created.join(", ") || "none"}.`}
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
