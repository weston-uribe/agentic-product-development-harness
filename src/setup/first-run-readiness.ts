import type { SetupGuiViewModel } from "./gui-view-model.js";
import type { RemoteSetupSummary } from "./remote-setup-summary.js";
import {
  HARNESS_ACTIONS_SECRET_NAMES,
  type HarnessActionsSecretName,
} from "./remote-actions.js";
import type { StaleSmokeDiagnostics } from "./stale-smoke-repo.js";
import {
  remoteSetupBlockedByStaleSmoke,
  shouldSuppressRemoteDownstreamStatus,
} from "./stale-smoke-repo.js";

export type FirstRunStepId =
  | "local-setup"
  | "local-readiness"
  | "remote-setup"
  | "ready-for-first-run";

export type FirstRunStepStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "ready"
  | "complete";

export interface ReadinessBlocker {
  id: string;
  stepId: FirstRunStepId;
  message: string;
  action: string;
  priority: number;
  blocking: boolean;
}

export interface ReadinessAction {
  id: string;
  label: string;
  stepId: FirstRunStepId;
}

export interface FirstRunStep {
  id: FirstRunStepId;
  label: string;
  status: FirstRunStepStatus;
  summary: string;
  blockers: ReadinessBlocker[];
  warnings: ReadinessBlocker[];
  primaryAction?: ReadinessAction;
  inspectable: boolean;
  actionable: boolean;
}

export interface FirstRunReadinessUiState {
  localPreviewStale?: boolean;
  remoteSecretPreviewStale?: boolean;
}

export interface PrimarySetupTask {
  id: string;
  stepId: FirstRunStepId;
  title: string;
  problem: string;
  whyItMatters: string;
  neededFromYou: string;
  primaryCtaLabel: string;
  secondaryCtaLabel: string;
}

export interface FirstRunReadiness {
  steps: FirstRunStep[];
  currentStepId: FirstRunStepId;
  highestPriorityBlocker?: ReadinessBlocker;
  nextRecommendedAction?: ReadinessAction;
  primaryTask?: PrimarySetupTask;
  staleSmokeDiagnostics: StaleSmokeDiagnostics;
  remoteSetupBlockedByUpstream: boolean;
  readyForFirstRun: boolean;
  nonBlockingWarnings: ReadinessBlocker[];
  prohibitedActionsNote: string;
}

const STEP_ORDER: FirstRunStepId[] = [
  "local-setup",
  "local-readiness",
  "remote-setup",
  "ready-for-first-run",
];

const STEP_LABELS: Record<FirstRunStepId, string> = {
  "local-setup": "Local setup",
  "local-readiness": "Local readiness",
  "remote-setup": "Remote setup",
  "ready-for-first-run": "Ready for first run",
};

const PROHIBITED_ACTIONS_NOTE =
  "M6 confirms setup readiness only. It does not trigger harness phases, Linear automation, cloud workflow dispatch, implementation branches, or issue-work PRs. A later milestone may add a safe first-issue dry run.";

function localFileExists(
  summary: SetupGuiViewModel,
  label: string,
): boolean {
  return summary.localFiles.find((file) => file.label === label)?.exists ?? false;
}

function pushBlocker(
  blockers: ReadinessBlocker[],
  blocker: Omit<ReadinessBlocker, "blocking"> & { blocking?: boolean },
): void {
  blockers.push({ blocking: true, ...blocker });
}

function pushWarning(
  warnings: ReadinessBlocker[],
  blocker: Omit<ReadinessBlocker, "blocking">,
): void {
  warnings.push({ ...blocker, blocking: false });
}

