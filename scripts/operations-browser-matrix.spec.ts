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

async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((nextTheme) => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(nextTheme);
    document.documentElement.style.colorScheme = nextTheme;
  }, theme);
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
      .getByRole("button", { name: /PM Review human gate/i })
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

  test("fast mode renders as a switch and persists", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await resetFixtureDraft(page);

    const workflowRegion = page.getByRole("region", { name: "Workflow", exact: true });
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    await workflowRegion.getByLabel("Model").selectOption("composer-2.5");
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    const fastModeSwitch = workflowRegion.getByRole("switch", { name: "Fast mode" });
    await expect(fastModeSwitch).toBeVisible();
    await fastModeSwitch.click();
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await workflowRegion.getByRole("button", { name: /Ready for Planning/i }).click();
    await expect(workflowRegion.getByRole("switch", { name: "Fast mode" })).toBeVisible();
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

  test("case-only renamed canonical status produces a blocking error", async ({ page }) => {
    await page.goto(
      "/operations?source=fixture&fixture=canonical-case-rename&scope=harness-repo",
    );
    await expect(page.getByText("Blocking configuration error")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Workflow health" })
        .getByText(/Missing canonical status "Ready for Build"/),
    ).toBeVisible();
  });

  test("missing canonical status produces a blocking error", async ({ page }) => {
    await page.goto(
      "/operations?source=fixture&fixture=empty-linear-statuses&scope=harness-repo",
    );
    await expect(page.getByText("Blocking configuration error")).toBeVisible();
    await expect(page.getByText(/Missing canonical status/i).first()).toBeVisible();
  });

  test("wrong-category status produces a blocking error", async ({ page }) => {
    await page.goto(
      "/operations?source=fixture&fixture=canonical-wrong-category&scope=harness-repo",
    );
    await expect(page.getByText("Blocking configuration error")).toBeVisible();
    await expect(page.getByText(/wrong category/i).first()).toBeVisible();
  });

  test("whitespace deviation produces a blocking error", async ({ page }) => {
    await page.goto(
      "/operations?source=fixture&fixture=canonical-whitespace-name&scope=harness-repo",
    );
    await expect(page.getByText("Blocking configuration error")).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "Workflow health" })
        .getByText(/Missing canonical status "Ready for Build"/),
    ).toBeVisible();
  });

  test("Plan Review remains informational and does not block the workflow", async ({ page }) => {
    await page.goto(
      "/operations?source=fixture&fixture=canonical-plan-review-present&scope=harness-repo",
    );
    await expect(page.getByText("Healthy")).toBeVisible();
    await expect(page.getByText("Blocking configuration error")).toHaveCount(0);
    await expect(page.getByText(/Deprecated status "Plan Review"/)).toBeVisible();
    await expect(page.locator(".react-flow__node").filter({ hasText: "Plan Review" })).toHaveCount(0);
  });

  test("connectors cannot be drawn or reconnected and arrowheads are present", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    const edgeMetrics = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll(".react-flow__edge-path"));
      return {
        edgePathCount: paths.length,
        markerEndCount: paths.filter((path) => path.getAttribute("marker-end")).length,
        connectable: document.querySelector(".react-flow")?.classList.contains("connectable") ?? false,
      };
    });
    expect(edgeMetrics.edgePathCount).toBeGreaterThan(0);
    expect(edgeMetrics.markerEndCount).toBeGreaterThan(0);
    expect(edgeMetrics.connectable).toBe(false);
  });

  test("light mode renders workflow health and canvas", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await setTheme(page, "light");
    await expect(page.getByRole("region", { name: "Workflow health" })).toBeVisible();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/canonical-light-mode.png`, fullPage: true });
  });

  test("dark mode renders workflow health and canvas", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await setTheme(page, "dark");
    await expect(page.getByRole("region", { name: "Workflow health" })).toBeVisible();
    await expect(page.locator(".react-flow__node").first()).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/canonical-dark-mode.png`, fullPage: true });
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
