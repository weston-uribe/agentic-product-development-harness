"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RemoteHarnessSecretApplyResult,
  RemoteHarnessSecretPreview,
} from "@harness/setup/remote-actions";
import type { RemoteSetupSummary } from "@harness/setup/remote-setup-summary";
import type { FirstRunReadiness } from "@harness/setup/first-run-readiness";

import { FORM, SPACING } from "@/lib/constants";
import { GUIDED_SETUP_STEP_COUNT } from "@/lib/guided-setup";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/custom/section-card";
import { StatusBadge } from "@/components/custom/status-badge";
import { RemoteActionConfirmation } from "@/components/custom/remote-action-confirmation";
import { ReviewCloudSecretsDisclosure } from "@/components/custom/review-cloud-secrets-disclosure";
import { SetupApplyResult } from "@/components/custom/setup-apply-result";

interface GuidedCloudSecretsCardProps {
  readiness: FirstRunReadiness;
  initialSummary: RemoteSetupSummary;
  onSummaryUpdated?: (summary: RemoteSetupSummary) => void;
  onUiStateChange?: (state: { remoteSecretPreviewStale: boolean }) => void;
  onContinue: () => void;
  blockedByUpstream?: boolean;
}

function accessVariant(
  status: RemoteSetupSummary["harnessRepoAccess"],
): "success" | "warning" | "destructive" | "secondary" {
  if (status === "available") return "success";
  if (status === "denied") return "destructive";
  return "secondary";
}

function aggregateSecretsStatus(
  summary: RemoteSetupSummary,
): { label: string; variant: "success" | "warning" | "secondary" } {
  const statuses = summary.harnessSecretStatuses.map((entry) => entry.status);
  if (statuses.every((status) => status === "present")) {
    return { label: "All required secrets present", variant: "success" };
  }
  if (statuses.some((status) => status === "missing")) {
    return { label: "Ready to create or update", variant: "warning" };
  }
  return { label: "Status pending verification", variant: "secondary" };
}

