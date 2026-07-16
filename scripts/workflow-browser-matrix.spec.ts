import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const screenshotDir = "/tmp/workflow-validation";
const FIXTURE_URL =
  "/workflow?source=fixture&fixture=branching-pr-review&scope=harness-repo";

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
    await expect(page.getByRole("heading", { name: "Workflow", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Workflow health" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Workflow", exact: true })).toBeVisible();
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

    const workflowRegion = page.getByRole("region", { name: "Workflow", exact: true });
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    await expect(workflowRegion.getByText("Planner agent")).toBeVisible();
    await expect(workflowRegion.getByLabel("Model")).toBeVisible();

    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/workflow/models") &&
        response.request().method() === "PUT",
    );
    await workflowRegion.getByLabel("Model").selectOption("composer-2.5");
    const response = await saveResponse;
    expect(response.ok()).toBe(true);
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    const planningPanel = workflowRegion
      .getByRole("button", { name: /Ready for Planning dispatch trigger/i })
      .locator("xpath=following-sibling::*[1]");
    await expect(planningPanel.getByLabel("Model")).toHaveValue("composer-2.5");

    await assertNoDocumentOverflow(page);
  });

  test("fast mode switch persists through production autosave", async ({ page }) => {
    await page.goto(FIXTURE_URL);

    const workflowRegion = page.getByRole("region", { name: "Workflow", exact: true });
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    await workflowRegion.getByLabel("Model").selectOption("composer-2.5");

    const fastModeSwitch = workflowRegion.getByRole("switch", { name: "Fast mode" });
    await expect(fastModeSwitch).toBeVisible();
    await fastModeSwitch.click();
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    await expect(workflowRegion.getByRole("switch", { name: "Fast mode" })).toBeVisible();
  });

  test("branching merge path and healthy fixture state", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await expect(
      page.getByText("Merge path: Ready to Merge → Merging → Merged / Deployed"),
    ).toBeVisible();
    await expect(page.getByText("Healthy")).toBeVisible();
    await expect(page.getByText("Blocking configuration error")).toHaveCount(0);
  });

  test("missing canonical status produces a blocking error", async ({ page }) => {
    await page.goto(
      "/workflow?source=fixture&fixture=empty-linear-statuses&scope=harness-repo",
    );
    await expect(page.getByText("Blocking configuration error")).toBeVisible();
    await expect(page.getByText(/Missing canonical status/i).first()).toBeVisible();
  });

  test("/operations redirects to workflow", async ({ page }) => {
    await page.goto(
      "/operations?source=fixture&fixture=branching-pr-review&scope=harness-repo",
    );
    await expect(page).toHaveURL(/\/workflow/);
    await expect(page.getByRole("heading", { name: "Workflow", level: 1 })).toBeVisible();
  });

  test("light and dark themes render workflow health", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await setTheme(page, "light");
    await expect(page.getByRole("region", { name: "Workflow health" })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/workflow-light-mode.png`, fullPage: true });

    await setTheme(page, "dark");
    await expect(page.getByRole("region", { name: "Workflow health" })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/workflow-dark-mode.png`, fullPage: true });
  });

  test("fixture scopes isolate model selections between repositories", async ({ page }) => {
    await page.goto("/workflow?source=fixture&fixture=branching-pr-review&scope=target-app");
    const workflowRegion = page.getByRole("region", { name: "Workflow", exact: true });
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    await workflowRegion.getByLabel("Model").selectOption("composer-2.5");
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await page.selectOption("#workflow-scope-select", "harness-repo");
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    const planningPanel = workflowRegion
      .getByRole("button", { name: /Ready for Planning dispatch trigger/i })
      .locator("xpath=following-sibling::*[1]");
    await expect(planningPanel.getByLabel("Model")).not.toHaveValue("composer-2.5");
  });

  test("mobile viewport renders without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FIXTURE_URL);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(overflow).toBe(false);
  });
});
