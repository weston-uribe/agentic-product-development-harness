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

  it("Step 3 loads Vercel bridge options and derived bridge metadata", () => {
    const source = readFileSync(
      path.join(
        repoRoot,
        "apps/gui/components/custom/guided-vercel-bridge-card.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("/api/setup/vercel-bridge-options");
    expect(source).toContain("data.scopes");
    expect(source).toContain("Complete Step 2 to derive the Linear team key");
    expect(source).toContain("manualCopySecret");
    expect(source).toContain("showGithubDispatchOverride");
    expect(source).toMatch(/\{!verifiedSuccess \?/);
    expect(source).toMatch(/\{bridgeReady \|\| verifiedSuccess \?/);
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
