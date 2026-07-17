"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RunnerUpgradeProgressState } from "@harness/setup/runner-upgrade-progress";
import type {
  RunnerUpgradePreviewResult,
  RunnerUpgradeStatusResult,
} from "@harness/setup/runner-upgrade-types";
import { runnerUpgradePhaseLabel } from "@harness/setup/runner-upgrade-types";
import { Button } from "@/components/ui/button";
import {
  GuidedOperationPanel,
  buildGuidedOperationPhases,
} from "@/components/custom/guided-operation-panel";
import { SettingsMutationPanel } from "@/components/settings/settings-mutation-panel";
import {
  initialSettingsMutationState,
  sanitizeSettingsErrorMessage,
  type SettingsMutationState,
} from "@/lib/settings/settings-mutation";
import {
  applyRunnerUpgrade,
  fetchRunnerUpgradeProgress,
  fetchRunnerUpgradeStatus,
  previewRunnerUpgrade,
} from "@/lib/settings/settings-setup-client";

const RUNNER_UPGRADE_PHASE_LABELS = [
  "verifying-managed-repository",
  "comparing-runner-snapshots",
  "preparing-upgrade-commit",
  "updating-managed-runner",
  "verifying-runner-on-production-branch",
  "synchronizing-cloud-configuration",
  "running-configuration-canary",
].map((phase) => runnerUpgradePhaseLabel(phase as never));

type RunnerUpgradeSettingsCardProps = {
  initialStatus: RunnerUpgradeStatusResult;
};

function formatSnapshotLine(
  label: string,
  snapshot?: RunnerUpgradeStatusResult["currentSnapshot"],
): string {
  if (!snapshot) {
    return `${label}: —`;
  }
  return `${label}: ${snapshot.packageVersion} (${snapshot.snapshotContentId.slice(0, 12)}…)`;
}