export function collectLocalSetupBlockers(
  summary: SetupGuiViewModel,
  uiState?: FirstRunReadinessUiState,
  staleSmokeDiagnostics?: StaleSmokeDiagnostics,
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];

  if (!localFileExists(summary, ".env.local")) {
    pushBlocker(blockers, {
      id: "missing-env-local",
      stepId: "local-setup",
      message: "Blocked: .env.local is missing.",
      action: "Next: Fill environment fields, preview local files, then apply.",
      priority: 100,
    });
  }

  if (!localFileExists(summary, ".harness/config.local.json")) {
    pushBlocker(blockers, {
      id: "missing-config-local",
      stepId: "local-setup",
      message: "Blocked: .harness/config.local.json is missing.",
      action:
        "Next: Complete target repo config fields, preview local files, then apply.",
      priority: 101,
    });
  }

  if (!summary.envKeyPresence.HARNESS_CONFIG_PATH) {
    pushBlocker(blockers, {
      id: "missing-harness-config-path",
      stepId: "local-setup",
      message: "Blocked: HARNESS_CONFIG_PATH is not set in .env.local.",
      action:
        "Next: Set HARNESS_CONFIG_PATH to .harness/config.local.json, then preview and apply.",
      priority: 102,
    });
  }

  if (!summary.envKeyPresence.LINEAR_API_KEY) {
    pushBlocker(blockers, {
      id: "missing-linear-key",
      stepId: "local-setup",
      message: "Blocked: LINEAR_API_KEY is missing.",
      action: "Next: Add it in Local setup, then preview local files.",
      priority: 103,
    });
  }

  if (!summary.envKeyPresence.CURSOR_API_KEY) {
    pushBlocker(blockers, {
      id: "missing-cursor-key",
      stepId: "local-setup",
      message: "Blocked: CURSOR_API_KEY is missing.",
      action: "Next: Add it in Local setup, then preview local files.",
      priority: 104,
    });
  }

  if (!summary.envKeyPresence.GITHUB_TOKEN) {
    pushBlocker(blockers, {
      id: "missing-github-token",
      stepId: "local-setup",
      message: "Blocked: GITHUB_TOKEN is missing.",
      action: "Next: Add it in Local setup, then preview local files.",
      priority: 105,
    });
  }

  if (!summary.overview.configResolved && !summary.configSource.parseError) {
    pushBlocker(blockers, {
      id: "config-unresolved",
      stepId: "local-setup",
      message: "Blocked: Harness config is not resolving from your local files.",
      action:
        "Next: Point HARNESS_CONFIG_PATH at .harness/config.local.json and apply local setup.",
      priority: 106,
    });
  }

  if (uiState?.localPreviewStale) {
    pushBlocker(blockers, {
      id: "local-preview-stale",
      stepId: "local-setup",
      message: "Blocked: Local preview is out of date.",
      action:
        "Next: Regenerate preview after your latest edits, then confirm and apply.",
      priority: 107,
    });
  }

  if (staleSmokeDiagnostics?.hasStaleConfig) {
    if (staleSmokeDiagnostics.staleHarnessDispatchRepo) {
      pushBlocker(blockers, {
        id: "stale-smoke-dispatch-repo",
        stepId: "local-setup",
        message:
          "Blocked: Your setup points at an old disposable smoke-test harness repo.",
        action:
          "Next: Reset GITHUB_DISPATCH_REPOSITORY to your current harness repo, preview local setup, then apply.",
        priority: 108,
      });
    }

    if (staleSmokeDiagnostics.staleTargetRepos.length > 0) {
      pushBlocker(blockers, {
        id: "stale-smoke-target-repo",
        stepId: "local-setup",
        message:
          "Blocked: Target repo config still points at an old disposable smoke-test repo.",
        action:
          "Next: Enter your intended target repo in Local setup, preview local setup, then apply.",
        priority: 109,
      });
    }
  }

  return blockers.sort((left, right) => left.priority - right.priority);
}

