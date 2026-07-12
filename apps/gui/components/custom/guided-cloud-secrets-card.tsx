"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RemoteHarnessSecretApplyResult,
  RemoteHarnessSecretManualCopyValues,
  RemoteHarnessSecretPreview,
} from "@harness/setup/remote-actions";
import {
  evaluateHarnessSecretPresence,
  HARNESS_ACTIONS_SECRET_NAMES,
} from "@harness/setup/remote-actions";
import type { RemoteSetupSummary } from "@harness/setup/remote-setup-summary";
import type { FirstRunReadiness } from "@harness/setup/first-run-readiness";
import { generateGitHubSecretInstructions } from "@harness/setup/generated-instructions";

import { FORM, SPACING } from "@/lib/constants";
import { GUIDED_SETUP_STEP_COUNT } from "@/lib/guided-setup";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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

function cloudSecretsVerificationReady(summary: RemoteSetupSummary): boolean {
  const presence = evaluateHarnessSecretPresence(summary.harnessSecretStatuses);
  return (
    summary.githubTokenConfigured &&
    summary.harnessDispatchRepoResolved &&
    summary.harnessRepoAccess !== "denied" &&
    presence.allPresent
  );
}

function cloudSecretVerificationMessage(summary: RemoteSetupSummary): string {
  const presence = evaluateHarnessSecretPresence(summary.harnessSecretStatuses);
  if (presence.allPresent) {
    return "All required GitHub Actions secrets are present in the harness repo.";
  }
  const parts: string[] = [];
  if (presence.missing.length > 0) {
    parts.push(`Missing: ${presence.missing.join(", ")}`);
  }
  if (presence.unknown.length > 0) {
    parts.push(`Unknown: ${presence.unknown.join(", ")}`);
  }
  return parts.join(". ");
}

