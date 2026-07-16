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

  test("branching fixture opens with connected PR Review graph", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto(FIXTURE_URL);
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    await expect(page.getByText("Clean")).toBeVisible({ timeout: 20_000 });

    await resetFixtureDraft(page);
    expect(consoleErrors).toEqual([]);
  });

  test("product-owner workflow: Backlog automation, connection editing, persistence", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FIXTURE_URL);
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    await resetFixtureDraft(page);

    const title = page.getByRole("heading", { name: "Operations", level: 1 });
    const notice = page.getByText("Draft — Changes are not active.");
    await expect(title).toBeVisible();
    await expect(notice).toBeVisible();
    const titleBeforeNotice = await title.evaluate((heading, noticeText) => {
      const status = Array.from(document.querySelectorAll("[role='status']")).find(
        (element) => element.textContent?.includes(noticeText),
      );
      return Boolean(status && (heading.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING));
    }, "Draft — Changes are not active.");
    expect(titleBeforeNotice).toBe(true);

    await page.getByRole("button", { name: "Hide sidebar" }).click();
    await expect(page.getByRole("complementary")).toBeHidden();
    await page.getByRole("button", { name: "Show sidebar" }).click();
    await expect(page.getByRole("complementary")).toBeVisible();

    await page
      .getByRole("listitem")
      .filter({ hasText: "Backlog" })
      .getByRole("button", { name: "Add" })
      .click();
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    const inspector = page.getByRole("region", { name: "Inspector" });
    await expect(inspector.getByText("Backlog", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create automation" })).toBeVisible();

    await page.getByRole("button", { name: "Create automation" }).click();
    await expect(inspector.getByText("Automation enabled")).toBeVisible();

    await page
      .locator("select")
      .filter({ has: page.locator('option[value="planner-agent"]') })
      .selectOption("planner-agent");
    await page
      .locator("select")
      .filter({ has: page.locator('option[value="composer-2.5"]') })
      .selectOption("composer-2.5");
    await expect(page.getByRole("switch", { name: "Fast mode" })).toBeVisible();

    await expect(page.getByRole("switch", { name: "Fast mode" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Fast mode" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("switch", { name: "Fast mode" }).click();
    await expect(page.getByRole("switch", { name: "Fast mode" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.getByRole("switch", { name: "Fast mode" }).click();
    await expect(page.getByRole("switch", { name: "Fast mode" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.getByRole("button", { name: "Add outcome" }).click();
    await inspector.locator("ul li").last().locator("select").selectOption({
      label: "Ready for Planning",
    });
    await expect(page.getByRole("group", { name: "Outcome New outcome" })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("group", { name: "Outcome New outcome" })).toHaveCount(0);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByRole("group", { name: "Outcome New outcome" })).toBeVisible();

    await page.getByRole("button", { name: "Fit view", exact: true }).first().click();
    await page.waitForTimeout(500);

    const backlogNode = page.locator(".react-flow__node").filter({ hasText: "Backlog" });
    const blockedNode = page.locator(".react-flow__node").filter({ hasText: "Blocked" });
    await backlogNode.locator("[data-handlepos='bottom']").dragTo(
      blockedNode.locator("[data-handlepos='top']"),
      { force: true },
    );
    await expect(page.getByRole("group", { name: "Outcome Blocked" })).toBeVisible();

    await page.getByRole("group", { name: "Outcome Blocked" }).click();
    await expect(inspector.getByText("Connection")).toBeVisible();
    await inspector.getByLabel("Name").fill("Escalate to blocked");
    await expect(page.getByRole("group", { name: "Outcome Escalate to blocked" })).toBeVisible();

    await page.locator(".react-flow__node").filter({ hasText: "Backlog" }).click();
    await expect(page.getByRole("switch", { name: "Fast mode" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Backlog" }).getByRole("button", { name: "Remove" }),
    ).toBeVisible();
    await expect(page.getByRole("group", { name: "Outcome New outcome" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Outcome Escalate to blocked" })).toBeVisible();
    await page.locator(".react-flow__node").filter({ hasText: "Backlog" }).click();
    await expect(page.getByRole("switch", { name: "Fast mode" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await assertNoDocumentOverflow(page);
    await page.screenshot({
      path: `${screenshotDir}/product-owner-workflow-1440x900.png`,
      fullPage: true,
    });
  });

  test("fixture scopes isolate drafts between repositories", async ({ page }) => {
    await page.goto("/operations?source=fixture&fixture=branching-pr-review&scope=target-app");
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
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
    await page.goto(FIXTURE_URL);
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    await assertNoDocumentOverflow(page);
    await page.screenshot({ path: `${screenshotDir}/branching-1440x900.png`, fullPage: true });
  });

  test("mobile viewport renders without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FIXTURE_URL);
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2,
    );
    expect(overflow).toBe(false);
    await page.screenshot({ path: `${screenshotDir}/branching-mobile.png`, fullPage: true });
  });

  test("100-node fixture loads without obvious lag", async ({ page }) => {
    const started = Date.now();
    await page.goto("/operations?source=fixture&fixture=hundred-node-performance&scope=target-app");
    await expect(page.getByRole("heading", { name: "Operations", level: 1 })).toBeVisible({
      timeout: 20_000,
    });
    expect(Date.now() - started).toBeLessThan(20_000);
    await page.screenshot({ path: `${screenshotDir}/hundred-node.png`, fullPage: true });
  });
});
