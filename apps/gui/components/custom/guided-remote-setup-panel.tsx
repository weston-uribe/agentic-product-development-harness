"use client";

import type { RemoteSetupSummary } from "@harness/setup/remote-setup-summary";

import { SPACING } from "@/lib/constants";
import { SectionCard } from "@/components/custom/section-card";
import { RemoteSetupSection } from "@/components/custom/remote-setup-section";

const GUIDED_STEP_COUNT = 4;

interface GuidedRemoteSetupPanelProps {
  initialSummary: RemoteSetupSummary;
  onSummaryUpdated?: (summary: RemoteSetupSummary) => void;
  onUiStateChange?: (state: { remoteSecretPreviewStale: boolean }) => void;
  blockedByUpstream?: boolean;
}

export function GuidedRemoteSetupPanel({
  initialSummary,
  onSummaryUpdated,
  onUiStateChange,
  blockedByUpstream = false,
}: GuidedRemoteSetupPanelProps) {
  return (
    <div className={SPACING.stackSm}>
      <SectionCard
        title={`Step 4 of ${GUIDED_STEP_COUNT} · Connect remote setup`}
        description="Install the target workflow and configure GitHub Actions secrets so cloud harness runs can reach your repos."
      >
        <p className="text-sm text-muted-foreground">
          Remote setup may include target workflow install PRs, harness repo
          access checks, and GitHub Actions secrets. Nothing is applied until
          you preview and confirm each action.
        </p>
      </SectionCard>

      <RemoteSetupSection
        initialSummary={initialSummary}
        onSummaryUpdated={onSummaryUpdated}
        onUiStateChange={onUiStateChange}
        blockedByUpstream={blockedByUpstream}
      />
    </div>
  );
}