export function collectLocalReadinessBlockers(
  summary: SetupGuiViewModel,
): { blockers: ReadinessBlocker[]; warnings: ReadinessBlocker[] } {
  const blockers: ReadinessBlocker[] = [];
  const warnings: ReadinessBlocker[] = [];

  if (summary.configSource.parseError) {
    pushBlocker(blockers, {
      id: "config-parse-error",
      stepId: "local-readiness",
      message: "Blocked: Harness config does not parse.",
      action:
        "Next: Fix .harness/config.local.json validation errors in Local setup.",
      priority: 200,
    });
  }

  if (summary.configSummary && !summary.configSummary.closureValid) {
    pushBlocker(blockers, {
      id: "allowed-target-repos-closure",
      stepId: "local-readiness",
      message:
        "Blocked: allowedTargetRepos does not cover every configured target repo.",
      action:
        "Next: Update target repo config so allowedTargetRepos includes each mapping.",
      priority: 201,
    });
  }

  for (const check of summary.doctor.checks) {
    if (check.skipped) {
      pushWarning(warnings, {
        id: `doctor-skipped-${check.label}`,
        stepId: "local-readiness",
        message: `${check.label} was not checked in the GUI.`,
        action: "Run npm run harness:doctor for full provider validation.",
        priority: 590,
      });
      continue;
    }

    if (!check.ok) {
      pushBlocker(blockers, {
        id: `doctor-failed-${check.label}`,
        stepId: "local-readiness",
        message: `Blocked: ${check.label} failed.`,
        action: check.detail
          ? `Next: ${check.detail}`
          : "Next: Resolve this local readiness check in Local setup.",
        priority: 202,
      });
    }
  }

  return {
    blockers: blockers.sort((left, right) => left.priority - right.priority),
    warnings: warnings.sort((left, right) => left.priority - right.priority),
  };
}

function missingHarnessSecrets(
  remoteSummary: RemoteSetupSummary,
): HarnessActionsSecretName[] {
  const statusByName = new Map(
    remoteSummary.harnessSecretStatuses.map((entry) => [entry.name, entry.status]),
  );

  return HARNESS_ACTIONS_SECRET_NAMES.filter(
    (name) => statusByName.get(name) === "missing",
  );
}

export function collectRemoteSetupBlockers(
  summary: SetupGuiViewModel,
  remoteSummary: RemoteSetupSummary,
  uiState?: FirstRunReadinessUiState,
  staleSmokeDiagnostics?: StaleSmokeDiagnostics,
): { blockers: ReadinessBlocker[]; warnings: ReadinessBlocker[] } {
  const blockers: ReadinessBlocker[] = [];
  const warnings: ReadinessBlocker[] = [];
  const suppressDownstream = staleSmokeDiagnostics
    ? shouldSuppressRemoteDownstreamStatus(
        staleSmokeDiagnostics,
        remoteSummary.harnessRepoAccess,
      )
    : false;

  if (suppressDownstream) {
    return { blockers, warnings };
  }

  if (!remoteSummary.githubTokenConfigured) {
    pushBlocker(blockers, {
      id: "missing-github-token-remote",
      stepId: "remote-setup",
      message: "Blocked: GITHUB_TOKEN is required for remote setup.",
      action: "Next: Add GITHUB_TOKEN in Local setup, then return to Remote setup.",
      priority: 300,
    });
  }

  if (!remoteSummary.harnessDispatchRepoResolved) {
    pushBlocker(blockers, {
      id: "harness-dispatch-repo-unresolved",
      stepId: "remote-setup",
      message: "Blocked: Harness dispatch repo could not be resolved.",
      action:
        "Next: Confirm your harness repo remote and target repo config, then refresh remote setup.",
      priority: 301,
    });
  }

  if (remoteSummary.harnessRepoAccess === "denied") {
    pushBlocker(blockers, {
      id: "harness-repo-access-denied",
      stepId: "remote-setup",
      message: `Blocked: I tried to check ${remoteSummary.harnessDispatchRepo} and GitHub denied access.`,
      action:
        "Next: Confirm this is the repo you intend to use. If it is wrong, fix local setup first. If it is correct, update your GitHub token permissions and refresh.",
      priority: 302,
    });
  } else if (
    remoteSummary.harnessRepoAccess === "unknown" &&
    remoteSummary.githubTokenConfigured
  ) {
    pushWarning(warnings, {
      id: "harness-repo-access-unknown",
      stepId: "remote-setup",
      message: "Harness repo access could not be verified yet.",
      action: "Refresh remote setup after GITHUB_TOKEN is saved locally.",
      priority: 590,
    });
  }

  for (const secretName of missingHarnessSecrets(remoteSummary)) {
    pushBlocker(blockers, {
      id: `missing-harness-secret-${secretName}`,
      stepId: "remote-setup",
      message: `Blocked: Harness Actions secret ${secretName} is missing.`,
      action:
        "Next: Preview harness secrets, confirm the write scope, then apply harness secrets.",
      priority: 303,
    });
  }

  for (const secret of remoteSummary.harnessSecretStatuses) {
    if (secret.status === "unknown" && remoteSummary.githubTokenConfigured) {
      pushWarning(warnings, {
        id: `harness-secret-unknown-${secret.name}`,
        stepId: "remote-setup",
        message: `Harness Actions secret ${secret.name} status is unknown.`,
        action: "Refresh remote setup to re-check secret presence.",
        priority: 591,
      });
    }
  }

  if (remoteSummary.targetRepos.length === 0 && summary.overview.configResolved) {
    pushBlocker(blockers, {
      id: "missing-target-repos",
      stepId: "remote-setup",
      message: "Blocked: No target repos are configured for workflow install.",
      action: "Next: Add at least one target repo mapping in Local setup.",
      priority: 304,
    });
  }

  for (const repo of remoteSummary.targetRepos) {
    if (repo.repoAccess === "denied") {
      pushBlocker(blockers, {
        id: `target-repo-access-denied-${repo.repoConfigId}`,
        stepId: "remote-setup",
        message: `Blocked: GitHub access to ${repo.targetRepo} was denied.`,
        action:
          "Next: Grant workflow and PR permissions for this target repo, then refresh.",
        priority: 305,
      });
    }

    if (repo.workflowStatus === "missing" || repo.workflowStatus === "differs") {
      pushBlocker(blockers, {
        id: `target-workflow-${repo.workflowStatus}-${repo.repoConfigId}`,
        stepId: "remote-setup",
        message: `Blocked: Target workflow is ${repo.workflowStatus} for ${repo.repoConfigId}.`,
        action:
          "Next: Preview the target workflow install PR, confirm, then apply the PR card.",
        priority: 306,
      });
    }

    if (repo.workflowStatus === "unknown" && remoteSummary.githubTokenConfigured) {
      pushWarning(warnings, {
        id: `target-workflow-unknown-${repo.repoConfigId}`,
        stepId: "remote-setup",
        message: `Target workflow status is unknown for ${repo.repoConfigId}.`,
        action: "Refresh remote setup to re-check workflow presence.",
        priority: 592,
      });
    }
  }

  if (uiState?.remoteSecretPreviewStale) {
    pushBlocker(blockers, {
      id: "remote-secret-preview-stale",
      stepId: "remote-setup",
      message: "Blocked: Harness secret preview is out of date.",
      action:
        "Next: Regenerate the harness secret preview, then confirm and apply.",
      priority: 307,
    });
  }

  return {
    blockers: blockers.sort((left, right) => left.priority - right.priority),
    warnings: warnings.sort((left, right) => left.priority - right.priority),
  };
}

