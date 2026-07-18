"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/status-badge";
import { readSetupJsonResponse } from "@/lib/setup-json-response";
import type {
  VercelRecoveryNextAction,
  VercelRecoveryPublicStatus,
  VercelRecoveryStage,
} from "@harness/setup/vercel-connection-recovery-types";
import { vercelRecoveryStageLabel } from "@harness/setup/vercel-connection-recovery-types";
import { WORKFLOW_ROUTE } from "@harness/setup/gui-routes";
import { bridgeHealthLabel } from "@harness/setup/workspace-health";

const STAGES: VercelRecoveryStage[] = [
  "verifying_vercel",
  "preparing_bridge",
  "deploying_bridge",
  "verifying_webhook",
  "connecting_linear",
  "ready",
];

function nextActionLabel(action: VercelRecoveryNextAction): string {
  switch (action) {
    case "enter_different_token":
      return "Enter a different token";
    case "select_scope":
      return "Select a scope";
    case "retry_deployment":
      return "Retry deployment";
    case "retry_verification":
      return "Retry verification";
    case "retry_linear_connection":
      return "Retry Linear connection";
    case "retry_recovery":
      return "Retry recovery";
    default:
      return "Continue";
  }
}

export function VercelRecoveryPanel({
  active,
  onCredentialHealthRefresh,
}: {
  active: boolean;
  onCredentialHealthRefresh?: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<VercelRecoveryPublicStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async (operationId?: string) => {
    const response = await fetch("/api/setup/vercel-connection-recovery/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId }),
    });
    const next = await readSetupJsonResponse<VercelRecoveryPublicStatus>(
      response,
      "POST /api/setup/vercel-connection-recovery/status",
    );
    setStatus(next);
    return next;
  }, []);

  const startOrAdvance = useCallback(
    async (selectedScope?: { teamId?: string; teamName: string }) => {
      setBusy(true);
      setError(null);
      try {
        const existingId = status?.operation?.operationId;
        let next: VercelRecoveryPublicStatus;
        if (existingId && status?.operation?.stage !== "ready") {
          const response = await fetch(
            "/api/setup/vercel-connection-recovery/advance",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                operationId: existingId,
                selectedScope,
              }),
            },
          );
          next = await readSetupJsonResponse<VercelRecoveryPublicStatus>(
            response,
            "POST /api/setup/vercel-connection-recovery/advance",
          );
        } else {
          const response = await fetch(
            "/api/setup/vercel-connection-recovery/start",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ selectedScope }),
            },
          );
          next = await readSetupJsonResponse<VercelRecoveryPublicStatus>(
            response,
            "POST /api/setup/vercel-connection-recovery/start",
          );
        }
        setStatus(next);
        if (next.redirectToWorkflow || next.operation?.stage === "ready") {
          onCredentialHealthRefresh?.();
          router.push(WORKFLOW_ROUTE);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Recovery failed.");
      } finally {
        setBusy(false);
      }
    },
    [onCredentialHealthRefresh, router, status?.operation?.operationId, status?.operation?.stage],
  );

  useEffect(() => {
    if (!active) {
      return;
    }
    void (async () => {
      try {
        const current = await refreshStatus();
        if (!current.operation || current.operation.stage === "ready") {
          await startOrAdvance();
        }
      } catch {
        // Status endpoint may be empty on first paint; start creates the op.
        await startOrAdvance().catch(() => undefined);
      }
    })();
    // Intentionally run once when the panel becomes active after token save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active || !status?.operation) {
      return;
    }
    const stage = status.operation.stage;
    if (
      stage === "ready" ||
      stage === "failed" ||
      stage === "needs_scope"
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void startOrAdvance();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [active, startOrAdvance, status?.operation]);

  if (!active) {
    return null;
  }

  const operation = status?.operation;
  const currentStage = operation?.stage;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Automation bridge recovery</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            PDev is repairing the Vercel bridge automatically. Stay on this page.
          </p>
        </div>
        {status ? (
          <StatusBadge
            label={bridgeHealthLabel(status.bridgeHealth)}
            variant={
              status.bridgeHealth === "verified"
                ? "success"
                : status.bridgeHealth === "unhealthy"
                  ? "destructive"
                  : "secondary"
            }
          />
        ) : null}
      </div>

      <ol className="space-y-2">
        {STAGES.map((stage) => {
          const label = vercelRecoveryStageLabel(stage);
          const isCurrent = currentStage === stage;
          const currentIndex = currentStage
            ? STAGES.indexOf(
                currentStage === "needs_scope" || currentStage === "failed"
                  ? "preparing_bridge"
                  : currentStage,
              )
            : -1;
          const stageIndex = STAGES.indexOf(stage);
          const done =
            currentStage === "ready" ||
            (currentIndex >= 0 && stageIndex < currentIndex);
          return (
            <li
              key={stage}
              className="flex items-center gap-2 text-sm"
              data-stage={stage}
              data-current={isCurrent ? "true" : undefined}
            >
              <span
                className={
                  done
                    ? "text-emerald-600"
                    : isCurrent
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                }
              >
                {done ? "✓" : isCurrent ? "→" : "·"} {label}
              </span>
            </li>
          );
        })}
      </ol>

      {currentStage === "needs_scope" && operation?.scopeOptions?.length ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Select a Vercel scope before PDev creates the dedicated bridge.
          </p>
          <div className="flex flex-wrap gap-2">
            {operation.scopeOptions.map((scope) => (
              <Button
                key={scope.teamId ?? "personal"}
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void startOrAdvance({
                    teamId: scope.teamId,
                    teamName: scope.teamName,
                  })
                }
              >
                {scope.teamName}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {currentStage === "failed" ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm font-medium">
            {vercelRecoveryStageLabel(operation?.lastSuccessfulStage ?? "failed")}
            {" — "}
            {operation?.humanProblem ?? "Recovery needs attention."}
          </p>
          <p className="text-xs text-muted-foreground">
            Remote changes occurred:{" "}
            {operation?.remoteMutationsOccurred ? "yes" : "no"}. Retry is{" "}
            {operation?.retrySafe ? "safe" : "not recommended"}.
          </p>
          {operation?.nextAction && operation.nextAction !== "none" ? (
            <Button
              type="button"
              size="sm"
              disabled={busy || !operation.retrySafe}
              onClick={() => void startOrAdvance()}
            >
              {nextActionLabel(operation.nextAction)}
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!operation && !busy ? (
        <p className="text-sm text-muted-foreground">Starting recovery…</p>
      ) : null}

      {busy ? (
        <p className="text-sm text-muted-foreground">Working…</p>
      ) : null}
    </div>
  );
}

/** Call after a successful Vercel token patch to begin recovery. */
export async function startVercelRecoveryAfterTokenSave(): Promise<VercelRecoveryPublicStatus> {
  const response = await fetch("/api/setup/vercel-connection-recovery/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return readSetupJsonResponse<VercelRecoveryPublicStatus>(
    response,
    "POST /api/setup/vercel-connection-recovery/start",
  );
}
