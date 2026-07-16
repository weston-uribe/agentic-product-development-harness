import { mkdirSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const screenshotDir = "/tmp/configure-validation";

const VERCEL_BRIDGE_OPTIONS = {
  scopes: [{ id: "team-1", label: "Acme (acme)", kind: "team" }],
  projects: [{ id: "proj-1", name: "harness-gui", accountId: "acct-1" }],
  selectedScopeId: "team-1",
  selectedProjectId: "proj-1",
  harnessTeamKey: "ENG",
  githubDispatch: {
    eligible: true,
    source: "saved-github-token",
    repository: "weston-uribe/agentic-product-development-harness",
    message:
      "Saved GITHUB_TOKEN can dispatch to weston-uribe/agentic-product-development-harness.",
  },
  capabilities: {
    teamCreate: true,
    projectCreate: true,
  },
};

async function mockConfigureApis(page: Page): Promise<void> {
  await page.route("**/api/setup/vercel-bridge-options**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(VERCEL_BRIDGE_OPTIONS),
    });
  });
}

async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  expect(overflow).toBe(false);
}

test.describe("configure browser matrix", () => {
  test.beforeAll(() => {
    mkdirSync(screenshotDir, { recursive: true });
  });

  test("step 3 shows dispatch eligibility and back navigation returns to step 2", async ({
    page,
  }) => {
    await mockConfigureApis(page);
    await page.goto("/settings/configure");

    await expect(page.getByText(/Step 3 of 7 · Configure Vercel settings/)).toBeVisible({
      timeout: 30_000,
    });

    await expect(
      page.getByText(/Could not resolve the harness dispatch repository/i),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Back" }).click();

    await expect(
      page.getByText(/Step 2 of 7 · Set up Linear workspace/),
    ).toBeVisible();

    await expect(page.getByText(/Step 3 of 7 · Configure Vercel settings/)).toHaveCount(
      0,
    );

    await page.waitForTimeout(1_000);

    await expect(
      page.getByText(/Step 2 of 7 · Set up Linear workspace/),
    ).toBeVisible();
    await expect(page.getByText(/Step 3 of 7 · Configure Vercel settings/)).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: "Continue to Vercel bridge" }).click();

    await expect(page.getByText(/Step 3 of 7 · Configure Vercel settings/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply Vercel Settings" })).toBeVisible();

    await page.screenshot({
      path: `${screenshotDir}/configure-step3-back-desktop.png`,
      fullPage: true,
    });
  });

  test("mobile configure step 3 back navigation remains usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockConfigureApis(page);
    await page.goto("/settings/configure");

    await expect(page.getByText(/Step 3 of 7 · Configure Vercel settings/)).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Back" }).click();
    await expect(
      page.getByText(/Step 2 of 7 · Set up Linear workspace/),
    ).toBeVisible();

    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: `${screenshotDir}/configure-step3-back-mobile.png`,
      fullPage: true,
    });
  });
});
