import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";

const screenshotDir = "/tmp/operations-validation";

test.describe("operations browser matrix", () => {
  test.beforeAll(() => {
    mkdirSync(screenshotDir, { recursive: true });
  });

  test("branching fixture opens with connected PR Review graph", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/operations?source=fixture&fixture=branching-pr-review&scope=harness-repo");
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
    await expect(page.getByText("Draft — Changes are not active.")).toBeVisible();
    await expect(page.getByText("PR Review Agent").first()).toBeVisible();
    await expect(page.getByText("Engineering Review").first()).toBeVisible();
    await expect(page.getByText("Fixture:")).toHaveCount(0);
    await expect(page.getByText(/coming later/i)).toHaveCount(0);
    await page.screenshot({ path: `${screenshotDir}/branching-desktop.png`, fullPage: true });

    await page.getByRole("button", { name: "Fit view" }).first().click();
    await page.waitForTimeout(800);

    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).first().click();
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
    await expect(page.getByText("Clean")).toBeVisible({ timeout: 20_000 });

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

    expect(consoleErrors).toEqual([]);
  });

  test("fixture scopes isolate drafts between repositories", async ({ page }) => {
    await page.goto("/operations?source=fixture&fixture=branching-pr-review&scope=target-app");
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await expect(page.getByText("Unsaved changes")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.selectOption("#operations-scope-select", "harness-repo");
    await expect(page.getByText("Clean")).toBeVisible({ timeout: 20_000 });

    await page.selectOption("#operations-scope-select", "target-app");
    await expect(page.getByText("Clean")).toBeVisible({ timeout: 20_000 });
  });

  test("desktop viewport has no document overflow", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/operations?source=fixture&fixture=branching-pr-review&scope=harness-repo");
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth > window.innerWidth + 2 ||
        document.documentElement.scrollHeight > window.innerHeight + 2,
    );
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${screenshotDir}/branching-1440x900.png`, fullPage: true });
  });

  test("mobile viewport renders without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/operations?source=fixture&fixture=branching-pr-review&scope=harness-repo");
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${screenshotDir}/branching-mobile.png`, fullPage: true });
  });

  test("100-node fixture loads without obvious lag", async ({ page }) => {
    const started = Date.now();
    await page.goto("/operations?source=fixture&fixture=hundred-node-performance&scope=target-app");
    await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible({ timeout: 20_000 });
    expect(Date.now() - started).toBeLessThan(20_000);
    await page.screenshot({ path: `${screenshotDir}/hundred-node.png`, fullPage: true });
  });
});
