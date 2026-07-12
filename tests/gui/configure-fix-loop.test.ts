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
});
