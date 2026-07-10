import type { SetupGuiViewModel } from "@/lib/setup-server";
import type { RemoteSetupSummary } from "@/lib/setup-server";
import type { LocalConfigFormInput } from "@harness/setup/config-local-editor";
import type { FirstRunReadiness } from "@harness/setup/first-run-readiness";

import { LAYOUT, SPACING } from "@/lib/constants";
import { ConfigureWorkflow } from "@/components/custom/configure-workflow";
import { RemoteSetupSection } from "@/components/custom/remote-setup-section";
import {
  SetupDashboardGroup,
  SetupReadonlySections,
} from "@/components/custom/setup-readonly-sections";
import { SectionCard } from "@/components/custom/section-card";
import { StatusBadge } from "@/components/custom/status-badge";
import { DoctorChecklist } from "@/components/custom/setup-checklist";

interface SetupDashboardProps {
  summary: SetupGuiViewModel;
  remoteSummary: RemoteSetupSummary;
  readiness: FirstRunReadiness;
  formDefaults: {
    env: {
      harnessConfigPath: string;
      githubDispatchRepository: string;
      suggestedHarnessDispatchRepo?: string;
      secretPresence: {
        LINEAR_API_KEY: boolean;
        CURSOR_API_KEY: boolean;
        GITHUB_TOKEN: boolean;
      };
    };
    config: LocalConfigFormInput;
  };
  onSummaryUpdated: (summary: SetupGuiViewModel) => void;
  onRemoteSummaryUpdated: (summary: RemoteSetupSummary) => void;
  onLocalUiStateChange: (state: { localPreviewStale: boolean }) => void;
  onRemoteUiStateChange: (state: { remoteSecretPreviewStale: boolean }) => void;
}

function checklistItemsFromReadiness(readiness: FirstRunReadiness) {
  return readiness.steps.map((step) => ({
    id: step.id,
    label: step.label,
    detail: step.blockers[0]?.action ?? step.summary,
    status:
      step.status === "complete"
        ? ("complete" as const)
        : step.status === "blocked"
          ? ("blocked" as const)
          : ("pending" as const),
  }));
}

export function SetupDashboard({
  summary,
  remoteSummary,
  readiness,
  formDefaults,
  onSummaryUpdated,
  onRemoteSummaryUpdated,
  onLocalUiStateChange,
  onRemoteUiStateChange,
}: SetupDashboardProps) {
  return (
    <div className={LAYOUT.sectionStack}>
      <SetupDashboardGroup title="Phase 1 · Local setup">
        <ConfigureWorkflow
          mode="advanced"
          initialEnv={formDefaults.env}
          initialConfig={formDefaults.config}
          onSummaryUpdated={onSummaryUpdated}
          onUiStateChange={onLocalUiStateChange}
        />
      </SetupDashboardGroup>

      <SetupDashboardGroup title="Phase 2 · Local readiness">
        <SectionCard
          title="Doctor summary"
          description={summary.doctor.remoteChecksNote}
        >
          <DoctorChecklist checks={summary.doctor.checks} />
        </SectionCard>
      </SetupDashboardGroup>

      <SetupDashboardGroup title="Phase 3 · Remote setup">
        <RemoteSetupSection
          initialSummary={remoteSummary}
          onSummaryUpdated={onRemoteSummaryUpdated}
          onUiStateChange={onRemoteUiStateChange}
          blockedByUpstream={readiness.remoteSetupBlockedByUpstream}
        />
      </SetupDashboardGroup>

      <SetupDashboardGroup title="Phase 4 · Ready for first run">
        <SectionCard
          title="Final readiness"
          description="Confirms setup readiness without triggering a live harness run."
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
            <p className="text-sm text-muted-foreground">
              {readiness.prohibitedActionsNote}
            </p>
          </div>
        </SectionCard>
      </SetupDashboardGroup>

      <SetupDashboardGroup title="Diagnostics and reference">
        <SetupReadonlySections
          summary={summary}
          checklistItems={checklistItemsFromReadiness(readiness)}
        />
      </SetupDashboardGroup>
    </div>
  );
}
