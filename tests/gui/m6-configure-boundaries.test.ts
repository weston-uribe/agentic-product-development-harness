import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const M6_GUI_COMPONENTS = [
  "apps/gui/components/custom/configure-experience.tsx",
  "apps/gui/components/custom/first-run-stepper.tsx",
  "apps/gui/components/custom/readiness-banner.tsx",
  "apps/gui/components/custom/setup-dashboard.tsx",
  "apps/gui/components/custom/setup-readonly-sections.tsx",
  "apps/gui/components/custom/configure-workflow.tsx",
  "apps/gui/components/custom/environment-config-form.tsx",
  "apps/gui/components/custom/target-repo-config-form.tsx",
  "apps/gui/components/custom/remote-setup-section.tsx",
  "apps/gui/components/custom/primary-setup-task-card.tsx",
  "apps/gui/components/custom/guided-local-readiness-card.tsx",
  "apps/gui/components/custom/guided-remote-setup-panel.tsx",
];

const FORBIDDEN_STORAGE_PATTERNS = [
  /localStorage/,
  /sessionStorage/,
  /indexedDB/i,
  /document\.cookie/,
];

const FORBIDDEN_RUN_TRIGGERS = [
  /harness:run/i,
  /Run first issue/i,
  /Trigger harness phase/i,
  /repository_dispatch/i,
];