export function GuidedCloudSecretsCard({
  readiness,
  initialSummary,
  onSummaryUpdated,
  onUiStateChange,
  onContinue,
  blockedByUpstream = false,
}: GuidedCloudSecretsCardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [preview, setPreview] = useState<RemoteHarnessSecretPreview | null>(null);
  const [previewGenerated, setPreviewGenerated] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState<"preview" | "apply" | "refresh" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyResult, setApplyResult] =
    useState<RemoteHarnessSecretApplyResult | null>(null);

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  const previewIsCurrent = preview !== null && previewGenerated;

  useEffect(() => {
    onUiStateChange?.({
      remoteSecretPreviewStale: preview !== null && !previewIsCurrent,
    });
  }, [onUiStateChange, preview, previewIsCurrent]);

  const secretsStatus = useMemo(
    () => aggregateSecretsStatus(summary),
    [summary],
  );

  const needsSecretWrite = summary.harnessSecretStatuses.some(
    (entry) => entry.status === "missing",
  );

  const applyLabel = needsSecretWrite
    ? "Create encrypted GitHub Actions secrets"
    : "Update encrypted GitHub Actions secrets";

  const refreshSummary = useCallback(async () => {
    setLoading("refresh");
    try {
      const response = await fetch("/api/setup/remote-summary");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Remote summary refresh failed");
      }
      setSummary(data as RemoteSetupSummary);
      onSummaryUpdated?.(data as RemoteSetupSummary);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Remote summary refresh failed",
      );
    } finally {
      setLoading(null);
    }
  }, [onSummaryUpdated]);

  const handlePreview = useCallback(async () => {
    setLoading("preview");
    setError(null);
    setPreviewError(null);
    setApplyResult(null);
    setConfirmed(false);
    try {
      const response = await fetch("/api/setup/preview-harness-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Preview failed");
      }
      setPreview(data as RemoteHarnessSecretPreview);
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
  }, []);

  const handleDisclosureOpenChange = useCallback(
    (open: boolean) => {
      setDisclosureOpen(open);
      if (open && !previewIsCurrent && loading !== "preview") {
        void handlePreview();
      }
    },
    [handlePreview, loading, previewIsCurrent],
  );

  const handleApply = async () => {
    if (!preview || !previewIsCurrent || !confirmed) {
      return;
    }

    setLoading("apply");
    setError(null);
    try {
      const response = await fetch("/api/setup/apply-harness-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          fingerprint: preview.fingerprint,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Apply failed");
      }
      setApplyResult(data.apply as RemoteHarnessSecretApplyResult);
      setSummary(data.summary as RemoteSetupSummary);
      onSummaryUpdated?.(data.summary as RemoteSetupSummary);
      setPreview(null);
      setPreviewGenerated(false);
      setConfirmed(false);
      setDisclosureOpen(false);
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : "Apply failed",
      );
    } finally {
      setLoading(null);
    }
  };

  const upstreamBlockedReason = blockedByUpstream
    ? "Fix harness repo access in local setup before cloud secrets can be configured."
    : undefined;

  const confirmDisabledReason = upstreamBlockedReason
    ? upstreamBlockedReason
    : !previewIsCurrent
      ? "Open review generated secrets to load a current preview before confirming."
      : preview?.validationError
        ? "Fix validation errors before confirming this write."
        : undefined;

  const applyDisabledReason =
    confirmDisabledReason ??
    (!confirmed
      ? "Confirm the preview before creating or updating cloud secrets."
      : undefined);

  const canContinue =
    readiness.cloudSecretsBlockersCleared &&
    !readiness.cloudSecretsReviewed &&
    !loading;

  const secretApplyMessage = applyResult
    ? "Encrypted GitHub Actions secrets were created or updated successfully."
    : null;

  const githubAccessLabel =
    summary.harnessRepoAccess === "available"
      ? "connected"
      : summary.harnessRepoAccess === "denied"
        ? "access denied"
        : "pending verification";

  return (
    <SectionCard
      title={`Step 4 of ${GUIDED_SETUP_STEP_COUNT} · Connect cloud secrets`}
      description="Your local setup is ready. Now we'll copy the required values into encrypted GitHub Actions secrets so the remote harness can run later."
    >
      <div className={SPACING.stackSm}>
        {blockedByUpstream ? (
          <>
            <p className="text-sm text-muted-foreground">
              {upstreamBlockedReason}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshSummary()}
              disabled={loading !== null}
            >
              {loading === "refresh" ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Harness repo</dt>
                <dd className="break-all font-medium">
                  {summary.harnessDispatchRepo}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">GitHub access</dt>
                <dd>
                  <StatusBadge
                    label={githubAccessLabel}
                    variant={accessVariant(summary.harnessRepoAccess)}
                  />
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-muted-foreground">Required secrets</dt>
                <dd>
                  <StatusBadge
                    label={secretsStatus.label}
                    variant={secretsStatus.variant}
                  />
                </dd>
              </div>
            </dl>

            <ReviewCloudSecretsDisclosure
              open={disclosureOpen}
              onOpenChange={handleDisclosureOpenChange}
              isLoading={loading === "preview"}
              previewError={previewError ?? undefined}
              preview={preview ?? undefined}
              previewIsCurrent={previewIsCurrent}
            />

            <details className="rounded-md border border-border bg-muted/10 p-3">
              <summary className="cursor-pointer text-sm font-medium">
                Show technical details
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                Writes encrypted GitHub Actions secrets to the harness dispatch
                repo. Config is encoded server-side from your local harness
                config. Operator keys are read from your saved local setup when
                needed.
              </p>
            </details>

            <RemoteActionConfirmation
              scope="remote-secret-write"
              variant="guided"
              confirmed={confirmed}
              disabled={!previewIsCurrent || Boolean(preview?.validationError)}
              disabledReason={confirmDisabledReason}
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
                  Boolean(preview?.validationError) ||
                  Boolean(upstreamBlockedReason) ||
                  !summary.githubTokenConfigured
                }
              >
                {loading === "apply" ? "Writing secrets…" : applyLabel}
              </Button>
            </div>

            {applyDisabledReason && !upstreamBlockedReason ? (
              <p className="text-sm text-muted-foreground">{applyDisabledReason}</p>
            ) : null}

            {error ? <SetupApplyResult success={false} message={error} /> : null}
            {secretApplyMessage ? (
              <SetupApplyResult success message={secretApplyMessage} />
            ) : null}

            {canContinue ? (
              <Button type="button" onClick={onContinue}>
                Continue to target workflow
              </Button>
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );
}