function stepPrerequisitesMet(
  stepId: FirstRunStepId,
  localSetupComplete: boolean,
  localReadinessComplete: boolean,
  remoteSetupComplete: boolean,
): boolean {
  switch (stepId) {
    case "local-setup":
      return true;
    case "local-readiness":
      return localSetupComplete;
    case "remote-setup":
      return localReadinessComplete;
    case "ready-for-first-run":
      return remoteSetupComplete;
  }
}

function primaryActionForStep(
  stepId: FirstRunStepId,
  blockers: ReadinessBlocker[],
): ReadinessAction | undefined {
  const stepBlocker = blockers.find((blocker) => blocker.stepId === stepId);
  if (stepBlocker) {
    return {
      id: stepBlocker.id,
      label: stepBlocker.action.replace(/^Next:\s*/, ""),
      stepId,
    };
  }

  switch (stepId) {
    case "local-setup":
      return {
        id: "preview-local-files",
        label: "Preview and apply local setup files",
        stepId,
      };
    case "local-readiness":
      return {
        id: "review-local-readiness",
        label: "Review local readiness checks",
        stepId,
      };
    case "remote-setup":
      return {
        id: "complete-remote-setup",
        label: "Complete harness secrets and target workflow PRs",
        stepId,
      };
    case "ready-for-first-run":
      return {
        id: "review-first-run-readiness",
        label: "Review final readiness state",
        stepId,
      };
  }
}

