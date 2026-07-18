import { mkdirSync } from "node:fs";
import { test, expect, type Page, type Request } from "@playwright/test";

const screenshotDir = "/tmp/workflow-validation";
const FIXTURE_QUERY =
  "source=fixture&fixture=branching-pr-review&scope=harness-repo";
const FIXTURE_URL = `/workflow?${FIXTURE_QUERY}`;
/**
 * Distinct fixture id so Chunk 2 Fast defaults use a separate in-memory
 * roleModels key (fixtureId::scopeId) from other matrix tests.
 */
const CHUNK2_QUERY =
  "source=fixture&fixture=basic-current-workflow&scope=harness-repo";
const CHUNK2_WORKFLOW_URL = `/workflow?${CHUNK2_QUERY}`;
const CHUNK2_SETTINGS_URL = `/settings/models?${CHUNK2_QUERY}`;

async function expandStatus(page: Page, statusName: string): Promise<void> {
  const button = page.getByRole("button", { name: new RegExp(`^${statusName}\\s`) });
  if ((await button.getAttribute("aria-expanded")) === "false") {
    await button.click();
  }
}

async function assertNoDocumentOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth > window.innerWidth + 2 ||
      document.documentElement.scrollHeight > window.innerHeight + 2,
  );
  expect(overflow).toBe(false);
}

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((nextTheme) => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
  }, theme);
}

function plannerCard(page: Page) {
  return page
    .locator("div.rounded-md.border")
    .filter({ has: page.getByText("Planner model", { exact: true }) })
    .first();
}

function plannerFastSwitch(page: Page) {
  return plannerCard(page).getByRole("switch", { name: "Fast mode" });
}

function plannerModelSelect(page: Page) {
  return plannerCard(page).locator("select");
}

