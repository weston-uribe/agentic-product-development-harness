import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const screenshotDir = "/tmp/workflow-validation";
const FIXTURE_URL =
  "/workflow?source=fixture&fixture=branching-pr-review&scope=harness-repo";

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
    await page.getByRole("switch", { name: "Fast mode" }).click();
    const response = await saveResponse;
    expect(response.ok()).toBe(true);
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await assertNoDocumentOverflow(page);
  });

  test("fast mode switch triggers production autosave", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await expandStatus(page, "Planning");

    const fastSwitch = page.getByRole("switch", { name: "Fast mode" });
    await fastSwitch.click();
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Couldn't save")).toHaveCount(0);
  });

  test("branching merge path fixture is healthy", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await expect(page.getByText("Workflow health: Healthy")).toBeVisible();
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
    await expandStatus(page, "Planning");
    await page.getByRole("switch", { name: "Fast mode" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await page.selectOption("#workflow-scope-select", "harness-repo");
    await page.waitForResponse((response) =>
      response.url().includes("/api/workflow/bootstrap"),
    );
    await expandStatus(page, "Planning");
    await expect(page.getByRole("switch", { name: "Fast mode" })).not.toBeChecked();
  });

  test("mobile viewport renders primary workflow content", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FIXTURE_URL);
    await expect(page.getByRole("heading", { name: "Workflow", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Workflow health" })).toBeVisible();
  });

  test("settings menu exposes data sharing from workflow", async ({ page }) => {
    await page.goto(FIXTURE_URL);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("menuitem", { name: "Data sharing" }).click();
    await expect(page).toHaveURL(/\/settings\/data-sharing$/);
    await expect(page.getByText(/^Data sharing$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
  });
});
