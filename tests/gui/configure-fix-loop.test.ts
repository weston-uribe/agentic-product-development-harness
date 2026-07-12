import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("configure GUI fix loop", () => {
  it("Step 2 removes the workspace-not-applied chip and optional preview gating", () => {
    const source = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-linear-workspace-card.tsx",
      ),
      "utf8",
    );

    expect(source).not.toContain("Workspace not applied yet");
    expect(source).not.toMatch(
      /RemoteActionConfirmation[\s\S]*disabled=\{!previewIsCurrent/,
    );
    expect(source).toMatch(
      /previewIsCurrent && preview \? preview : await runPreview\(\)/,
    );
    expect(source).toMatch(/if \(!apply\.verified\)/);
    expect(source).toMatch(/\{!verifiedSuccess \?/);
    expect(source).toMatch(/\{verifiedSuccess && applyResult \?/);
    expect(source).toMatch(/invalidatePreview\(\)/);
  });

  it("Step 3 uses accurate Vercel settings copy and optional direct apply", () => {
    const source = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-vercel-bridge-card.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("Configure Vercel settings");
    expect(source).not.toContain("Set up Vercel webhook bridge");
    expect(source).not.toContain("Select the harness control-plane");
    expect(source).not.toContain("Vercel scope");
    expect(source).toContain("Vercel team name");
    expect(source).not.toContain(
      "Choose the Vercel project this setup should use for automation and",
    );
    expect(source).toContain("scope=\"vercel-bridge-write\"");
    expect(source).not.toContain("scope=\"remote-secret-write\"");
    expect(source).not.toContain("encrypted GitHub Actions secrets");
    expect(source).not.toMatch(/control plane/i);
    expect(source).not.toMatch(/webhook bridge/i);
    expect(source).not.toContain("/api/linear-webhook");
    expect(source).not.toMatch(/target application repo/i);
    expect(source).not.toMatch(/<p>HARNESS_TEAM_KEY:/);
    expect(source).not.toContain("GitHub dispatch token:");
    expect(source).not.toContain("LINEAR_WEBHOOK_SECRET:");
    expect(source).not.toContain("Bridge not ready");
    expect(source).toContain("Preview Vercel settings");
    expect(source).not.toMatch(
      /RemoteActionConfirmation[\s\S]*disabled=\{!previewIsCurrent/,
    );
    expect(source).not.toMatch(
      /onClick=\{\(\) => void handleApply\(\)\}[\s\S]*!previewIsCurrent/,
    );
    expect(source).not.toContain(
      "I completed any manual webhook steps and accept bridge readiness.",
    );
    expect(source).toContain("Apply Vercel Settings");
    expect(source).not.toContain("Apply Vercel bridge setup");
    expect(source).toMatch(
      /previewIsCurrent && preview \? preview : await runPreview\(\)/,
    );
    expect(source).toContain("Use existing team");
    expect(source).toContain("Create new project");
    expect(source).toContain("deployment-required");
    expect(source).toContain("Deployment status:");
    expect(source).toContain("Applying Vercel settings…");
    expect(source).toContain("Retry verification");
    expect(source).toContain("verifyOnly: true");
    expect(source).toContain("orchestrationSteps");
    expect(source).toContain("buildVercelApplyResultMessage");
    expect(source).toContain("shouldShowRetryVerification");
    expect(source).toContain('productionRedeployStatus === "ready"');
    expect(source).toContain("apply.setupBlocked");
    expect(source).toContain("shouldShowRetryVerification(applyResult)");
    expect(source).toContain("setupPending");
    expect(source).toContain("pollActionId");
    expect(source).toContain("/api/setup/vercel-bridge-redeploy-status");
    expect(source).toContain("readSetupJsonResponse");
    expect(source).toContain("Waiting for production redeploy");
  });

  it("Step 3 confirmation uses Vercel bridge copy", () => {
    const source = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/remote-action-confirmation.tsx",
      ),
      "utf8",
    );

    expect(source).toContain('"vercel-bridge-write"');
    expect(source).toContain("Confirm Vercel settings write");
    const vercelBridgeBlock = source.slice(
      source.indexOf('"vercel-bridge-write":'),
      source.indexOf('"remote-repo-write":'),
    );
    expect(vercelBridgeBlock).not.toContain("encrypted GitHub Actions secrets");
    expect(vercelBridgeBlock).not.toContain("GitHub dispatch");
  });

  it("Step 3 options route exposes scope/project loading without secret values", () => {
    const source = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/app/api/setup/vercel-bridge-options/route.ts",
      ),
      "utf8",
    );

    expect(source).toContain("loadVercelBridgeOptionsRemote");
    expect(source).toContain("loadVercelBridgeProjectsRemote");
    expect(source).not.toContain("GITHUB_TOKEN");
    expect(source).not.toContain("LINEAR_WEBHOOK_SECRET");
  });

  it("Step 4 uses clear copy, optional preview, and correct apply gating", () => {
    const targetSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/target-repo-config-form.tsx",
      ),
      "utf8",
    );
    const workflowSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/configure-workflow.tsx",
      ),
      "utf8",
    );
    const experienceSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/configure-experience.tsx",
      ),
      "utf8",
    );

    const guidedMinimalStart = targetSource.indexOf('if (variant === "guided-minimal")');
    const guidedMinimalEnd = targetSource.indexOf(
      "  const repo = values.repos[0]",
      guidedMinimalStart,
    );
    const guidedMinimalSource = targetSource.slice(
      guidedMinimalStart,
      guidedMinimalEnd,
    );

    expect(guidedMinimalSource).toContain("Update harness repo");
    expect(guidedMinimalSource).toContain("Use this harness repo");
    expect(guidedMinimalSource).toContain("Verify harness repo");
    expect(targetSource).toContain("Detected from git remote");
    expect(targetSource).toContain("Saved in .env.local");
    expect(guidedMinimalSource).toContain("{harnessRepoSource}");
    expect(guidedMinimalSource).not.toContain(
      "This is the GitHub repo for the harness setup",
    );
    expect(guidedMinimalSource).toContain("Copy-paste the main repo URL.");
    expect(guidedMinimalSource).toContain(
      '<ConnectedStatusMessage message="Connected" />',
    );

    expect(workflowSource).toContain("savedHarnessDispatchRepository");
    expect(workflowSource).toContain("suggestedHarnessDispatchRepo ||");
    expect(workflowSource).toContain("/api/setup/verify-harness-repo");
    expect(experienceSource).toMatch(
      /githubDispatchRepository:\s*shouldResetDispatch[\s\S]*formDefaults\.env\.githubDispatchRepository \|\| suggested \|\| ""/,
    );

    const guidedStep4Start = workflowSource.indexOf(
      'case "choose-target-repos":',
    );
    const guidedStep4End = workflowSource.indexOf(
      "            </SectionCard>\n          );",
      guidedStep4Start,
    );
    const guidedStep4Source = workflowSource.slice(
      guidedStep4Start,
      guidedStep4End + "            </SectionCard>\n          );".length,
    );

    expect(guidedStep4Source).toContain("ReviewGeneratedFilesDisclosure");
    expect(guidedStep4Source).toContain(
      "disabled={Boolean(preview?.validationError)}",
    );
    expect(guidedStep4Source).not.toContain("githubTokenSourceHint");
    expect(workflowSource).toContain("servicesPersistedReady");
    expect(workflowSource).toContain("guidedApplyBlockedReason");
    expect(workflowSource).toMatch(
      /previewIsCurrent && preview[\s\S]*\? preview[\s\S]*: await runPreview\(\)/,
    );
    expect(workflowSource).toContain("onGuidedLocalApplySuccess?.()");
  });

  it("Step 6 supports optional preview, manual setup, and verified Continue", () => {
    const source = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-cloud-secrets-card.tsx",
      ),
      "utf8",
    );
    const manualRouteSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/app/api/setup/manual-harness-secret-values/route.ts",
      ),
      "utf8",
    );

    expect(source).toContain("Setup type");
    expect(source).toContain('type="radio"');
    expect(source).toContain('setupType === "automatic"');
    expect(source).toContain('setupType === "manual"');
    expect(source).toContain("deriveStep6ContinueEligibility");
    expect(source).toContain("Step6BlockerPanel");
    expect(source).not.toContain("<dt className=\"text-muted-foreground\">Harness repo</dt>");
    expect(source).not.toContain("<dt className=\"text-muted-foreground\">GitHub access</dt>");
    expect(source).not.toContain(
      "<dt className=\"text-muted-foreground\">Required secrets</dt>",
    );
    expect(source).toContain("Automatic setup");
    expect(source).toContain("Manual setup");
    expect(source).not.toMatch(
      /RemoteActionConfirmation[\s\S]*disabled=\{!previewIsCurrent/,
    );
    expect(source).not.toMatch(
      /onClick=\{\(\) => void handleApply\(\)\}[\s\S]*!previewIsCurrent/,
    );
    expect(source).toMatch(
      /previewIsCurrent && preview \? preview : await runPreview\(\)/,
    );
    expect(source).toContain("Generate manual copy values");
    expect(source).toContain("Verify manual setup");
    expect(source).toContain("Continue to target workflow");
    expect(source).toContain("verifiedAutomaticSuccess");
    expect(source).toContain("verifiedManualSuccess");
    expect(source).toContain("previewStaleCleared");
    expect(source).toContain("remoteSecretPreviewStale: false");
    expect(source).not.toContain("readiness.cloudSecretsBlockersCleared");
    expect(source).toContain("/api/setup/manual-harness-secret-values");
    expect(source).toContain("Copy value");
    expect(source).toContain("Hide values");
    expect(source).toContain("Clear values");
    expect(source).toContain(
      "GitHub does not allow secret values to be read back",
    );
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(manualRouteSource).toContain("confirmedSensitiveReveal");
    expect(manualRouteSource).not.toMatch(/console\.(log|info|debug|warn|error)/);
  });

  it("Step 6 Continue advances to Step 7 target workflow UI", () => {
    const cloudSecretsSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-cloud-secrets-card.tsx",
      ),
      "utf8",
    );
    const experienceSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/configure-experience.tsx",
      ),
      "utf8",
    );
    const targetWorkflowSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-target-workflow-card.tsx",
      ),
      "utf8",
    );

    // before: verified success shows Continue
    expect(cloudSecretsSource).toContain("canContinue");
    expect(cloudSecretsSource).toContain("verifiedAutomaticSuccess");
    expect(cloudSecretsSource).toContain("verifiedManualSuccess");
    expect(cloudSecretsSource).toMatch(
      /\{canContinue \?[\s\S]*Continue to target workflow/,
    );
    expect(cloudSecretsSource).toContain("!readiness.cloudSecretsReviewed");

    // action: clicking Continue calls the parent handler
    expect(cloudSecretsSource).toContain("onClick={onContinue}");
    expect(experienceSource).toContain("handleCloudSecretsReviewed");
    expect(experienceSource).toContain(
      "onContinue={handleCloudSecretsReviewed}",
    );

    // after: handler advances guided display to Step 7
    expect(experienceSource).toContain("GUIDED_DISPLAY_STEP_AFTER_CLOUD_SECRETS");
    const continueHandler = experienceSource.match(
      /const handleCloudSecretsReviewed = useCallback\([\s\S]*?\n  \);/,
    )?.[0];
    expect(continueHandler).toBeDefined();
    expect(continueHandler).toContain("cloudSecretsReviewed: true");
    expect(continueHandler).toContain(
      "setDisplayedGuidedStep(GUIDED_DISPLAY_STEP_AFTER_CLOUD_SECRETS)",
    );
    expect(experienceSource).toMatch(
      /case "target-workflow":[\s\S]*GuidedTargetWorkflowCard/,
    );
    expect(targetWorkflowSource).toContain(
      `Step 7 of \${GUIDED_SETUP_STEP_COUNT}`,
    );

    // Continue must not trigger remote writes or harness phases
    expect(continueHandler).not.toContain("fetch(");
    expect(continueHandler).not.toContain("dispatch");
    expect(continueHandler).not.toMatch(/apply-harness-secrets|delete/i);
  });

  it("Step 7 completion shows setup complete only after readiness is true", () => {
    const experienceSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/configure-experience.tsx",
      ),
      "utf8",
    );
    const targetWorkflowSource = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-target-workflow-card.tsx",
      ),
      "utf8",
    );

    expect(targetWorkflowSource).toContain(
      `Step 7 of \${GUIDED_SETUP_STEP_COUNT} · Install target repo workflow`,
    );

    expect(experienceSource).toContain("handleGuidedWorkflowSetupComplete");
    const workflowCompleteHandler = experienceSource.match(
      /const handleGuidedWorkflowSetupComplete = useCallback\([\s\S]*?\n  \);/,
    )?.[0];
    expect(workflowCompleteHandler).toBeDefined();
    expect(workflowCompleteHandler).not.toContain(
      "setDisplayedGuidedStep(GUIDED_DISPLAY_STEP_AFTER_WORKFLOW_READY)",
    );

    expect(experienceSource).toContain('title="Setup complete"');
    expect(experienceSource).toContain("readiness.readyForFirstRun");
    expect(experienceSource).toContain(
      'displayedGuidedStep === "ready-for-first-run"',
    );
    expect(experienceSource).toContain("defaultGuidedDisplayStep");
    expect(experienceSource).not.toContain("Blocked for first run");
  });
});