test.describe("workflow browser matrix", () => {
  test.beforeAll(() => {
    mkdirSync(screenshotDir, { recursive: true });
  });

  test("workflow page renders cards-only UI on first load", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(FIXTURE_URL);
    await expect(page.locator("body")).toHaveAttribute(
      "data-p-dev-runtime-smoke",
      "1",
    );
    await expect(page.getByRole("heading", { name: "Workflow", level: 1 })).toBeVisible();
    // Healthy fixtures hide the attention panel (returns null).
    await expect(page.getByRole("region", { name: "Workflow health" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Human-owned" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Harness-owned" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Agent-owned" })).toBeVisible();
    await expect(page.getByText("Draft — Changes are not active.")).toHaveCount(0);
    await expect(page.getByText("Inspector")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
    await expect(page.getByText("Engineering Review").first()).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/workflow-desktop.png`, fullPage: true });
    expect(consoleErrors).toEqual([]);
  });

  test("workflow cards expose model controls and autosave", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FIXTURE_URL);

    await expandStatus(page, "Planning");
    await expect(page.getByText("Planner model")).toBeVisible();

    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/workflow/models") &&
        response.request().method() === "PUT",
    );
    await page.getByRole("switch", { name: "Fast mode" }).first().click();
    const response = await saveResponse;
    expect(response.ok()).toBe(true);
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await assertNoDocumentOverflow(page);
  });

  test("fast mode switch triggers production autosave", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await expandStatus(page, "Planning");

    const fastSwitch = page.getByRole("switch", { name: "Fast mode" }).first();
    await fastSwitch.click();
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Couldn't save")).toHaveCount(0);
  });

  test("branching merge path fixture is healthy", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await expect(page.getByRole("heading", { name: "Workflow", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Workflow health" })).toHaveCount(0);
    await expect(page.getByText("Needs attention")).toHaveCount(0);
  });

  test("missing canonical status surfaces workflow health attention", async ({ page }) => {
    await page.goto(
      "/workflow?source=fixture&fixture=empty-linear-statuses&scope=harness-repo",
    );
    await expect(page.getByText("Workflow health: Needs attention")).toBeVisible();
    await expect(page.getByLabel("Needs attention").first()).toBeVisible();
  });

  test("/operations redirects to workflow", async ({ page }) => {
    await page.goto(
      "/operations?source=fixture&fixture=branching-pr-review&scope=harness-repo",
    );
    await expect(page).toHaveURL(/\/workflow/);
    await expect(page.getByRole("heading", { name: "Workflow", level: 1 })).toBeVisible();
  });

  test("light and dark themes render primary workflow regions", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await setTheme(page, "light");
    await expect(page.getByRole("region", { name: "Agent-owned" })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/workflow-light-mode.png`, fullPage: true });

    await setTheme(page, "dark");
    await expect(page.getByRole("region", { name: "Agent-owned" })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/workflow-dark-mode.png`, fullPage: true });
  });

  test("fixture scopes isolate model selections between repositories", async ({ page }) => {
    await page.goto("/workflow?source=fixture&fixture=branching-pr-review&scope=target-app");
    await expandStatus(page, "Planning");
    const targetSwitch = page.getByRole("switch", { name: "Fast mode" }).first();
    if (!(await targetSwitch.isChecked())) {
      await targetSwitch.click();
      await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });
    }

    await page.selectOption("#workflow-scope-select", "harness-repo");
    await page.waitForResponse((response) =>
      response.url().includes("/api/workflow/bootstrap"),
    );
    await expandStatus(page, "Planning");
    await expect(page.getByRole("switch", { name: "Fast mode" }).first()).toBeVisible();
  });

  test("mobile viewport renders primary workflow content", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FIXTURE_URL);
    await expect(page.getByRole("heading", { name: "Workflow", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Agent-owned" })).toBeVisible();
  });

  test("settings menu exposes console entry from workflow", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings\//);
  });
});

test.describe("Chunk 2 Fast-mode browser acceptance", () => {
  test("Composer Fast toggle, defaults, persistence, Settings parity, and model switch", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedApi: string[] = [];
    const modelPuts: Request[] = [];
    const analyticsPosts: string[] = [];
    const posthogRequests: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("request", (request) => {
      const url = request.url();
      if (
        request.method() === "PUT" &&
        url.includes("/api/workflow/models")
      ) {
        modelPuts.push(request);
      }
      if (
        request.method() === "POST" &&
        url.includes("/api/observability/event")
      ) {
        analyticsPosts.push(request.postData() ?? "");
      }
      if (/posthog|i\.posthog\.com|eu\.i\.posthog\.com/i.test(url)) {
        posthogRequests.push(url);
      }
    });
    page.on("response", (response) => {
      const url = response.url();
      if (
        url.includes("/api/") &&
        response.status() >= 400 &&
        !url.includes("/api/observability/")
      ) {
        failedApi.push(`${response.status()} ${response.request().method()} ${url}`);
      }
    });

    // --- Opening Workflow must not write configuration ---
    const putsBeforeInteraction = modelPuts.length;
    await page.goto(CHUNK2_WORKFLOW_URL);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toHaveAttribute(
      "data-p-dev-runtime-smoke",
      "1",
    );
    await expect(page.getByRole("heading", { name: "Workflow", level: 1 })).toBeVisible();
    expect(modelPuts.length).toBe(putsBeforeInteraction);

    await expandStatus(page, "Planning");
    await expect(page.getByText("Planner model")).toBeVisible();

    // Composer selected → Fast toggle + Standard default + pricing hint
    await expect(plannerModelSelect(page)).toHaveValue("composer-2.5");
    const fastSwitch = plannerFastSwitch(page);
    await expect(fastSwitch).toBeVisible();
    await expect(fastSwitch).not.toBeChecked();
    await expect(
      plannerCard(page).getByTestId("model-variant-summary"),
    ).toHaveText("Composer 2.5 · Standard");
    await expect(
      plannerCard(page).getByTestId("model-pricing-hint"),
    ).toContainText("Standard:");
    await expect(
      plannerCard(page).getByTestId("model-pricing-hint"),
    ).toContainText("$0.50");

    // Enable Fast → immediate save
    const enableSave = page.waitForResponse(
      (response) =>
        response.url().includes("/api/workflow/models") &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    await fastSwitch.click();
    const enableResponse = await enableSave;
    const enableBody = enableResponse.request().postDataJSON() as {
      modelId: string;
      params: Array<{ id: string; value: string }>;
      role: string;
    };
    expect(enableBody.modelId).toBe("composer-2.5");
    expect(enableBody.params).toEqual(
      expect.arrayContaining([{ id: "fast", value: "true" }]),
    );
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });
    await expect(fastSwitch).toBeChecked();
    await expect(
      plannerCard(page).getByTestId("model-variant-summary"),
    ).toHaveText("Composer 2.5 · Fast");
    await expect(
      plannerCard(page).getByTestId("model-pricing-hint"),
    ).toContainText("Fast:");
    await expect(
      plannerCard(page).getByTestId("model-pricing-hint"),
    ).toContainText("$3.00");

    // Refresh preserves Fast
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expandStatus(page, "Planning");
    await expect(plannerFastSwitch(page)).toBeChecked();
    await expect(
      plannerCard(page).getByTestId("model-variant-summary"),
    ).toHaveText("Composer 2.5 · Fast");

    // Settings shows the same saved Fast value (fixture query parity)
    await page.goto(CHUNK2_SETTINGS_URL);
    await page.waitForLoadState("networkidle");
    // Opening Settings must not write
    const putsBeforeSettingsInteraction = modelPuts.length;
    await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();
    expect(modelPuts.length).toBe(putsBeforeSettingsInteraction);
    const settingsPlanner = page
      .locator("div.rounded-md.border")
      .filter({ has: page.getByText("Planner model", { exact: true }) })
      .first();
    await expect(
      settingsPlanner.getByRole("switch", { name: "Fast mode" }),
    ).toBeChecked();
    await expect(
      settingsPlanner.getByTestId("model-variant-summary"),
    ).toHaveText("Composer 2.5 · Fast");

    // Back to Workflow — disable Fast → Standard saved
    await page.goto(CHUNK2_WORKFLOW_URL);
    await expandStatus(page, "Planning");
    const disableSave = page.waitForResponse(
      (response) =>
        response.url().includes("/api/workflow/models") &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    await plannerFastSwitch(page).click();
    const disableResponse = await disableSave;
    const disableBody = disableResponse.request().postDataJSON() as {
      params: Array<{ id: string; value: string }>;
    };
    expect(disableBody.params).toEqual(
      expect.arrayContaining([{ id: "fast", value: "false" }]),
    );
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });
    await expect(plannerFastSwitch(page)).not.toBeChecked();
    await expect(
      plannerCard(page).getByTestId("model-variant-summary"),
    ).toHaveText("Composer 2.5 · Standard");

    // Switch to model without Fast — toggle gone, no unsupported param in PUT
    const switchAwaySave = page.waitForResponse(
      (response) =>
        response.url().includes("/api/workflow/models") &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    await plannerModelSelect(page).selectOption("fixture-no-fast-model");
    const switchAwayResponse = await switchAwaySave;
    const switchAwayBody = switchAwayResponse.request().postDataJSON() as {
      modelId: string;
      params: Array<{ id: string; value: string }>;
    };
    expect(switchAwayBody.modelId).toBe("fixture-no-fast-model");
    expect(
      (switchAwayBody.params ?? []).some((param) => param.id === "fast"),
    ).toBe(false);
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });
    await expect(
      plannerCard(page).getByRole("switch", { name: "Fast mode" }),
    ).toHaveCount(0);

    // Switch back to Composer — harness default Standard is persisted
    const switchBackSave = page.waitForResponse(
      (response) =>
        response.url().includes("/api/workflow/models") &&
        response.request().method() === "PUT" &&
        response.ok(),
    );
    await plannerModelSelect(page).selectOption("composer-2.5");
    const switchBackResponse = await switchBackSave;
    const switchBackBody = switchBackResponse.request().postDataJSON() as {
      modelId: string;
      params: Array<{ id: string; value: string }>;
    };
    expect(switchBackBody.modelId).toBe("composer-2.5");
    expect(switchBackBody.params).toEqual(
      expect.arrayContaining([{ id: "fast", value: "false" }]),
    );
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });
    await expect(plannerFastSwitch(page)).toBeVisible();
    await expect(plannerFastSwitch(page)).not.toBeChecked();
    await expect(
      plannerCard(page).getByTestId("model-variant-summary"),
    ).toHaveText("Composer 2.5 · Standard");

    expect(
      pageErrors.filter((message) => /hydrat/i.test(message)),
      pageErrors.join("\n"),
    ).toEqual([]);
    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
    expect(failedApi, failedApi.join("\n")).toEqual([]);
    // Observability disabled for operator matrix — no PostHog / analytics fan-out.
    expect(posthogRequests).toEqual([]);
    expect(analyticsPosts).toEqual([]);
  });
});
