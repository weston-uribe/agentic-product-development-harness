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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/custom/section-card";
import { StatusBadge } from "@/components/custom/status-badge";
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
  const [teamId, setTeamId] = useState(summary.controlPlane?.vercel?.teamId ?? "");
  const [projectId, setProjectId] = useState(
    summary.controlPlane?.vercel?.projectId ?? "",
  );
  const [harnessTeamKey, setHarnessTeamKey] = useState(
    summary.linearTeamKey ?? "",
  );
  const [githubDispatchEligible, setGithubDispatchEligible] = useState(false);
  const [githubDispatchMessage, setGithubDispatchMessage] = useState("");
  const [githubDispatchToken, setGithubDispatchToken] = useState("");
  const [showGithubDispatchOverride, setShowGithubDispatchOverride] =
    useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [preview, setPreview] = useState<VercelBridgePreview | null>(null);
  const [previewGenerated, setPreviewGenerated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [manualComplete, setManualComplete] = useState(false);
  const [loading, setLoading] = useState<"preview" | "apply" | "refresh" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<VercelBridgeApplyResult | null>(
    null,
  );
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
      if (data.harnessTeamKey) {
        setHarnessTeamKey(data.harnessTeamKey);
      }
      setGithubDispatchEligible(data.githubDispatch.eligible);
      setGithubDispatchMessage(data.githubDispatch.message);
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
          : "Failed to load Vercel bridge options",
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
    setManualCopySecret(null);
    setManualCopyAcknowledged(false);
  }, []);

  const buildPlanPayload = useCallback(
    () => ({
      teamId: teamId || undefined,
      projectId: projectId || undefined,
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
      showGithubDispatchOverride,
      summary.controlPlane?.linear?.teamId,
      teamId,
    ],
  );

  const handlePreview = useCallback(async () => {
    setLoading("preview");
    setError(null);
    setApplyResult(null);
    setConfirmed(false);
    invalidatePreview();
    try {
      const response = await fetch("/api/setup/preview-vercel-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPlanPayload()),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Preview failed");
      }
      setPreview(data as VercelBridgePreview);
      setPreviewGenerated(true);
    } catch (previewError) {
      setPreview(null);
      setPreviewGenerated(false);
      setError(
        previewError instanceof Error ? previewError.message : "Preview failed",
      );
    } finally {
      setLoading(null);
    }
  }, [buildPlanPayload, invalidatePreview]);

  const handleApply = async () => {
    if (!preview || !previewIsCurrent || !confirmed) {
      return;
    }

    setLoading("apply");
    setError(null);
    try {
      const response = await fetch("/api/setup/apply-vercel-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: buildPlanPayload(),
          confirmed: true,
          fingerprint: preview.fingerprint,
          manualComplete,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Apply failed");
      }

      const apply = data.apply as VercelBridgeApplyResult;
      setApplyResult(apply);
      setSummary(data.summary as VercelSetupSummary);
      onSummaryUpdated?.(data.summary as VercelSetupSummary);
      setVerifiedSuccess(apply.verified);
      if (apply.linearWebhookSetup.manualCopySecret) {
        setManualCopySecret(apply.linearWebhookSetup.manualCopySecret);
        setManualCopyAcknowledged(false);
      } else {
        setManualCopySecret(null);
      }
      setPreview(null);
      setPreviewGenerated(false);
      setConfirmed(false);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Apply failed");
    } finally {
      setLoading(null);
    }
  };

  const bridgeReady = summary.readiness.ready;
  const formComplete = Boolean(projectId && harnessTeamKey);

  return (
    <SectionCard
      title={`Step 3 of ${GUIDED_SETUP_STEP_COUNT} · Set up Vercel webhook bridge`}
      description="Select the harness control-plane Vercel project that hosts /api/linear-webhook, then apply bridge env vars and webhook readiness."
    >
      <div className={SPACING.stackSm}>
        {!summary.vercelTokenConfigured ? (
          <p className="text-sm text-muted-foreground">
            Add VERCEL_TOKEN in Step 1 before configuring the Vercel bridge.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Choose the Vercel project for this harness repo&apos;s webhook bridge,
              not a target application repo.
            </p>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vercel-scope">Vercel scope</Label>
                <select
                  id="vercel-scope"
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="vercel-project-id">Vercel project</Label>
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
              </div>
            </div>

            {optionsLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading Vercel scopes and projects…
              </p>
            ) : null}
            {optionsError ? (
              <p className="text-sm text-destructive">{optionsError}</p>
            ) : null}

            <div className="rounded-md border border-border bg-muted/10 p-3 text-sm space-y-2">
              <p>
                <span className="font-medium">HARNESS_TEAM_KEY:</span>{" "}
                {harnessTeamKey || "Complete Step 2 to derive the Linear team key."}
              </p>
              <p>
                <span className="font-medium">GitHub dispatch token:</span>{" "}
                {githubDispatchEligible
                  ? "Will reuse saved Step 1 GITHUB_TOKEN."
                  : githubDispatchMessage}
              </p>
              <p>
                <span className="font-medium">LINEAR_WEBHOOK_SECRET:</span>{" "}
                Will be generated during apply and never shown in preview.
              </p>
            </div>

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

            <StatusBadge
              label={bridgeReady ? "Bridge ready" : "Bridge not ready"}
              variant={bridgeReady ? "success" : "warning"}
            />

            <div className={FORM.actions}>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePreview()}
                disabled={loading !== null || !formComplete}
              >
                {loading === "preview" ? "Previewing…" : "Preview Vercel bridge"}
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
                {preview.manualSteps.length > 0 ? (
                  <ul className="list-disc pl-5 text-muted-foreground">
                    {preview.manualSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={manualComplete}
                onChange={(event) => setManualComplete(event.target.checked)}
              />
              I completed any manual webhook steps and accept bridge readiness.
            </label>

            <RemoteActionConfirmation
              scope="remote-secret-write"
              variant="guided"
              confirmed={confirmed}
              disabled={
                !previewIsCurrent ||
                Boolean(preview?.validationError) ||
                loading !== null
              }
              disabledReason={
                !previewIsCurrent
                  ? "Generate a current preview before confirming."
                  : preview?.validationError
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
                    !previewIsCurrent ||
                    !confirmed ||
                    Boolean(preview?.validationError)
                  }
                >
                  {loading === "apply" ? "Applying…" : "Apply Vercel bridge setup"}
                </Button>
              </div>
            ) : null}

            {error ? <SetupApplyResult success={false} message={error} /> : null}
            {applyResult ? (
              <SetupApplyResult
                success={applyResult.verified}
                message={`Vercel env vars written: ${applyResult.writtenEnvKeys.join(", ") || "none"}. Linear webhook setup: ${applyResult.linearWebhookSetup.mode}.`}
              />
            ) : null}

            {manualCopySecret ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm space-y-2">
                <p className="font-medium">Manual Linear webhook secret (one-time)</p>
                <p className="text-muted-foreground">
                  Copy this secret into the Linear webhook signing secret field. It
                  will not be shown again after you leave this step.
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

            {bridgeReady || verifiedSuccess ? (
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