async function copyTextToClipboard(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  throw new Error("Clipboard is not available in this browser.");
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
  const [loading, setLoading] = useState<
    "preview" | "apply" | "refresh" | "manual-values" | "manual-verify" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [applyResult, setApplyResult] =
    useState<RemoteHarnessSecretApplyResult | null>(null);
  const [verifiedAutomaticSuccess, setVerifiedAutomaticSuccess] = useState(false);
  const [verifiedManualSuccess, setVerifiedManualSuccess] = useState(false);
  const [manualValuesWarningAccepted, setManualValuesWarningAccepted] =
    useState(false);
  const [manualValues, setManualValues] =
    useState<RemoteHarnessSecretManualCopyValues | null>(null);
  const [manualValuesRevealed, setManualValuesRevealed] = useState(false);
  const [manualValuesError, setManualValuesError] = useState<string | null>(null);
  const [manualVerifyMessage, setManualVerifyMessage] = useState<string | null>(
    null,
  );
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    setSummary(initialSummary);
  }, [initialSummary]);

  useEffect(() => {
    return () => {
      setManualValues(null);
      setManualValuesRevealed(false);
    };
  }, []);

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

  const manualInstructions = useMemo(
    () =>
      generateGitHubSecretInstructions({
        harnessRepo: summary.harnessDispatchRepo,
      }).steps,
    [summary.harnessDispatchRepo],
  );

  const clearManualValues = useCallback(() => {
    setManualValues(null);
    setManualValuesRevealed(false);
    setManualValuesError(null);
    setCopyFeedback(null);
  }, []);

  const refreshSummary = useCallback(async () => {
    setLoading("refresh");
    try {
      const response = await fetch("/api/setup/remote-summary");
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Remote summary refresh failed");
      }
      const nextSummary = data as RemoteSetupSummary;
      setSummary(nextSummary);
      onSummaryUpdated?.(nextSummary);
      return nextSummary;
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Remote summary refresh failed",
      );
      return null;
    } finally {
      setLoading(null);
    }
  }, [onSummaryUpdated]);

  const runPreview = useCallback(async (): Promise<RemoteHarnessSecretPreview> => {
    const response = await fetch("/api/setup/preview-harness-secrets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Preview failed");
    }
    const result = data as RemoteHarnessSecretPreview;
    setPreview(result);
    setPreviewGenerated(true);
    return result;
  }, []);

  const handlePreview = useCallback(async () => {
    setLoading("preview");
    setError(null);
    setPreviewError(null);
    setApplyResult(null);
    setVerifiedAutomaticSuccess(false);
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
  }, [runPreview]);

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
    if (!confirmed || blockedByUpstream || !summary.githubTokenConfigured) {
      return;
    }

    setLoading("apply");
    setError(null);
    setVerifiedAutomaticSuccess(false);
    try {
      const applyPreview =
        previewIsCurrent && preview ? preview : await runPreview();
      if (applyPreview.validationError) {
        throw new Error(applyPreview.validationError);
      }

      const response = await fetch("/api/setup/apply-harness-secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          fingerprint: applyPreview.fingerprint,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Apply failed");
      }

      const nextSummary = data.summary as RemoteSetupSummary;
      setApplyResult(data.apply as RemoteHarnessSecretApplyResult);
      setSummary(nextSummary);
      onSummaryUpdated?.(nextSummary);
      setPreview(null);
      setPreviewGenerated(false);
      setConfirmed(false);
      setDisclosureOpen(false);

      if (cloudSecretsVerificationReady(nextSummary)) {
        setVerifiedAutomaticSuccess(true);
      } else {
        setError(
          "Write request completed, but verification still reports missing or unknown secrets. Refresh or retry.",
        );
      }
    } catch (applyError) {
      setError(
        applyError instanceof Error ? applyError.message : "Apply failed",
      );
    } finally {
      setLoading(null);
    }
  };

  const handleGenerateManualValues = async () => {
    if (!manualValuesWarningAccepted) {
      setManualValuesError(
        "Confirm the sensitivity warning before generating manual copy values.",
      );
      return;
    }

    setLoading("manual-values");
    setManualValuesError(null);
    setCopyFeedback(null);
    try {
      const response = await fetch("/api/setup/manual-harness-secret-values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedSensitiveReveal: true }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Manual value generation failed");
      }
      setManualValues(data as RemoteHarnessSecretManualCopyValues);
      setManualValuesRevealed(false);
      if ((data as RemoteHarnessSecretManualCopyValues).missing.length > 0) {
        setManualValuesError(
          `Some values are unavailable locally: ${(data as RemoteHarnessSecretManualCopyValues).missing.join(", ")}`,
        );
      }
    } catch (generateError) {
      clearManualValues();
      setManualValuesError(
        generateError instanceof Error
          ? generateError.message
          : "Manual value generation failed",
      );
    } finally {
      setLoading(null);
    }
  };

  const handleManualVerify = async () => {
    setLoading("manual-verify");
    setManualVerifyMessage(null);
    setVerifiedManualSuccess(false);
    try {
      const nextSummary = await refreshSummary();
      if (!nextSummary) {
        return;
      }
      if (cloudSecretsVerificationReady(nextSummary)) {
        setVerifiedManualSuccess(true);
        setManualVerifyMessage(cloudSecretVerificationMessage(nextSummary));
        clearManualValues();
      } else {
        setManualVerifyMessage(cloudSecretVerificationMessage(nextSummary));
      }
    } finally {
      setLoading(null);
    }
  };

  const handleCopySecret = async (secretName: string, value?: string) => {
    if (!value) {
      setCopyFeedback(`${secretName} is not available to copy.`);
      return;
    }
    try {
      await copyTextToClipboard(value);
      setCopyFeedback(`Copied ${secretName} to clipboard.`);
    } catch (copyError) {
      setCopyFeedback(
        copyError instanceof Error
          ? copyError.message
          : `Could not copy ${secretName}.`,
      );
    }
  };

  const upstreamBlockedReason = blockedByUpstream
    ? "Fix harness repo access in local setup before cloud secrets can be configured."
    : undefined;

  const confirmDisabledReason = upstreamBlockedReason
    ? upstreamBlockedReason
    : preview?.validationError
      ? "Fix validation errors before confirming this write."
      : undefined;

  const applyDisabledReason =
    confirmDisabledReason ??
    (!confirmed
      ? "Confirm the GitHub Actions secret write before applying."
      : !summary.githubTokenConfigured
        ? "Add GITHUB_TOKEN in Step 1 before writing cloud secrets."
        : undefined);

  const verificationReady = cloudSecretsVerificationReady(summary);
  const canContinue =
    (verifiedAutomaticSuccess || verifiedManualSuccess || verificationReady) &&
    readiness.cloudSecretsBlockersCleared &&
    !readiness.cloudSecretsReviewed &&
    !loading;

  const secretApplyMessage =
    verifiedAutomaticSuccess && applyResult
      ? "Encrypted GitHub Actions secrets were created or updated successfully."
      : null;

  const manualVerifySuccessMessage =
    verifiedManualSuccess && manualVerifyMessage ? manualVerifyMessage : null;

  const githubAccessLabel =
    summary.harnessRepoAccess === "available"
      ? "connected"
      : summary.harnessRepoAccess === "denied"
        ? "access denied"
        : "pending verification";

  return (
    <SectionCard
      title={`Step 6 of ${GUIDED_SETUP_STEP_COUNT} · Connect cloud secrets`}
      description="Your local setup is ready. Choose automatic GitHub Actions secret setup or manual setup in GitHub, then verify before continuing."
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

            <div className="rounded-md border border-border bg-muted/10 p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Automatic setup</p>
                <p className="text-sm text-muted-foreground">
                  Write encrypted GitHub Actions secrets to the harness repo
                  through the GitHub API. Preview is optional; preflight runs
                  before apply when you skip preview.
                </p>
              </div>

              <ReviewCloudSecretsDisclosure
                open={disclosureOpen}
                onOpenChange={handleDisclosureOpenChange}
                isLoading={loading === "preview"}
                previewError={previewError ?? undefined}
                preview={preview ?? undefined}
                previewIsCurrent={previewIsCurrent}
              />

              <RemoteActionConfirmation
                scope="remote-secret-write"
                variant="guided"
                confirmed={confirmed}
                disabled={
                  Boolean(upstreamBlockedReason) ||
                  Boolean(preview?.validationError)
                }
                disabledReason={confirmDisabledReason}
                onConfirmedChange={setConfirmed}
              />

              <div className={FORM.actions}>
                <Button
                  type="button"
                  onClick={() => void handleApply()}
                  disabled={
                    loading !== null ||
                    !confirmed ||
                    Boolean(preview?.validationError) ||
                    Boolean(upstreamBlockedReason) ||
                    !summary.githubTokenConfigured ||
                    verifiedAutomaticSuccess
                  }
                  variant={verifiedAutomaticSuccess ? "outline" : "default"}
                >
                  {loading === "apply" ? "Writing secrets…" : applyLabel}
                </Button>
              </div>

              {applyDisabledReason && !upstreamBlockedReason ? (
                <p className="text-sm text-muted-foreground">
                  {applyDisabledReason}
                </p>
              ) : null}
            </div>

            <div className="rounded-md border border-border bg-background p-4 space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Manual setup</p>
                <p className="text-sm text-muted-foreground">
                  Create or update the required GitHub Actions secrets yourself
                  in the harness repo, then run verify-only checks here.
                </p>
              </div>

              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {manualInstructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>

              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                <p className="text-sm font-medium text-destructive">
                  Sensitive values warning
                </p>
                <p className="text-sm text-muted-foreground">
                  Manual copy values are secret. Do not paste them into logs,
                  PRs, issues, screenshots, chat, or saved notes.
                </p>
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="manual-values-warning"
                    checked={manualValuesWarningAccepted}
                    onChange={(event) =>
                      setManualValuesWarningAccepted(event.target.checked)
                    }
                  />
                  <Label
                    htmlFor="manual-values-warning"
                    className="text-sm leading-snug"
                  >
                    I understand these values are sensitive and will handle them
                    carefully.
                  </Label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleGenerateManualValues()}
                  disabled={
                    loading !== null || !manualValuesWarningAccepted
                  }
                >
                  {loading === "manual-values"
                    ? "Generating manual copy values…"
                    : "Generate manual copy values"}
                </Button>
                {manualValues ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setManualValuesRevealed((current) => !current)}
                    >
                      {manualValuesRevealed ? "Hide values" : "Show values"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearManualValues}
                    >
                      Clear values
                    </Button>
                  </>
                ) : null}
              </div>

              {manualValuesError ? (
                <p className="text-sm text-destructive">{manualValuesError}</p>
              ) : null}
              {copyFeedback ? (
                <p className="text-sm text-muted-foreground">{copyFeedback}</p>
              ) : null}

              {manualValues ? (
                <div className="space-y-3">
                  {HARNESS_ACTIONS_SECRET_NAMES.map((secretName) => {
                    const value = manualValues.values[secretName];
                    return (
                      <div
                        key={secretName}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">{secretName}</p>
                          {manualValuesRevealed && value ? (
                            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                              {value}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {value
                                ? "Value ready to copy."
                                : "Value unavailable locally."}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!value}
                          onClick={() => void handleCopySecret(secretName, value)}
                        >
                          Copy value
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <p className="text-sm text-muted-foreground">
                GitHub does not allow secret values to be read back. Verify-only
                confirms required secret names exist and the harness repo is
                reachable; it cannot prove the values match your local config or
                keys.
              </p>

              <div className={FORM.actions}>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleManualVerify()}
                  disabled={loading !== null}
                >
                  {loading === "manual-verify"
                    ? "Verifying manual setup…"
                    : "Verify manual setup"}
                </Button>
              </div>

              {manualVerifyMessage && !verifiedManualSuccess ? (
                <p className="text-sm text-muted-foreground">
                  {manualVerifyMessage}
                </p>
              ) : null}
              {manualVerifySuccessMessage ? (
                <SetupApplyResult
                  success
                  message={manualVerifySuccessMessage}
                />
              ) : null}
            </div>

            {error ? <SetupApplyResult success={false} message={error} /> : null}
            {secretApplyMessage ? (
              <SetupApplyResult success message={secretApplyMessage} />
            ) : null}

            {canContinue ? (
              <Button type="button" onClick={onContinue}>
                Continue to target workflow
              </Button>
            ) : verificationReady === false &&
              (verifiedAutomaticSuccess || verifiedManualSuccess) ? (
              <p className="text-sm text-muted-foreground">
                {cloudSecretVerificationMessage(summary)}
              </p>
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  );
}
