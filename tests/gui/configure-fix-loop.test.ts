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
    expect(source).toContain(
      "Choose the Vercel project this setup should use for automation and",
    );
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
});
