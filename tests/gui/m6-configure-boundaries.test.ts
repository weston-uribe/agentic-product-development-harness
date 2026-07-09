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
  "apps/gui/components/custom/remote-setup-section.tsx",
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
    expect(remoteSource).toContain("RemoteActionConfirmation");
    expect(remoteSource).toContain("confirmed: true");
    expect(remoteSource).toContain("fingerprint: preview.fingerprint");
  });
});