function deriveStepStatus(input: {
  stepId: FirstRunStepId;
  prerequisitesMet: boolean;
  blockers: ReadinessBlocker[];
  complete: boolean;
  isCurrent: boolean;
}): FirstRunStepStatus {
  if (!input.prerequisitesMet) {
    return "not_started";
  }
  if (input.complete) {
    return "complete";
  }
  if (input.blockers.length > 0) {
    return input.isCurrent ? "blocked" : "blocked";
  }
  if (input.isCurrent) {
    return "in_progress";
  }
  return "ready";
}

function derivePrimarySetupTask(input: {
  highestPriorityBlocker?: ReadinessBlocker;
  staleSmokeDiagnostics: StaleSmokeDiagnostics;
}): PrimarySetupTask | undefined {
  if (input.staleSmokeDiagnostics.hasStaleConfig) {
    const needsTargetRepo =
      input.staleSmokeDiagnostics.staleTargetRepos.length > 0;
    const suggestedRepo =
      input.staleSmokeDiagnostics.suggestedHarnessDispatchRepo;

    return {
      id: "fix-stale-smoke-config",
      stepId: "local-setup",
      title: "I need this from you now",
      problem: "Your setup points at an old disposable smoke-test repo.",
      whyItMatters:
        "That repo may have been deleted after the M5.5 smoke test, so GitHub access checks fail.",
      neededFromYou: needsTargetRepo
        ? suggestedRepo
          ? `Reset GITHUB_DISPATCH_REPOSITORY to ${suggestedRepo}, and enter the target repo you actually intend to use.`
          : "Reset the stale harness dispatch repo and enter the target repo you actually intend to use."
        : suggestedRepo
          ? `Reset GITHUB_DISPATCH_REPOSITORY to ${suggestedRepo}.`
          : "Reset the stale harness dispatch repo to your current harness repo.",
      primaryCtaLabel: "Preview local setup fix",
      secondaryCtaLabel: "Show details",
    };
  }

  if (input.highestPriorityBlocker?.id === "harness-repo-access-denied") {
    return {
      id: "confirm-harness-repo-access",
      stepId: "remote-setup",
      title: "I need this from you now",
      problem: input.highestPriorityBlocker.message.replace(/^Blocked:\s*/, ""),
      whyItMatters:
        "Remote setup cannot continue until the harness dispatch repo is reachable with your GitHub token.",
      neededFromYou:
        "Confirm the harness dispatch repo is the one you intend to use, or fix local setup if it is wrong.",
      primaryCtaLabel: "Review remote setup details",
      secondaryCtaLabel: "Show details",
    };
  }

  if (input.highestPriorityBlocker) {
    return {
      id: input.highestPriorityBlocker.id,
      stepId: input.highestPriorityBlocker.stepId,
      title: "I need this from you now",
      problem: input.highestPriorityBlocker.message.replace(/^Blocked:\s*/, ""),
      whyItMatters: "Setup cannot continue until this blocker is resolved.",
      neededFromYou: input.highestPriorityBlocker.action.replace(/^Next:\s*/, ""),
      primaryCtaLabel: input.highestPriorityBlocker.action.replace(
        /^Next:\s*/,
        "",
      ),
      secondaryCtaLabel: "Show details",
    };
  }

  return undefined;
}

