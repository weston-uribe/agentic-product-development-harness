import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("settings navigation and routing", () => {
  it("places overview at /settings inside the console route group", async () => {
    const overviewPage = await readFile(
      path.join(process.cwd(), "apps/gui/app/settings/(console)/page.tsx"),
      "utf8",
    );
    const consoleLayout = await readFile(
      path.join(process.cwd(), "apps/gui/app/settings/(console)/layout.tsx"),
      "utf8",
    );

    expect(overviewPage).toContain("SettingsOverviewPage");
    expect(consoleLayout).toContain("SettingsShell");
    expect(consoleLayout).toContain('redirect(CONFIGURE_ROUTE)');
  });

  it("redirects completed configure sessions to /settings", async () => {
    const configurePage = await readFile(
      path.join(process.cwd(), "apps/gui/app/settings/configure/page.tsx"),
      "utf8",
    );

    expect(configurePage).toContain("migrateExistingCompletedWorkspace");
    expect(configurePage).toContain("redirect(SETTINGS_ROUTE)");
  });

  it("moves data-sharing into the console route group", async () => {
    const dataSharingPage = await readFile(
      path.join(
        process.cwd(),
        "apps/gui/app/settings/(console)/data-sharing/page.tsx",
      ),
      "utf8",
    );

    expect(dataSharingPage).toContain("DataSharingPreferences");
    expect(dataSharingPage).not.toContain("AppShell");
  });

  it("does not auto-run diagnostics on page load", async () => {
    const diagnosticsPage = await readFile(
      path.join(process.cwd(), "apps/gui/app/settings/(console)/diagnostics/page.tsx"),
      "utf8",
    );
    const diagnosticsClient = await readFile(
      path.join(
        process.cwd(),
        "apps/gui/components/settings/settings-diagnostics-client.tsx",
      ),
      "utf8",
    );

    expect(diagnosticsPage).toContain("lastCheckedAt={null}");
    expect(diagnosticsClient).toContain('fetch("/api/settings/diagnostics"');
    expect(diagnosticsClient).not.toContain("useEffect");
  });

  it("uses /settings as the primary settings menu destination", async () => {
    const settingsMenu = await readFile(
      path.join(process.cwd(), "apps/gui/components/custom/settings-menu.tsx"),
      "utf8",
    );

    expect(settingsMenu).toContain('settingsHref = "/settings"');
    expect(settingsMenu).toContain("Settings");
    expect(settingsMenu).toContain("Setup wizard");
  });

  it("shares workflow model save hook for settings models page", async () => {
    const modelsClient = await readFile(
      path.join(
        process.cwd(),
        "apps/gui/components/settings/settings-models-client.tsx",
      ),
      "utf8",
    );
    const workflowAutosave = await readFile(
      path.join(process.cwd(), "apps/gui/lib/workflow/use-model-autosave.ts"),
      "utf8",
    );

    expect(modelsClient).toContain("useModelAutosave");
    expect(workflowAutosave).toContain("useWorkflowModelSave");
  });
});
