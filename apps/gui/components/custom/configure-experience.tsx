"use client";

import { useCallback, useMemo, useState } from "react";
import type { SetupGuiViewModel } from "@/lib/setup-server";
import type { RemoteSetupSummary } from "@/lib/setup-server";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import {
  deriveFirstRunReadiness,
  type FirstRunReadinessUiState,
  type FirstRunStepId,
} from "@harness/setup/first-run-readiness";

import { LAYOUT, RESPONSIVE, SPACING } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/custom/status-badge";
import { ReadinessBanner } from "@/components/custom/readiness-banner";
import { FirstRunStepper } from "@/components/custom/first-run-stepper";
import { SetupDashboard } from "@/components/custom/setup-dashboard";
import { ConfigureWorkflow } from "@/components/custom/configure-workflow";
import { RemoteSetupSection } from "@/components/custom/remote-setup-section";
import { SectionCard } from "@/components/custom/section-card";
import { DoctorChecklist } from "@/components/custom/setup-checklist";

type ConfigureMode = "guided" | "advanced";

interface ConfigureExperienceProps {
  initialSummary: SetupGuiViewModel;
  initialRemoteSummary: RemoteSetupSummary;
  formDefaults: {
    env: {
      harnessConfigPath: string;
      secretPresence: {
        LINEAR_API_KEY: boolean;
        CURSOR_API_KEY: boolean;
        GITHUB_TOKEN: boolean;
      };
    };
    config: LocalConfigFormInput;
  };
}

export function ConfigureExperience({
  initialSummary,
  initialRemoteSummary,
  formDefaults,
}: ConfigureExperienceProps) {
  const [mode, setMode] = useState<ConfigureMode>("guided");
  const [summary, setSummary] = useState(initialSummary);
  const [remoteSummary, setRemoteSummary] = useState(initialRemoteSummary);
  const [uiState, setUiState] = useState<FirstRunReadinessUiState>({});

  const readiness = useMemo(
    () => deriveFirstRunReadiness({ summary, remoteSummary, uiState }),
    [summary, remoteSummary, uiState],
  );

  const handleLocalUiStateChange = useCallback(
    (state: { localPreviewStale: boolean }) => {
      setUiState((current) => {
        if (current.localPreviewStale === state.localPreviewStale) {
          return current;
        }
        return {
          ...current,
          localPreviewStale: state.localPreviewStale,
        };
      });
    },
    [],
  );

  const handleRemoteUiStateChange = useCallback(
    (state: { remoteSecretPreviewStale: boolean }) => {
      setUiState((current) => {
        if (current.remoteSecretPreviewStale === state.remoteSecretPreviewStale) {
          return current;
        }
        return {
          ...current,
          remoteSecretPreviewStale: state.remoteSecretPreviewStale,
        };
      });
    },
    [],
  );

  const renderGuidedStep = (stepId: FirstRunStepId) => {
    switch (stepId) {
      case "local-setup":
        return (
          <ConfigureWorkflow
            initialEnv={formDefaults.env}
            initialConfig={formDefaults.config}
            onSummaryUpdated={setSummary}
            onUiStateChange={handleLocalUiStateChange}
          />
        );
      case "local-readiness":
        return (
          <SectionCard
            title="Local readiness checks"
            description="Resolve local config and doctor blockers before remote setup."
          >
            <DoctorChecklist checks={summary.doctor.checks} />
          </SectionCard>
        );
      case "remote-setup":
        return (
          <RemoteSetupSection
            initialSummary={remoteSummary}
            onSummaryUpdated={setRemoteSummary}
            onUiStateChange={handleRemoteUiStateChange}
          />
        );
      case "ready-for-first-run":
        return (
          <SectionCard
            title="Ready for first run"
            description="Setup readiness only. No live harness phase is available in M6."
          >
            <div className={SPACING.stackSm}>
              <StatusBadge
                label={
                  readiness.readyForFirstRun
                    ? "Ready for first run"
                    : "Blocked for first run"
                }
                variant={readiness.readyForFirstRun ? "success" : "warning"}
              />
              {readiness.readyForFirstRun ? (
                <p className="text-sm text-muted-foreground">
                  Your harness setup is ready. A later milestone can add a safe
                  first-issue dry run or no-op harness validation.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {readiness.highestPriorityBlocker?.action ??
                    "Complete the earlier setup steps first."}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {readiness.prohibitedActionsNote}
              </p>
            </div>
          </SectionCard>
        );
    }
  };

  return (
    <div className={LAYOUT.sectionStack}>
      <section className={SPACING.section}>
        <div className={SPACING.stackSm}>
          <h2 className={RESPONSIVE.pageTitle}>Settings / Configure</h2>
          <p className={RESPONSIVE.pageDescription}>
            Guided first-run readiness for the Product Development Harness.
            Complete local setup, local readiness checks, and remote setup before
            your first future harness run.
          </p>
        </div>
        <div className={SPACING.inline}>
          <StatusBadge
            label={
              readiness.readyForFirstRun
                ? "Ready for first run"
                : "Setup in progress"
            }
            variant={readiness.readyForFirstRun ? "success" : "warning"}
          />
          <StatusBadge
            label={
              summary.overview.configResolved
                ? "Config resolved"
                : "Config unresolved"
            }
            variant={
              summary.overview.configResolved ? "success" : "destructive"
            }
          />
          {mode === "guided" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode("advanced")}
            >
              Advanced checklist view
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode("guided")}
            >
              Back to guided flow
            </Button>
          )}
        </div>
      </section>

      <ReadinessBanner readiness={readiness} />

      {mode === "guided" ? (
        <FirstRunStepper
          readiness={readiness}
          renderStepContent={renderGuidedStep}
          onSwitchToAdvanced={() => setMode("advanced")}
        />
      ) : (
        <SetupDashboard
          summary={summary}
          remoteSummary={remoteSummary}
          readiness={readiness}
          formDefaults={formDefaults}
          onSummaryUpdated={setSummary}
          onRemoteSummaryUpdated={setRemoteSummary}
          onLocalUiStateChange={handleLocalUiStateChange}
          onRemoteUiStateChange={handleRemoteUiStateChange}
        />
      )}
    </div>
  );
}