export function deriveFirstRunReadiness(input: {
  summary: SetupGuiViewModel;
  remoteSummary: RemoteSetupSummary;
  uiState?: FirstRunReadinessUiState;
  staleSmokeDiagnostics?: StaleSmokeDiagnostics;
}): FirstRunReadiness {
  const staleSmokeDiagnostics = input.staleSmokeDiagnostics ?? {
    hasStaleConfig: false,
    findings: [],
    staleTargetRepos: [],
  };

  const localSetupBlockers = collectLocalSetupBlockers(
    input.summary,
    input.uiState,
    staleSmokeDiagnostics,
  );
  const localReadiness = collectLocalReadinessBlockers(input.summary);
  const remoteSetup = collectRemoteSetupBlockers(
    input.summary,
    input.remoteSummary,
    input.uiState,
    staleSmokeDiagnostics,
  );

  const localSetupComplete = localSetupBlockers.length === 0;
  const localReadinessComplete =
    localSetupComplete &&
    localReadiness.blockers.length === 0 &&
    input.summary.overview.readyForLocalDoctor;
  const remoteSetupComplete =
    localReadinessComplete && remoteSetup.blockers.length === 0;
  const readyForFirstRun = remoteSetupComplete;

  const allBlockers = [
    ...localSetupBlockers,
    ...localReadiness.blockers,
    ...remoteSetup.blockers,
  ].sort((left, right) => left.priority - right.priority);

  const nonBlockingWarnings = [
    ...localReadiness.warnings,
    ...remoteSetup.warnings,
  ].sort((left, right) => left.priority - right.priority);

  const currentStepId =
    !localSetupComplete
      ? "local-setup"
      : !localReadinessComplete
        ? "local-readiness"
        : !remoteSetupComplete
          ? "remote-setup"
          : "ready-for-first-run";

  const stepBlockers: Record<FirstRunStepId, ReadinessBlocker[]> = {
    "local-setup": localSetupBlockers,
    "local-readiness": localReadiness.blockers,
    "remote-setup": remoteSetup.blockers,
    "ready-for-first-run": readyForFirstRun
      ? []
      : [
          {
            id: "not-ready-for-first-run",
            stepId: "ready-for-first-run",
            message: "Blocked: Harness setup is not ready for a first run yet.",
            action: "Next: Complete the earlier setup steps first.",
            priority: 400,
            blocking: true,
          },
        ],
  };

  const steps: FirstRunStep[] = STEP_ORDER.map((stepId) => {
    const prerequisitesMet = stepPrerequisitesMet(
      stepId,
      localSetupComplete,
      localReadinessComplete,
      remoteSetupComplete,
    );
    const blockers = stepBlockers[stepId];
    const warnings =
      stepId === "local-readiness"
        ? localReadiness.warnings
        : stepId === "remote-setup"
          ? remoteSetup.warnings
          : [];
    const complete =
      stepId === "local-setup"
        ? localSetupComplete
        : stepId === "local-readiness"
          ? localReadinessComplete
          : stepId === "remote-setup"
            ? remoteSetupComplete
            : readyForFirstRun;
    const isCurrent = stepId === currentStepId;

    return {
      id: stepId,
      label: STEP_LABELS[stepId],
      status: deriveStepStatus({
        stepId,
        prerequisitesMet,
        blockers,
        complete,
        isCurrent,
      }),
      summary:
        stepId === "ready-for-first-run" && readyForFirstRun
          ? "Harness setup is ready for a future first run."
          : blockers[0]?.message ?? `Continue ${STEP_LABELS[stepId].toLowerCase()}.`,
      blockers,
      warnings,
      primaryAction: primaryActionForStep(stepId, allBlockers),
      inspectable: true,
      actionable: prerequisitesMet && (isCurrent || blockers.length > 0),
    };
  });

  const highestPriorityBlocker = allBlockers[0];
  const nextRecommendedAction = highestPriorityBlocker
    ? {
        id: highestPriorityBlocker.id,
        label: highestPriorityBlocker.action.replace(/^Next:\s*/, ""),
        stepId: highestPriorityBlocker.stepId,
      }
    : steps.find((step) => step.id === currentStepId)?.primaryAction;

  const primaryTask = derivePrimarySetupTask({
    highestPriorityBlocker,
    staleSmokeDiagnostics,
  });

  return {
    steps,
    currentStepId,
    highestPriorityBlocker,
    nextRecommendedAction,
    primaryTask,
    staleSmokeDiagnostics,
    remoteSetupBlockedByUpstream: remoteSetupBlockedByStaleSmoke(
      staleSmokeDiagnostics,
    ),
    readyForFirstRun,
    nonBlockingWarnings,
    prohibitedActionsNote: PROHIBITED_ACTIONS_NOTE,
  };
}

export function projectMissingStepsFromReadiness(
  readiness: FirstRunReadiness,
): Array<{ id: string; label: string; detail: string }> {
  return readiness.steps
    .flatMap((step) => [...step.blockers, ...step.warnings])
    .filter((entry) => entry.blocking)
    .map((entry) => ({
      id: entry.id,
      label: entry.message.replace(/^Blocked:\s*/, ""),
      detail: entry.action.replace(/^Next:\s*/, ""),
    }));
}
