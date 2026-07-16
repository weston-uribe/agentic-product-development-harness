import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const screenshotDir = "/tmp/operations-validation";
const FIXTURE_URL =
  "/operations?source=fixture&fixture=branching-pr-review&scope=harness-repo";

async function resetFixtureDraft(page: Page): Promise<void> {
  page.once("dialog", (dialog) => dialog.accept());
  const resetResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/operations/draft") &&
      response.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "Reset draft" }).first().click();
  const response = await resetResponse;
  expect(response.ok()).toBe(true);
  await expect(page.getByText("Clean")).toBeVisible({ timeout: 20_000 });
}

async function assertNoDocumentOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth > window.innerWidth + 2 ||
      document.documentElement.scrollHeight > window.innerHeight + 2,
  );
  expect(overflow).toBe(false);
}

test.describe("operations browser matrix", () => {
  test.beforeAll(() => {
    mkdirSync(screenshotDir, { recursive: true });
  });

  test("canonical graph visible on first load without builder controls", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(FIXTURE_URL);
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    await expect(page.getByText("Draft — Changes are not active.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Workflow health" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Workflow", exact: true })).toBeVisible();
    await expect(page.getByText("Inspector")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add", exact: true })).toHaveCount(0);
    await expect(page.getByText("PR Review Agent")).toHaveCount(0);
    await expect(page.getByText("Engineering Review").first()).toBeVisible();
    await expect(page.locator(".react-flow__node").filter({ hasText: "Ready for Planning" })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/canonical-desktop.png`, fullPage: true });
    expect(consoleErrors).toEqual([]);
  });

  test("workflow cards, model controls, and persistence", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FIXTURE_URL);
    await resetFixtureDraft(page);

    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    await expect(page.getByText("Draft — Changes are not active.")).toBeVisible();

    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(page.getByRole("complementary")).toBeHidden();
    await page.getByRole("button", { name: "Show sidebar" }).click();
    await expect(page.getByRole("complementary")).toBeVisible();

    const workflowRegion = page.getByRole("region", { name: "Workflow", exact: true });
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    await expect(workflowRegion.getByText("Planner agent")).toBeVisible();
    await expect(workflowRegion.getByLabel("Model")).toBeVisible();
    await workflowRegion.getByLabel("Model").selectOption("composer-2.5");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    await workflowRegion.getByRole("button", { name: /PM Review/i }).click();
    const pmReviewPanel = workflowRegion
      .getByRole("button", { name: /PM Review transitional/i })
      .locator("xpath=following-sibling::*[1]");
    await expect(pmReviewPanel.getByText("Human destinations:")).toBeVisible();
    await expect(pmReviewPanel.getByLabel("Model")).toHaveCount(0);

    await workflowRegion.getByRole("button", { name: /Engineering Review/i }).click();
    const engReviewPanel = workflowRegion
      .getByRole("button", { name: /Engineering Review human gate/i })
      .locator("xpath=following-sibling::*[1]");
    await expect(engReviewPanel.getByText("Actor: Human gate")).toBeVisible();
    await expect(engReviewPanel.getByLabel("Model")).toHaveCount(0);

    await page.locator(".react-flow__node").filter({ hasText: "Ready for Build" }).click();
    await expect(workflowRegion.getByRole("button", { name: /Ready for Build/i })).toBeVisible();

    await page.getByRole("button", { name: "Undo" }).click();
    await page.getByRole("button", { name: "Redo" }).click();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByText("Clean")).toBeVisible({ timeout: 20_000 });
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    const planningPanel = workflowRegion
      .getByRole("button", { name: /Ready for Planning dispatch trigger/i })
      .locator("xpath=following-sibling::*[1]");
    await expect(planningPanel.getByLabel("Model")).toHaveValue("composer-2.5");

    await assertNoDocumentOverflow(page);
    await page.screenshot({
      path: `${screenshotDir}/canonical-workflow-1440x900.png`,
      fullPage: true,
    });
  });

  test("branching merge path and healthy fixture state", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await resetFixtureDraft(page);
    await expect(
      page.getByText("Merge path: Ready to Merge → Merging → Merged / Deployed"),
    ).toBeVisible();
    await expect(page.getByText("Healthy")).toBeVisible();
    await expect(page.getByText("Blocking configuration error")).toHaveCount(0);
  });

  test("fixture scopes isolate drafts between repositories", async ({ page }) => {
    await page.goto("/operations?source=fixture&fixture=branching-pr-review&scope=target-app");
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    const workflowRegion = page.getByRole("region", { name: "Workflow", exact: true });
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    await workflowRegion.getByLabel("Model").selectOption("composer-2.5");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.selectOption("#operations-scope-select", "harness-repo");
    await expect(page.getByText("Clean")).toBeVisible({ timeout: 20_000 });
  });

  test("desktop viewport has no document overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FIXTURE_URL);
    await assertNoDocumentOverflow(page);
    await page.screenshot({ path: `${screenshotDir}/branching-1440x900.png`, fullPage: true });
  });

  test("mobile viewport renders without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FIXTURE_URL);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${screenshotDir}/branching-mobile.png`, fullPage: true });
  });

  test("100-node fixture loads canonical graph within reasonable limits", async ({ page }) => {
    const started = Date.now();
    await page.goto("/operations?source=fixture&fixture=hundred-node-performance&scope=target-app");
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible({
      timeout: 20_000,
    });
    expect(Date.now() - started).toBeLessThan(20_000);
    await page.screenshot({ path: `${screenshotDir}/hundred-node.png`, fullPage: true });
  });
});
