import { describe, expect, it } from "vitest";
import {
  collectLocalReadinessBlockers,
  collectLocalSetupBlockers,
  collectRemoteSetupBlockers,
  deriveFirstRunReadiness,
  projectMissingStepsFromReadiness,
} from "../../src/setup/first-run-readiness.js";
import type { SetupGuiViewModel } from "../../src/setup/gui-view-model.js";
import type { RemoteSetupSummary } from "../../src/setup/remote-setup-summary.js";
import { HARNESS_ACTIONS_SECRET_NAMES } from "../../src/setup/remote-actions.js";

function baseSummary(
  overrides: Partial<SetupGuiViewModel> = {},
): SetupGuiViewModel {
  return {
    overview: {
      readyForLocalDoctor: false,
      configResolved: false,
      operatorConfigResolved: false,
      localFilesPresent: false,
    },
    localFiles: [
      { label: ".env.local", path: "/tmp/.env.local", exists: false },
      {
        label: ".harness/config.local.json",
        path: "/tmp/.harness/config.local.json",
        exists: false,
      },
    ],
    configSource: {
      kind: "HARNESS_CONFIG_PATH",
      label: ".harness/config.local.json",
      resolved: false,
    },
    envKeyPresence: {
      LINEAR_API_KEY: false,
      CURSOR_API_KEY: false,
      GITHUB_TOKEN: false,
      HARNESS_CONFIG_PATH: false,
    },
    scaffoldPreviews: [],
    instructionPreviews: [],
    generatedPreviews: {},
    missingSteps: [],
    doctor: {
      checks: [
        {
          label: "harness config valid",
          ok: false,
          detail: "config could not be resolved",
        },
      ],
      groups: [],
      failed: true,
      remoteChecksNote: "CLI doctor required for live provider checks.",
    },
    deferredActions: [],
    ...overrides,
  };
}

function completeLocalSummary(): SetupGuiViewModel {
  return baseSummary({
    overview: {
      readyForLocalDoctor: true,
      configResolved: true,
      operatorConfigResolved: true,
      localFilesPresent: true,
    },
    localFiles: [
      { label: ".env.local", path: "/tmp/.env.local", exists: true },
      {
        label: ".harness/config.local.json",
        path: "/tmp/.harness/config.local.json",
        exists: true,
      },
    ],
    configSource: {
      kind: "HARNESS_CONFIG_PATH",
      label: ".harness/config.local.json",
      resolved: true,
    },
    configSummary: {
      repoCount: 1,
      repos: [
        {
          id: "target-app",
          targetRepo: "https://github.com/owner/example-target-app",
          baseBranch: "dev",
          productionBranch: "main",
        },
      ],
      allowedTargetRepos: ["https://github.com/owner/example-target-app"],
      closureValid: true,
      model: {
        resolvedModelId: "composer-2.5",
        source: "default",
        configuredModelId: undefined,
        policyNote: "test",
      },
    },
    envKeyPresence: {
      LINEAR_API_KEY: true,
      CURSOR_API_KEY: true,
      GITHUB_TOKEN: true,
      HARNESS_CONFIG_PATH: true,
    },
    doctor: {
      checks: [
        { label: "harness config valid", ok: true },
        { label: ".env.local present", ok: true },
        { label: ".harness/config.local.json present", ok: true },
        {
          label: "LINEAR_API_KEY set",
          ok: false,
          skipped: true,
          detail: "CLI-only",
        },
      ],
      groups: [],
      failed: false,
      remoteChecksNote: "CLI doctor required for live provider checks.",
    },
  });
}

function baseRemoteSummary(
  overrides: Partial<RemoteSetupSummary> = {},
): RemoteSetupSummary {
  return {
    githubTokenConfigured: false,
    harnessDispatchRepo: "owner/harness",
    harnessDispatchRepoResolved: true,
    harnessDispatchRepoSource: "git remote",
    harnessRepoAccess: "unknown",
    harnessSecretStatuses: HARNESS_ACTIONS_SECRET_NAMES.map((name) => ({
      name,
      status: "unknown" as const,
    })),
    targetRepos: [],
    staleSmokeDiagnostics: {
      hasStaleConfig: false,
      findings: [],
      staleTargetRepos: [],
    },
    ...overrides,
  };
}