export function RunnerUpgradeSettingsCard({
  initialStatus,
}: RunnerUpgradeSettingsCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [progress, setProgress] = useState<RunnerUpgradeProgressState | null>(
    null,
  );
  const [mutation, setMutation] =
    useState<SettingsMutationState<RunnerUpgradePreviewResult>>(
      initialSettingsMutationState(),
    );
  const [confirmed, setConfirmed] = useState(false);
  const [applying, setApplying] = useState(false);

  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const nextStatus = await fetchRunnerUpgradeStatus();
    if (mountedRef.current) {
      setStatus(nextStatus);
    }
    return nextStatus;
  }, []);

  const startProgressPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const nextProgress = await fetchRunnerUpgradeProgress();
          if (!mountedRef.current) {
            return;
          }
          setProgress(nextProgress);
        } catch {
          // Progress polling is best-effort during apply.
        }
      })();
    }, 2_000);
  }, [stopPolling]);

  const runPreview = useCallback(async () => {
    setMutation((current) => ({ ...current, phase: "previewing", error: null }));
    setConfirmed(false);
    try {
      const preview = await previewRunnerUpgrade();
      if (preview.blocked) {
        throw new Error(preview.message ?? "Runner upgrade preview is blocked.");
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
          error instanceof Error ? error.message : "Runner upgrade preview failed.",
        ),
        successMessage: null,
      });
    }
  }, []);

  const runApply = useCallback(async () => {
    if (!confirmed) {
      return;
    }
    setApplying(true);
    setMutation((current) => ({ ...current, phase: "applying", error: null }));
    startProgressPolling();
    try {
      let previewFingerprint = mutation.preview?.previewFingerprint;
      if (!previewFingerprint) {
        const freshPreview = await previewRunnerUpgrade();
        if (freshPreview.blocked) {
          throw new Error(
            freshPreview.message ?? "Runner upgrade preview is blocked.",
          );
        }
        previewFingerprint = freshPreview.previewFingerprint;
      }
      const resume =
        status.status === "partially_updated" ||
        status.status === "updating" ||
        status.status === "failed";
      const result = await applyRunnerUpgrade({
        previewFingerprint,
        resume,
      });
      stopPolling();
      const nextProgress = await fetchRunnerUpgradeProgress();
      if (mountedRef.current) {
        setProgress(nextProgress);
        setStatus(result.status);
      }
      if (result.apply.status === "up_to_date" && result.status.status === "up_to_date") {
        setMutation({
          phase: "success",
          preview: null,
          error: null,
          successMessage: "PDev runner updated and configuration canary passed.",
        });
        setConfirmed(false);
      } else {
        setMutation({
          phase: "error",
          preview: mutation.preview,
          error: sanitizeSettingsErrorMessage(
            result.apply.message ?? "Runner upgrade did not complete successfully.",
          ),
          successMessage: null,
        });
      }
    } catch (error) {
      stopPolling();
      setMutation({
        phase: "error",
        preview: mutation.preview,
        error: sanitizeSettingsErrorMessage(
          error instanceof Error ? error.message : "Runner upgrade apply failed.",
        ),
        successMessage: null,
      });
    } finally {
      if (mountedRef.current) {
        setApplying(false);
      }
    }
  }, [
    confirmed,
    mutation.preview,
    startProgressPolling,
    status.status,
    stopPolling,
  ]);

  const activePhaseIndex = useMemo(() => {
    const phase = progress?.uiPhase ?? status.pendingPhase;
    if (!phase) {
      return 0;
    }
    const index = RUNNER_UPGRADE_PHASE_LABELS.findIndex(
      (_, candidateIndex) =>
        [
          "verifying-managed-repository",
          "comparing-runner-snapshots",
          "preparing-upgrade-commit",
          "updating-managed-runner",
          "verifying-runner-on-production-branch",
          "synchronizing-cloud-configuration",
          "running-configuration-canary",
        ][candidateIndex] === phase,
    );
    return index >= 0 ? index : 0;
  }, [progress?.uiPhase, status.pendingPhase]);

  const guidedPhases = buildGuidedOperationPhases({
    labels: RUNNER_UPGRADE_PHASE_LABELS,
    activeIndex: activePhaseIndex,
  });

  const tokenUnavailable = Boolean(
    status.blockedReason?.includes("GITHUB_TOKEN is required"),
  );
  const updateAvailable =
    status.status === "update_available" ||
    status.status === "partially_updated" ||
    status.status === "failed";
  const canApply =
    updateAvailable &&
    !tokenUnavailable &&
    status.status !== "blocked_non_managed" &&
    status.status !== "blocked_operator_conflicts" &&
    status.status !== "blocked_unexpected_remote";

  const canaryRunUrl = progress?.canaryRunUrl ?? status.canaryRunUrl;

  return (
    <div className="space-y-6 rounded-md border border-border p-4">
      <div>
        <h3 className="text-base font-semibold tracking-tight">PDev runner</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the managed GitHub runner workspace that executes harness automation.
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/10 p-4 text-sm">
        <p>
          <span className="text-muted-foreground">Status:</span> {status.statusLabel}
        </p>
        <p className="mt-2">{formatSnapshotLine("Current runner", status.currentSnapshot)}</p>
        <p className="mt-2">
          {formatSnapshotLine("Available runner", status.availableSnapshot)}
        </p>
        {status.blockedReason ? (
          <p className="mt-2 text-destructive">{status.blockedReason}</p>
        ) : null}
        {status.conflictPaths?.length ? (
          <div className="mt-2">
            <p className="text-muted-foreground">Conflict paths:</p>
            <ul className="mt-1 list-disc pl-5">
              {status.conflictPaths.slice(0, 8).map((conflictPath) => (
                <li key={conflictPath}>{conflictPath}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {status.prUrl ? (
          <p className="mt-2">
            <span className="text-muted-foreground">Upgrade PR:</span>{" "}
            <a href={status.prUrl} className="underline" target="_blank" rel="noreferrer">
              View pull request
            </a>
          </p>
        ) : null}
      </div>

      {tokenUnavailable ? (
        <p className="text-sm text-muted-foreground">
          Connect GitHub in{" "}
          <Link href="/settings/connections" className="underline">
            Settings → Connections
          </Link>{" "}
          to check or update the managed runner.
        </p>
      ) : null}

      {mutation.preview && !mutation.preview.blocked ? (
        <div className="rounded-md border border-border p-4 text-sm">
          <p>
            <span className="text-muted-foreground">Impact:</span>{" "}
            {mutation.preview.impact.replacePathCount} replace,{" "}
            {mutation.preview.impact.deletePathCount} delete
          </p>
          {mutation.preview.impact.sampleReplacePaths.length > 0 ? (
            <p className="mt-2 text-muted-foreground">
              Sample replace paths:{" "}
              {mutation.preview.impact.sampleReplacePaths.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {applying || status.status === "updating" ? (
        <GuidedOperationPanel
          phases={guidedPhases}
          supportingText={
            canaryRunUrl
              ? "Waiting for configuration canary to finish."
              : "Runner upgrade in progress."
          }
          busy={applying || status.status === "updating"}
        />
      ) : null}

      {canaryRunUrl ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Configuration canary:</span>{" "}
          <a href={canaryRunUrl} className="underline" target="_blank" rel="noreferrer">
            View workflow run
          </a>
        </p>
      ) : null}

      <SettingsMutationPanel
        title="Update PDev runner"
        explanation="Apply the packaged runner snapshot to the managed harness repository, sync cloud configuration, and run the configuration canary."
        phase={mutation.phase}
        error={mutation.error}
        successMessage={mutation.successMessage}
        previewPolicy="optional"
        previewSummary={
          mutation.preview?.blocked
            ? mutation.preview.message ?? "Runner upgrade preview is blocked."
            : mutation.preview
              ? `Replace ${mutation.preview.impact.replacePathCount} paths and delete ${mutation.preview.impact.deletePathCount} paths.`
              : null
        }
        confirmScope="remote-repo-write"
        confirmed={confirmed}
        onConfirmedChange={setConfirmed}
        onPreview={() => void runPreview()}
        onApply={() => void runApply()}
        previewLabel="Preview runner update"
        applyLabel="Update runner"
        disablePreview={!canApply || applying}
        disableApply={!canApply || !confirmed || applying}
      />

      {status.status === "partially_updated" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={applying}
            onClick={() => {
              setConfirmed(true);
              void runApply();
            }}
          >
            Resume runner upgrade
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={applying}
            onClick={() => void refreshStatus()}
          >
            Refresh status
          </Button>
        </div>
      ) : null}
    </div>
  );
}
