"use client";

import { useCallback, useEffect, useState } from "react";
import type { VercelBridgePreview } from "@harness/setup/vercel-setup-apply";
import type { VercelBridgeApplyResult } from "@harness/setup/vercel-setup-apply";
import type { VercelSetupSummary } from "@harness/setup/vercel-setup-summary";
import type { FirstRunReadiness } from "@harness/setup/first-run-readiness";
import type {
  VercelBridgeOptionsResult,
  VercelBridgeProjectOption,
  VercelBridgeScopeOption,
} from "@harness/setup/vercel-bridge-options";

import { FORM, SPACING } from "@/lib/constants";
import { GUIDED_SETUP_STEP_COUNT } from "@/lib/guided-setup";
import { readSetupJsonResponse } from "@/lib/setup-json-response";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/custom/section-card";
import { RemoteActionConfirmation } from "@/components/custom/remote-action-confirmation";
import { SetupApplyResult } from "@/components/custom/setup-apply-result";

interface GuidedVercelBridgeCardProps {
  readiness: FirstRunReadiness;
  initialSummary: VercelSetupSummary;
  onSummaryUpdated?: (summary: VercelSetupSummary) => void;
  onUiStateChange?: (state: { vercelPreviewStale: boolean }) => void;
  onContinue: () => void;
}

const selectClassName =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function buildVercelApplyResultMessage(apply: VercelBridgeApplyResult): string {
  if (apply.status === "deployment-required") {
    return `${apply.deploymentRequired?.message ?? "Deployment required."} ${apply.deploymentRequired?.nextSteps.join(" ") ?? ""}`;
  }

  const parts = [
    `Vercel team: ${apply.team?.outcome ?? "unchanged"} ${apply.team?.name ?? ""}.`,
    `Vercel project: ${apply.project?.outcome ?? "unchanged"} ${apply.project?.name ?? apply.projectName}.`,
    `Env vars written: ${apply.writtenEnvKeys.join(", ") || "none"}.`,
    `Linear webhook setup: ${apply.linearWebhookSetup.mode}.`,
    `Signed probe: ${apply.signedProbeVerified ? "passed" : "failed"}${apply.signedProbeReason ? ` (${apply.signedProbeReason})` : ""}.`,
  ];

  if (apply.productionRedeployTriggered) {
    parts.push(
      `Production redeploy: ${apply.productionRedeployStatus ?? "unknown"}.`,
    );
  }

  if (apply.setupBlocked) {
    parts.push(apply.setupBlocked.message);
    if (apply.setupBlocked.nextSteps.length > 0) {
      parts.push(apply.setupBlocked.nextSteps.join(" "));
    }
  } else if (
    apply.deploymentRedeployRequired &&
    !apply.signedProbeVerified &&
    !apply.productionRedeployTriggered
  ) {
    parts.push(
      "Redeploy production in Vercel, then use Retry verification (this will not rotate secrets or rewrite env vars).",
    );
  }

  return parts.join(" ");
}

function shouldShowRetryVerification(apply: VercelBridgeApplyResult | null): boolean {
  if (!apply) {
    return false;
  }
  if (apply.setupPending) {
    return false;
  }
  if (apply.verified && apply.signedProbeVerified) {
    return false;
  }
  return Boolean(
    apply.setupBlocked ||
      (apply.deploymentRedeployRequired && !apply.signedProbeVerified) ||
      (apply.productionRedeployTriggered &&
        apply.productionRedeployStatus === "ready" &&
        !apply.signedProbeVerified),
  );
}

function isTerminalRedeployApply(apply: VercelBridgeApplyResult): boolean {
  if (apply.verified && apply.signedProbeVerified) {
    return true;
  }
  if (apply.setupPending) {
    return false;
  }
  return Boolean(
    apply.setupBlocked ||
      apply.productionRedeployStatus === "failed" ||
      apply.productionRedeployStatus === "timeout" ||
      apply.productionRedeployStatus === "no_source_deployment",
  );
}