describe("first-run-readiness", () => {
  it("blocks step 1 when .env.local is missing", () => {
    const blockers = collectLocalSetupBlockers(baseSummary());
    expect(blockers[0]?.id).toBe("missing-env-local");
    expect(blockers[0]?.message).toContain("Setup needed");
    expect(blockers[0]?.tone).toBe("setup_needed");
  });

  it("blocks step 1 when CURSOR_API_KEY is missing before remote warnings", () => {
    const summary = baseSummary({
      localFiles: [
        { label: ".env.local", path: "/tmp/.env.local", exists: true },
        {
          label: ".harness/config.local.json",
          path: "/tmp/.harness/config.local.json",
          exists: true,
        },
      ],
      envKeyPresence: {
        LINEAR_API_KEY: true,
        CURSOR_API_KEY: false,
        GITHUB_TOKEN: true,
        HARNESS_CONFIG_PATH: true,
      },
    });

    const readiness = deriveFirstRunReadiness({
      summary,
      remoteSummary: baseRemoteSummary({ githubTokenConfigured: true }),
    });

    expect(readiness.currentStepId).toBe("local-setup");
    expect(readiness.highestPriorityBlocker?.id).toBe("missing-cursor-key");
    expect(
      readiness.nonBlockingWarnings.some((warning) =>
        warning.id.includes("doctor-skipped"),
      ),
    ).toBe(false);
  });

  it("blocks step 2 on config parse errors with PM-readable copy", () => {
    const summary = completeLocalSummary();
    summary.configSource.parseError = "Invalid harness config: repos: Required";
    summary.overview.configResolved = false;
    summary.overview.readyForLocalDoctor = false;

    const readiness = deriveFirstRunReadiness({
      summary,
      remoteSummary: baseRemoteSummary(),
    });

    expect(readiness.currentStepId).toBe("local-readiness");
    expect(
      readiness.highestPriorityBlocker?.message,
    ).toContain("does not parse");
    expect(JSON.stringify(readiness)).not.toContain("super-secret");
  });

  it("blocks step 2 when allowedTargetRepos closure is invalid", () => {
    const summary = completeLocalSummary();
    if (summary.configSummary) {
      summary.configSummary.closureValid = false;
    }

    const blockers = collectLocalReadinessBlockers(summary).blockers;
    expect(blockers.some((blocker) => blocker.id === "allowed-target-repos-closure")).toBe(
      true,
    );
  });

  it("blocks step 3 when GitHub token or harness repo access is missing", () => {
    const summary = completeLocalSummary();
    const remoteSummary = baseRemoteSummary({
      githubTokenConfigured: false,
      harnessRepoAccess: "denied",
    });

    const readiness = deriveFirstRunReadiness({ summary, remoteSummary });
    const blockers = collectRemoteSetupBlockers(summary, remoteSummary).blockers;

    expect(readiness.currentStepId).toBe("local-readiness");
    expect(blockers.some((blocker) => blocker.id === "missing-github-token-remote")).toBe(
      true,
    );
    expect(blockers.some((blocker) => blocker.id === "harness-repo-access-denied")).toBe(
      true,
    );
  });

  it("advances to remote setup after local readiness is reviewed", () => {
    const summary = completeLocalSummary();
    const remoteSummary = baseRemoteSummary({
      githubTokenConfigured: false,
      harnessRepoAccess: "denied",
    });

    const readiness = deriveFirstRunReadiness({
      summary,
      remoteSummary,
      uiState: { localReadinessReviewed: true },
    });

    expect(readiness.currentStepId).toBe("remote-setup");
  });

  it("keeps local readiness as the current step after local setup files exist", () => {
    const summary = completeLocalSummary();
    const readiness = deriveFirstRunReadiness({
      summary,
      remoteSummary: baseRemoteSummary({ githubTokenConfigured: true }),
    });

    expect(readiness.currentStepId).toBe("local-readiness");
    expect(readiness.localReadinessBlockersCleared).toBe(true);
    expect(readiness.localReadinessReviewed).toBe(false);
  });

  it("blocks step 3 when harness secrets or target workflows are incomplete", () => {
    const summary = completeLocalSummary();
    const remoteSummary = baseRemoteSummary({
      githubTokenConfigured: true,
      harnessRepoAccess: "available",
      harnessSecretStatuses: HARNESS_ACTIONS_SECRET_NAMES.map((name) => ({
        name,
        status: name === "CURSOR_API_KEY" ? "missing" : "present",
      })),
      targetRepos: [
        {
          repoConfigId: "target-app",
          targetRepo: "https://github.com/owner/example-target-app",
          productionBranch: "main",
          repoAccess: "available",
          workflowStatus: "missing",
          harnessDispatchRepo: "owner/harness",
        },
      ],
    });

    const blockers = collectRemoteSetupBlockers(summary, remoteSummary).blockers;
    expect(blockers.some((blocker) => blocker.id.includes("missing-harness-secret"))).toBe(
      true,
    );
    expect(blockers.some((blocker) => blocker.id.includes("target-workflow"))).toBe(
      true,
    );
  });

  it("prioritizes blockers before warnings", () => {
    const summary = completeLocalSummary();
    const remoteSummary = baseRemoteSummary({
      githubTokenConfigured: true,
      harnessRepoAccess: "unknown",
      harnessSecretStatuses: HARNESS_ACTIONS_SECRET_NAMES.map((name) => ({
        name,
        status: "missing",
      })),
      targetRepos: [
        {
          repoConfigId: "target-app",
          targetRepo: "https://github.com/owner/example-target-app",
          productionBranch: "main",
          repoAccess: "available",
          workflowStatus: "present",
          harnessDispatchRepo: "owner/harness",
        },
      ],
    });

    const readiness = deriveFirstRunReadiness({ summary, remoteSummary });
    expect(readiness.highestPriorityBlocker?.blocking).toBe(true);
    expect(readiness.nonBlockingWarnings.length).toBeGreaterThan(0);
    expect(readiness.highestPriorityBlocker?.priority).toBeLessThan(
      readiness.nonBlockingWarnings[0]!.priority,
    );
  });

  it("marks step 4 ready when all prerequisites are complete", () => {
    const summary = completeLocalSummary();
    const remoteSummary = baseRemoteSummary({
      githubTokenConfigured: true,
      harnessRepoAccess: "available",
      harnessSecretStatuses: HARNESS_ACTIONS_SECRET_NAMES.map((name) => ({
        name,
        status: "present",
      })),
      targetRepos: [
        {
          repoConfigId: "target-app",
          targetRepo: "https://github.com/owner/example-target-app",
          productionBranch: "main",
          repoAccess: "available",
          workflowStatus: "present",
          harnessDispatchRepo: "owner/harness",
        },
      ],
    });

    const readiness = deriveFirstRunReadiness({
      summary,
      remoteSummary,
      uiState: { localReadinessReviewed: true },
    });

    expect(readiness.readyForFirstRun).toBe(true);
    expect(readiness.currentStepId).toBe("ready-for-first-run");
    expect(readiness.prohibitedActionsNote).toContain("does not trigger harness phases");
  });

  it("projects missing steps from blocking readiness entries", () => {
    const readiness = deriveFirstRunReadiness({
      summary: baseSummary(),
      remoteSummary: baseRemoteSummary(),
    });

    const missingSteps = projectMissingStepsFromReadiness(readiness);
    expect(missingSteps.length).toBeGreaterThan(0);
    expect(missingSteps.some((step) => step.id === "missing-env-local")).toBe(true);
  });

  it("treats stale local preview as a blocker", () => {
    const summary = completeLocalSummary();
    const readiness = deriveFirstRunReadiness({
      summary,
      remoteSummary: baseRemoteSummary({ githubTokenConfigured: true }),
      uiState: { localPreviewStale: true },
    });

    expect(
      readiness.steps
        .find((step) => step.id === "local-setup")
        ?.blockers.some((blocker) => blocker.id === "local-preview-stale"),
    ).toBe(true);
  });

  it("prioritizes stale smoke repo over generic GitHub access denied", () => {
    const summary = completeLocalSummary();
    const staleSmokeDiagnostics = {
      hasStaleConfig: true,
      findings: [
        {
          kind: "harness-dispatch" as const,
          value: "weston-uribe/pdh-smoke-harness-20260709-191523",
          source: "GITHUB_DISPATCH_REPOSITORY",
        },
      ],
      staleHarnessDispatchRepo: "weston-uribe/pdh-smoke-harness-20260709-191523",
      staleTargetRepos: [],
      suggestedHarnessDispatchRepo:
        "weston-uribe/agentic-product-development-harness",
    };
    const remoteSummary = baseRemoteSummary({
      githubTokenConfigured: true,
      harnessDispatchRepo: "weston-uribe/pdh-smoke-harness-20260709-191523",
      harnessRepoAccess: "denied",
      staleSmokeDiagnostics,
    });

    const readiness = deriveFirstRunReadiness({
      summary,
      remoteSummary,
      staleSmokeDiagnostics,
    });

    expect(readiness.highestPriorityBlocker?.id).toBe("stale-smoke-dispatch-repo");
    expect(readiness.primaryTask?.primaryCtaLabel).toBe("Preview setup files");
    expect(readiness.highestPriorityBlocker?.action).not.toContain(
      "Grant repo and Actions secret permissions",
    );
    expect(readiness.remoteSetupBlockedByUpstream).toBe(true);
    expect(
      readiness.nonBlockingWarnings.some((warning) =>
        warning.id.includes("harness-secret-unknown"),
      ),
    ).toBe(false);
  });

  it("uses actionable copy for non-stale GitHub access denied", () => {
    const summary = completeLocalSummary();
    const remoteSummary = baseRemoteSummary({
      githubTokenConfigured: true,
      harnessDispatchRepo: "owner/harness",
      harnessRepoAccess: "denied",
    });

    const readiness = deriveFirstRunReadiness({ summary, remoteSummary });

    expect(readiness.highestPriorityBlocker?.message).toContain(
      "I tried to check owner/harness and GitHub denied access.",
    );
    expect(readiness.highestPriorityBlocker?.action).toContain(
      "Confirm this is the repo you intend to use",
    );
  });
});
