"use client";

import { useCallback, useEffect, useState } from "react";
import type { VercelBridgePreview } from "@harness/setup/vercel-setup-apply";
import type { VercelBridgeApplyResult } from "@harness/setup/vercel-setup-apply";
import type { VercelSetupSummary } from "@harness/setup/vercel-setup-summary";
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

interface GuidedVercelBridgeCardProps {
  readiness: FirstRunReadiness;
  initialSummary: VercelSetupSummary;
  onSummaryUpdated?: (summary: VercelSetupSummary) => void;
  onUiStateChange?: (state: { vercelPreviewStale: boolean }) => void;
  onContinue: () => void;
}

export function GuidedVercelBridgeCard({
  readiness,
  initialSummary,
  onSummaryUpdated,
  onUiStateChange,
  onContinue,
}: GuidedVercelBridgeCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [teamId, setTeamId] = useState(summary.controlPlane?.vercel?.teamId ?? "");
  const [projectId, setProjectId] = useState(
    summary.controlPlane?.vercel?.projectId ?? "",
  );
  const [linearWebhookSecret, setLinearWebhookSecret] = useState("");
  const [githubDispatchToken, setGithubDispatchToken] = useState("");
  const [harnessTeamKey, setHarnessTeamKey] = useState(
    summary.linearTeamKey ?? "",
  );
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

  const buildPlanPayload = useCallback(
    () => ({
      teamId: teamId || undefined,
      projectId: projectId || undefined,
      linearTeamId: summary.controlPlane?.linear?.teamId,
      envInput: {
        LINEAR_WEBHOOK_SECRET: linearWebhookSecret || undefined,
        GITHUB_DISPATCH_TOKEN: githubDispatchToken || undefined,
        HARNESS_TEAM_KEY: harnessTeamKey || undefined,
      },
    }),
    [
      githubDispatchToken,
      harnessTeamKey,
      linearWebhookSecret,
      projectId,
      summary.controlPlane?.linear?.teamId,
      teamId,
    ],
  );

  const handlePreview = useCallback(async () => {
    setLoading("preview");
    setError(null);
    setApplyResult(null);
    setConfirmed(false);
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
  }, [buildPlanPayload]);

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
      setApplyResult(data.apply as VercelBridgeApplyResult);
      setSummary(data.summary as VercelSetupSummary);
      onSummaryUpdated?.(data.summary as VercelSetupSummary);
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

  return (
    <SectionCard
      title={`Step 3 of ${GUIDED_SETUP_STEP_COUNT} · Set up Vercel webhook bridge`}
      description="Verify the deployed Vercel endpoint that receives Linear webhooks and dispatches GitHub Actions."
    >
      <div className={SPACING.stackSm}>
        {!summary.vercelTokenConfigured ? (
          <p className="text-sm text-muted-foreground">
            Add VERCEL_TOKEN in Step 1 before configuring the Vercel bridge.
          </p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vercel-team-id">Vercel team ID (optional)</Label>
                <Input
                  id="vercel-team-id"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vercel-project-id">Vercel project ID</Label>
                <Input
                  id="vercel-project-id"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linear-webhook-secret">LINEAR_WEBHOOK_SECRET</Label>
                <Input
                  id="linear-webhook-secret"
                  type="password"
                  value={linearWebhookSecret}
                  onChange={(event) => setLinearWebhookSecret(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="github-dispatch-token">GITHUB_DISPATCH_TOKEN</Label>
                <Input
                  id="github-dispatch-token"
                  type="password"
                  value={githubDispatchToken}
                  onChange={(event) => setGithubDispatchToken(event.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="harness-team-key">HARNESS_TEAM_KEY</Label>
                <Input
                  id="harness-team-key"
                  value={harnessTeamKey}
                  onChange={(event) => setHarnessTeamKey(event.target.value)}
                />
              </div>
            </div>

            <StatusBadge
              label={bridgeReady ? "Bridge ready" : "Bridge not ready"}
              variant={bridgeReady ? "success" : "warning"}
            />

            <div className={FORM.actions}>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handlePreview()}
                disabled={loading !== null}
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
                {loading === "apply" ? "Applying…" : "Apply Vercel bridge setup"}
              </Button>
            </div>

            {error ? <SetupApplyResult success={false} message={error} /> : null}
            {applyResult ? (
              <SetupApplyResult
                success
                message={`Vercel env vars written: ${applyResult.writtenEnvKeys.join(", ") || "none"}.`}
              />
            ) : null}

            {bridgeReady ? (
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