export function GuidedVercelBridgeCard({
  readiness,
  initialSummary,
  onSummaryUpdated,
  onUiStateChange,
  onContinue,
}: GuidedVercelBridgeCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [scopes, setScopes] = useState<VercelBridgeScopeOption[]>([]);
  const [projects, setProjects] = useState<VercelBridgeProjectOption[]>([]);
  const [capabilities, setCapabilities] = useState({
    teamCreate: true,
    projectCreate: true,
  });
  const [teamMode, setTeamMode] = useState<"existing" | "create">("existing");
  const [teamId, setTeamId] = useState(summary.controlPlane?.vercel?.teamId ?? "");
  const [teamName, setTeamName] = useState("");
  const [teamSlug, setTeamSlug] = useState("");
  const [projectMode, setProjectMode] = useState<"existing" | "create">("existing");
  const [projectId, setProjectId] = useState(
    summary.controlPlane?.vercel?.projectId ?? "",
  );
  const [projectName, setProjectName] = useState("");
  const [harnessTeamKey, setHarnessTeamKey] = useState(
    summary.linearTeamKey ?? "",
  );
  const [showGithubDispatchOverride, setShowGithubDispatchOverride] =
    useState(false);
  const [githubDispatchToken, setGithubDispatchToken] = useState("");
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [preview, setPreview] = useState<VercelBridgePreview | null>(null);
  const [previewGenerated, setPreviewGenerated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState<
    "preview" | "apply" | "poll" | "refresh" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<VercelBridgeApplyResult | null>(
    null,
  );
  const [pollActionId, setPollActionId] = useState<string | null>(null);
  const [setupPending, setSetupPending] = useState(false);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);
  const [manualCopySecret, setManualCopySecret] = useState<string | null>(null);
  const [manualCopyAcknowledged, setManualCopyAcknowledged] = useState(false);

  useEffect(() => {
    setSummary(initialSummary);
    if (initialSummary.linearTeamKey) {
      setHarnessTeamKey(initialSummary.linearTeamKey);
    }
  }, [initialSummary]);

  const previewIsCurrent = preview !== null && previewGenerated;

  useEffect(() => {
    onUiStateChange?.({
      vercelPreviewStale: preview !== null && !previewIsCurrent,
    });
  }, [onUiStateChange, preview, previewIsCurrent]);

  const loadOptions = useCallback(async (scopeId?: string) => {
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const query =
        scopeId !== undefined ? `?teamId=${encodeURIComponent(scopeId)}` : "";
      const response = await fetch(`/api/setup/vercel-bridge-options${query}`);
      const data = (await response.json()) as VercelBridgeOptionsResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? data.loadError ?? "Failed to load Vercel options");
      }
      setScopes(data.scopes ?? []);
      setProjects(data.projects ?? []);
      setCapabilities(data.capabilities ?? { teamCreate: true, projectCreate: true });
      if (data.harnessTeamKey) {
        setHarnessTeamKey(data.harnessTeamKey);
      }
      setShowGithubDispatchOverride(!data.githubDispatch.eligible);
      if (scopeId === undefined && data.selectedScopeId !== undefined) {
        setTeamId(data.selectedScopeId);
      }
      setProjectId((current) =>
        data.projects.some((project) => project.id === current)
          ? current
          : (data.selectedProjectId ?? ""),
      );
      if (data.loadError) {
        setOptionsError(data.loadError);
      }
    } catch (loadError) {
      setOptionsError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load Vercel settings options",
      );
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (summary.vercelTokenConfigured) {
      void loadOptions();
    }
  }, [loadOptions, summary.vercelTokenConfigured]);

  const refreshSummary = useCallback(async () => {
    setLoading("refresh");
    try {
      const response = await fetch("/api/setup/vercel-summary");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Vercel summary refresh failed");
      }
      setSummary(data as VercelSetupSummary);
      onSummaryUpdated?.(data as VercelSetupSummary);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Vercel summary refresh failed",
      );
    } finally {
      setLoading(null);
    }
  }, [onSummaryUpdated]);

  const invalidatePreview = useCallback(() => {
    setPreview(null);
    setPreviewGenerated(false);
    setVerifiedSuccess(false);
    setApplyResult(null);
    setPollActionId(null);
    setSetupPending(false);
    setManualCopySecret(null);
    setManualCopyAcknowledged(false);
  }, []);

  const buildPlanPayload = useCallback(
    () => ({
      team: {
        mode: teamMode,
        teamId: teamMode === "existing" ? teamId : undefined,
        teamName: teamMode === "create" ? teamName || undefined : undefined,
        teamSlug: teamMode === "create" ? teamSlug || undefined : undefined,
      },
      project: {
        mode: projectMode,
        projectId: projectMode === "existing" ? projectId || undefined : undefined,
        projectName: projectMode === "create" ? projectName || undefined : undefined,
      },
      teamId: teamMode === "existing" ? teamId || undefined : undefined,
      projectId: projectMode === "existing" ? projectId || undefined : undefined,
      projectName: projectMode === "create" ? projectName || undefined : undefined,
      linearTeamId: summary.controlPlane?.linear?.teamId,
      envInput: {
        GITHUB_DISPATCH_TOKEN: showGithubDispatchOverride
          ? githubDispatchToken || undefined
          : undefined,
        HARNESS_TEAM_KEY: harnessTeamKey || undefined,
      },
    }),
    [
      githubDispatchToken,
      harnessTeamKey,
      projectId,
      projectMode,
      projectName,
      showGithubDispatchOverride,
      summary.controlPlane?.linear?.teamId,
      teamId,
      teamMode,
      teamName,
      teamSlug,
    ],
  );

  const applyVercelBridgeResponse = useCallback(
    async (apply: VercelBridgeApplyResult, summary: VercelSetupSummary) => {
      setApplyResult(apply);
      if (apply.status === "deployment-required") {
        setError(
          apply.deploymentRequired?.message ??
            "Deployment required before applying settings.",
        );
        setVerifiedSuccess(false);
        setSetupPending(false);
        setPollActionId(null);
        void loadOptions(teamMode === "existing" ? teamId : undefined);
        setPreview(null);
        setPreviewGenerated(false);
        setConfirmed(false);
        return;
      }

      setSummary(summary);
      onSummaryUpdated?.(summary);
      setVerifiedSuccess(apply.verified);
      setSetupPending(Boolean(apply.setupPending));
      setPollActionId(apply.pollActionId ?? null);

      if (apply.linearWebhookSetup.manualCopySecret) {
        setManualCopySecret(apply.linearWebhookSetup.manualCopySecret);
        setManualCopyAcknowledged(false);
      } else {
        setManualCopySecret(null);
      }
      setPreview(null);
      setPreviewGenerated(false);
      setConfirmed(false);
      void loadOptions(teamMode === "existing" ? teamId : undefined);
    },
    [loadOptions, onSummaryUpdated, teamId, teamMode],
  );

  const pollRedeployStatus = useCallback(async () => {
    if (!pollActionId) {
      return;
    }

    setLoading("poll");
    setError(null);
    try {
      const response = await fetch("/api/setup/vercel-bridge-redeploy-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId: pollActionId,
          plan: buildPlanPayload(),
        }),
      });
      const data = await readSetupJsonResponse<{
        apply: VercelBridgeApplyResult;
        summary: VercelSetupSummary;
        error?: string;
      }>(response, "POST /api/setup/vercel-bridge-redeploy-status");

      if (!response.ok) {
        throw new Error(data.error ?? "Redeploy status check failed");
      }

      const apply = data.apply;
      await applyVercelBridgeResponse(apply, data.summary);
      if (isTerminalRedeployApply(apply)) {
        setSetupPending(false);
        setPollActionId(null);
      }
    } catch (pollError) {
      setError(
        pollError instanceof Error
          ? pollError.message
          : "Redeploy status check failed",
      );
      setSetupPending(false);
    } finally {
      setLoading(null);
    }
  }, [applyVercelBridgeResponse, buildPlanPayload, pollActionId]);

  useEffect(() => {
    if (!setupPending || !pollActionId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void pollRedeployStatus();
    }, 5000);

    void pollRedeployStatus();

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollActionId, pollRedeployStatus, setupPending]);

  const runPreview = useCallback(async () => {
    const response = await fetch("/api/setup/preview-vercel-bridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPlanPayload()),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Preview failed");
    }
    const nextPreview = data as VercelBridgePreview;
    setPreview(nextPreview);
    setPreviewGenerated(true);
    return nextPreview;
  }, [buildPlanPayload]);

  const handlePreview = useCallback(async () => {
    setLoading("preview");
    setError(null);
    setPreviewError(null);
    invalidatePreview();
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
  }, [invalidatePreview, runPreview]);

  const handleApply = async (options?: { verifyOnly?: boolean }) => {
    if (!confirmed && !options?.verifyOnly) {
      return;
    }

    setLoading("apply");
    setError(null);
    if (!options?.verifyOnly) {
      invalidatePreview();
    }
    try {
      const currentPreview =
        previewIsCurrent && preview ? preview : await runPreview();
      if (currentPreview.validationError) {
        throw new Error(currentPreview.validationError);
      }

      const response = await fetch("/api/setup/apply-vercel-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: buildPlanPayload(),
          confirmed: true,
          fingerprint: currentPreview.fingerprint,
          verifyOnly: options?.verifyOnly === true,
        }),
      });
      const data = await readSetupJsonResponse<{
        apply: VercelBridgeApplyResult;
        summary: VercelSetupSummary;
        error?: string;
      }>(response, "POST /api/setup/apply-vercel-bridge");
      if (!response.ok) {
        throw new Error(data.error ?? "Apply failed");
      }

      await applyVercelBridgeResponse(data.apply, data.summary);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Apply failed");
    } finally {
      setLoading(null);
    }
  };

  const formComplete =
    teamMode === "existing"
      ? Boolean(harnessTeamKey) &&
        (projectMode === "existing" ? Boolean(projectId) : Boolean(projectName))
      : Boolean(teamSlug && harnessTeamKey) &&
        (projectMode === "existing" ? Boolean(projectId) : Boolean(projectName));

  const canContinue =
    (verifiedSuccess && applyResult?.signedProbeVerified === true) ||
    summary.readiness.ready;

  return (
    <SectionCard
      title={`Step 3 of ${GUIDED_SETUP_STEP_COUNT} · Configure Vercel settings`}
      description="Choose the Vercel team and project this setup should use for automation and preview checks. Env var presence alone is not enough; the bridge must pass signed delivery verification against production."
    >
      <div className={SPACING.stackSm}>
        {!summary.vercelTokenConfigured ? (
          <p className="text-sm text-muted-foreground">
            Add VERCEL_TOKEN in Step 1 before configuring Vercel settings.
          </p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vercel-team-mode">Vercel team name</Label>
                {capabilities.teamCreate ? (
                  <select
                    id="vercel-team-mode"
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
                ) : null}
                {teamMode === "existing" ? (
                  <select
                    id="vercel-team-name"
                    className={selectClassName}
                    value={teamId}
                    onChange={(event) => {
                      setTeamId(event.target.value);
                      setProjectId("");
                      invalidatePreview();
                      void loadOptions(event.target.value);
                    }}
                    disabled={optionsLoading}
                  >
                    {scopes.map((scope) => (
                      <option key={scope.id || "personal"} value={scope.id}>
                        {scope.label}
                      </option>
                    ))}
                  </select>
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
                      placeholder="Team slug"
                      value={teamSlug}
                      onChange={(event) => {
                        setTeamSlug(event.target.value);
                        invalidatePreview();
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="vercel-project-mode">Vercel project</Label>
                {capabilities.projectCreate ? (
                  <select
                    id="vercel-project-mode"
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
                ) : null}
                {projectMode === "existing" ? (
                  <select
                    id="vercel-project-id"
                    className={selectClassName}
                    value={projectId}
                    onChange={(event) => {
                      setProjectId(event.target.value);
                      invalidatePreview();
                    }}
                    disabled={optionsLoading || projects.length === 0}
                  >
                    <option value="">Select a project…</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
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

            {optionsLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading Vercel teams and projects…
              </p>
            ) : null}
            {optionsError ? (
              <p className="text-sm text-destructive">{optionsError}</p>
            ) : null}

            {showGithubDispatchOverride ? (
              <div className="space-y-2">
                <Label htmlFor="github-dispatch-token">
                  GITHUB_DISPATCH_TOKEN override
                </Label>
                <Input
                  id="github-dispatch-token"
                  type="password"
                  value={githubDispatchToken}
                  onChange={(event) => {
                    setGithubDispatchToken(event.target.value);
                    invalidatePreview();
                  }}
                />
              </div>
            ) : null}

            <div className={FORM.actions}>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePreview()}
                disabled={loading !== null || !formComplete}
              >
                {loading === "preview" ? "Previewing…" : "Preview Vercel settings"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void refreshSummary()}
                disabled={loading !== null}
              >
                Refresh
              </Button>
            </div>

            {previewIsCurrent && preview ? (
              <div className="rounded-md border border-border bg-muted/10 p-3 text-sm space-y-2">
                <p>Webhook URL: {preview.webhookUrl ?? "unknown"}</p>
                <p>
                  Endpoint reachable:{" "}
                  {preview.endpointReachable ? "yes" : "no"}
                </p>
                <p>
                  GitHub dispatch source: {preview.githubDispatchSource ?? "unknown"}
                </p>
                <p>
                  Linear webhook secret mode:{" "}
                  {preview.linearWebhookSecretMode ?? "unknown"}
                </p>
                <p className="text-muted-foreground">
                  Preview does not run signed verification. Apply writes the
                  webhook secret and runs a signed production probe after env
                  setup.
                </p>
                <p>
                  Signed probe verified:{" "}
                  {preview.signedProbeVerified ? "yes" : "no (runs on apply)"}
                </p>
                {preview.deploymentStatus !== "ready" ? (
                  <p className="text-amber-700 dark:text-amber-400">
                    Deployment status: {preview.deploymentStatus}
                  </p>
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
              scope="vercel-bridge-write"
              variant="guided"
              confirmed={confirmed}
              disabled={loading !== null || !formComplete}
              disabledReason={
                !formComplete
                  ? "Select or enter the Vercel team and project before confirming."
                  : teamMode === "create"
                    ? "This will create provider resources in Vercel when you apply."
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
                  {loading === "apply"
                    ? "Applying Vercel settings…"
                    : loading === "poll"
                      ? "Waiting for production redeploy…"
                      : "Apply Vercel Settings"}
                </Button>
                {shouldShowRetryVerification(applyResult) ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleApply({ verifyOnly: true })}
                    disabled={loading !== null || !formComplete}
                  >
                    {loading === "apply" ? "Verifying…" : "Retry verification"}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {applyResult?.orchestrationSteps?.length || setupPending ? (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {applyResult?.orchestrationSteps?.map((step) => (
                  <li key={`${step.phase}-${step.status}`}>
                    {step.message}
                    {step.status === "failed" ? " (failed)" : ""}
                  </li>
                ))}
                {setupPending ? (
                  <li>
                    {loading === "poll"
                      ? "Checking Vercel deployment status…"
                      : "Waiting for Vercel deployment READY…"}
                  </li>
                ) : null}
              </ul>
            ) : null}
            {error ? <SetupApplyResult success={false} message={error} /> : null}
            {applyResult ? (
              <SetupApplyResult
                success={applyResult.verified}
                message={buildVercelApplyResultMessage(applyResult)}
              />
            ) : null}

            {manualCopySecret ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-2">
                <p className="font-medium">Manual Linear webhook secret (one-time)</p>
                <p className="text-muted-foreground">
                  Copy this secret into the Linear webhook signing secret field.
                  Manual acknowledgement does not verify the bridge; signed
                  delivery verification must pass after you apply again.
                </p>
                <Input readOnly value={manualCopySecret} />
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={manualCopyAcknowledged}
                    onChange={(event) =>
                      setManualCopyAcknowledged(event.target.checked)
                    }
                  />
                  I copied the webhook secret into Linear.
                </label>
                {applyResult?.linearWebhookSetup.manualSteps.length ? (
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {applyResult.linearWebhookSetup.manualSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {canContinue ? (
              <Button type="button" onClick={onContinue}>
                Continue to target repo setup
              </Button>
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );
}