describe("M6 configure GUI boundaries", () => {
  for (const relativePath of M6_GUI_COMPONENTS) {
    it(`${relativePath} does not persist secrets in browser storage`, () => {
      const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
      for (const pattern of FORBIDDEN_STORAGE_PATTERNS) {
        expect(source).not.toMatch(pattern);
      }
    });
  }

  it("guided configure experience does not expose live harness run triggers", () => {
    const source = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-experience.tsx"),
      "utf8",
    );

    for (const pattern of FORBIDDEN_RUN_TRIGGERS) {
      expect(source).not.toMatch(pattern);
    }
    expect(source).toContain("prohibitedActionsNote");
    expect(source).toContain("No live harness phase is available in M6");
    expect(source).toContain('useState<ConfigureMode>("guided")');
    expect(source).toContain("GuidedLocalReadinessCard");
    expect(source).toContain("GuidedRemoteSetupPanel");
    expect(source).toContain("remoteSetupBlockedByUpstream");
    expect(source).not.toContain("PrimarySetupTaskCard");
  });

  it("configure experience uses stable guarded UI-state handlers", () => {
    const source = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-experience.tsx"),
      "utf8",
    );

    expect(source).toContain("useCallback");
    expect(source).toContain("handleLocalUiStateChange");
    expect(source).toContain("handleRemoteUiStateChange");
    expect(source).toContain("onUiStateChange={handleLocalUiStateChange}");
    expect(source).toContain("onUiStateChange={handleRemoteUiStateChange}");
    expect(source).toContain("onLocalUiStateChange={handleLocalUiStateChange}");
    expect(source).toContain("onRemoteUiStateChange={handleRemoteUiStateChange}");
    expect(source).toContain("current.localPreviewStale === state.localPreviewStale");
    expect(source).toContain(
      "current.remoteSecretPreviewStale === state.remoteSecretPreviewStale",
    );
    expect(source).not.toMatch(
      /onLocalUiStateChange=\{\(state\) =>\s*\n?\s*setUiState/,
    );
    expect(source).not.toMatch(
      /onRemoteUiStateChange=\{\(state\) =>\s*\n?\s*setUiState/,
    );
    expect(source).not.toMatch(
      /onUiStateChange=\{\(state\) =>\s*\n?\s*setUiState/,
    );
  });

  it("first-run stepper follows readiness current step changes", () => {
    const source = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/first-run-stepper.tsx"),
      "utf8",
    );

    expect(source).toContain("useEffect");
    expect(source).toContain("setExpandedStepId(readiness.currentStepId)");
    expect(source).toContain("[readiness.currentStepId]");
  });

  it("guided configure experience hides readiness diagnostics by default", () => {
    const source = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-experience.tsx"),
      "utf8",
    );

    expect(source).toContain('mode === "advanced" ? <ReadinessBanner');
    expect(source).toContain('mode="guided"');
    expect(source).toContain("switch (readiness.currentStepId)");
    expect(source).toContain('case "local-readiness":');
    expect(source).toContain('mode === "advanced" ? (');
    expect(source).toContain("justify-between");
    expect(source).not.toContain("PrimarySetupTaskCard");
    expect(source).not.toMatch(
      /mode === "guided"[\s\S]*?Not configured yet/,
    );
  });

  it("guided workflow renders one active step with animated transitions", () => {
    const workflowSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-workflow.tsx"),
      "utf8",
    );
    const transitionSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-step-transition.tsx",
      ),
      "utf8",
    );

    expect(workflowSource).toContain("GuidedStepTransition");
    expect(workflowSource).toContain("stepKey={guidedStep}");
    expect(workflowSource).toContain("Back to service keys");
    expect(workflowSource).not.toContain("Back to target repo");
    expect(workflowSource).not.toContain(
      "Service keys are ready. You can go back to edit them.",
    );
    expect(workflowSource).not.toContain(
      "Target repo is set. You can go back to change it before applying.",
    );
    expect(transitionSource).toContain("AnimatePresence");
    expect(transitionSource).toContain("useReducedMotion");
  });

  it("guided workflow hides advanced fields from default view", () => {
    const workflowSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-workflow.tsx"),
      "utf8",
    );
    const envSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/environment-config-form.tsx"),
      "utf8",
    );
    const targetSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/target-repo-config-form.tsx"),
      "utf8",
    );

    expect(workflowSource).toContain('variant="guided-services"');
    expect(workflowSource).toContain('variant="guided-minimal"');
    expect(workflowSource).toContain("Step 1 of 4");
    expect(workflowSource).toContain("Step 2 of 4");
    expect(workflowSource).toContain("Create local setup files");
    expect(workflowSource).toContain("Review generated files");
    expect(workflowSource).toContain("/api/setup/verify-service");
    expect(workflowSource).toContain("/api/setup/verify-target-repo");
    expect(workflowSource).not.toContain("Step 3 of 3");
    expect(workflowSource).not.toContain(
      "Review and create local setup files",
    );
    expect(envSource).toContain('variant === "guided-services"');
    const guidedEnvBlock = envSource.match(
      /if \(variant === "guided-services"\) \{([\s\S]*?)\n  \}/,
    )?.[1];
    expect(guidedEnvBlock).toBeDefined();
    expect(guidedEnvBlock).not.toContain("GITHUB_DISPATCH_REPOSITORY");
    expect(guidedEnvBlock).toContain("ServiceConnectionCard");
    expect(guidedEnvBlock).toContain("space-y-4");
    expect(targetSource).toContain('variant === "guided-minimal"');
    const guidedTargetBlock = targetSource.match(
      /if \(variant === "guided-minimal"\) \{([\s\S]*?)\n  \}/,
    )?.[1];
    expect(guidedTargetBlock).toBeDefined();
    expect(guidedTargetBlock).not.toContain("Model ID");
    expect(guidedTargetBlock).not.toContain("Repo config ID");
    expect(guidedTargetBlock).not.toContain("Validation commands");
    expect(guidedTargetBlock).toContain("Add additional repo");
  });

  it("checkbox component uses pointer cursor when enabled", () => {
    const checkboxSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/ui/checkbox.tsx"),
      "utf8",
    );

    expect(checkboxSource).toContain("cursor-pointer");
    expect(checkboxSource).toContain("disabled:cursor-not-allowed");
  });

  it("verification API routes are read-only and do not log secrets", () => {
    const verifyServiceSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/app/api/setup/verify-service/route.ts",
      ),
      "utf8",
    );
    const verifyRepoSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/app/api/setup/verify-target-repo/route.ts",
      ),
      "utf8",
    );

    for (const source of [verifyServiceSource, verifyRepoSource]) {
      expect(source).toContain('export const dynamic = "force-dynamic"');
      expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);
      expect(source).not.toMatch(/localStorage|sessionStorage/);
    }
  });

  it("local and remote workflows preserve confirmation gates", () => {
    const localSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-workflow.tsx"),
      "utf8",
    );
    const remoteSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/remote-setup-section.tsx"),
      "utf8",
    );

    expect(localSource).toContain("LocalWriteConfirmation");
    expect(localSource).toContain("confirmed: true");
    expect(localSource).toContain("fingerprint: preview.fingerprint");
    expect(localSource).toContain("disabledReason");
    expect(remoteSource).toContain("RemoteActionConfirmation");
    expect(remoteSource).toContain("confirmed: true");
    expect(remoteSource).toContain("fingerprint: preview.fingerprint");
    expect(remoteSource).toContain("disabledReason");
    expect(remoteSource).toContain("blockedByUpstream");
  });

  it("guided workflow uses exact-value verification, stable repo row ids, and scroll reset", () => {
    const workflowSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-workflow.tsx"),
      "utf8",
    );
    const envSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/environment-config-form.tsx"),
      "utf8",
    );
    const targetSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/target-repo-config-form.tsx"),
      "utf8",
    );

    expect(workflowSource).toContain("guidedTopRef");
    expect(workflowSource).toContain("goToGuidedStep");
    expect(workflowSource).toContain("scrollIntoView");
    expect(workflowSource).toContain("guidedRepoRows");
    expect(workflowSource).toContain("resetRepoVerificationIfUrlChanged");
    expect(workflowSource).toContain("canCreateSetupFiles");
    expect(workflowSource).toContain("ReviewGeneratedFilesDisclosure");
    expect(workflowSource).toContain("handlePreviewDisclosureOpenChange");
    expect(workflowSource).not.toContain("setRepoVerification({})");
    expect(workflowSource).toContain("disabledReason={guidedConfirmDisabledReason}");

    expect(envSource).toContain("verifiedValueFingerprint");
    expect(envSource).toContain('"Verified"');
    expect(envSource).toContain("ServiceIcon");
    expect(envSource).toContain("ConnectedStatusMessage");

    expect(targetSource).toContain("rowId");
    expect(targetSource).toContain("RepoIcon");
    expect(targetSource).toContain("verifiedTargetRepo");
    expect(targetSource).toContain('"Verified"');
  });

  it("review disclosure auto-generates preview with loading treatment", () => {
    const disclosureSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/review-generated-files-disclosure.tsx",
      ),
      "utf8",
    );
    const previewSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/local-write-preview.tsx"),
      "utf8",
    );
    const confirmationSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/local-write-confirmation.tsx"),
      "utf8",
    );

    expect(disclosureSource).toContain("Generating redacted local file changes");
    expect(disclosureSource).toContain("Skeleton");
    expect(disclosureSource).toContain('variant="guided"');
    expect(disclosureSource).toContain("previewError");
    expect(disclosureSource).toContain("event.preventDefault()");
    expect(disclosureSource).not.toContain("onToggle");
    expect(previewSource).toContain('variant === "guided"');
    expect(confirmationSource).not.toMatch(
      /variant === "guided"[\s\S]*Generate a preview before you can confirm this write/,
    );
  });

  it("guided preview flow keeps local setup workflow mounted and step state in parent", () => {
    const experienceSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-experience.tsx"),
      "utf8",
    );
    const workflowSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-workflow.tsx"),
      "utf8",
    );

    expect(experienceSource).toContain("guidedWorkflowStep");
    expect(experienceSource).toContain('key="guided-local-setup-workflow"');
    expect(experienceSource).toContain("onGuidedStepChange={setGuidedWorkflowStep}");
    expect(experienceSource).toContain("guidedStep={guidedWorkflowStep}");
    expect(experienceSource).toContain('case "local-setup":');
    expect(experienceSource).not.toContain("guidedLocalSetupActive");
    expect(experienceSource).toContain("GuidedLocalReadinessCard");
    expect(experienceSource).toContain("localReadinessReviewed");
    expect(workflowSource).toContain("previewError");
    expect(workflowSource).toContain("setPreviewError");
    expect(workflowSource).toMatch(
      /const handlePreview = useCallback\(async \(\) => \{[\s\S]*?setPreviewError\(null\)/,
    );
    expect(workflowSource).toContain("guidedStepProp");
    expect(workflowSource).toContain("onGuidedStepChange");
    expect(workflowSource).not.toContain("onGuidedLocalSetupComplete");
  });

  it("guided local readiness does not render PrimarySetupTaskCard", () => {
    const experienceSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-experience.tsx"),
      "utf8",
    );
    const readinessCardSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-local-readiness-card.tsx",
      ),
      "utf8",
    );

    expect(experienceSource).not.toContain("PrimarySetupTaskCard");
    expect(experienceSource).toContain('case "local-readiness":');
    expect(experienceSource).toContain("<GuidedLocalReadinessCard");
    expect(readinessCardSource).toContain("Step 3 of ${GUIDED_STEP_COUNT} · Check local readiness");
    expect(readinessCardSource).not.toContain("Target workflow differs");
    expect(readinessCardSource).not.toContain("I need this from you now");
  });

  it("remote setup blockers stay on Step 4 guided panel only", () => {
    const experienceSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-experience.tsx"),
      "utf8",
    );
    const remotePanelSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-remote-setup-panel.tsx",
      ),
      "utf8",
    );
    const readinessCardSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-local-readiness-card.tsx",
      ),
      "utf8",
    );

    expect(experienceSource).toContain('case "remote-setup":');
    expect(experienceSource).toContain("<GuidedRemoteSetupPanel");
    expect(remotePanelSource).toContain("Step 4 of ${GUIDED_STEP_COUNT} · Connect remote setup");
    expect(remotePanelSource).toContain("RemoteSetupSection");
    expect(readinessCardSource).not.toContain("RemoteSetupSection");
    expect(readinessCardSource).not.toContain("TargetWorkflowPrCard");
  });

  it("Continue to remote setup appears only when local readiness is clear", () => {
    const readinessCardSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-local-readiness-card.tsx",
      ),
      "utf8",
    );

    expect(readinessCardSource).toContain("localReadinessBlockersCleared");
    expect(readinessCardSource).toContain("localReadinessReviewed");
    expect(readinessCardSource).toContain("Continue to remote setup");
    expect(readinessCardSource).toContain("/api/setup/summary");
  });

  it("guided local setup renders only for local-setup readiness step", () => {
    const experienceSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-experience.tsx"),
      "utf8",
    );

    expect(experienceSource).toContain('case "local-setup":');
    expect(experienceSource).toContain('case "local-readiness":');
    expect(experienceSource).not.toMatch(
      /guidedLocalSetupActive[\s\S]*readiness\.currentStepId === "local-setup"/,
    );
  });

  it("back to guided flow does not force local setup wizard state", () => {
    const experienceSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-experience.tsx"),
      "utf8",
    );

    expect(experienceSource).toContain('onClick={() => setMode("guided")}');
    expect(experienceSource).not.toContain("setGuidedLocalSetupActive(true)");
    expect(experienceSource).not.toContain("guidedLocalSetupActive");
  });

  it("guided local readiness panel appears after local setup completes", () => {
    const experienceSource = readFileSync(
      path.join(repoRoot, "apps/gui/components/custom/configure-experience.tsx"),
      "utf8",
    );
    const readinessCardSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-local-readiness-card.tsx",
      ),
      "utf8",
    );

    expect(readinessCardSource).toContain(
      "Local setup files were created. Now we'll check whether this machine is ready to run the harness.",
    );
    expect(readinessCardSource).toContain("<DoctorChecklist checks={summary.doctor.checks} />");
    expect(experienceSource).toContain("switch (readiness.currentStepId)");
    expect(experienceSource).not.toContain("readiness.primaryTask?.stepId");
    expect(experienceSource).not.toContain("PrimarySetupTaskCard");
  });
});
