import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const fixtureCsv = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/cursor-usage/sample-usage.csv",
);

test.describe("cursor usage import browser", () => {
  test("bulk CSV import flow stays secret-safe and duplicate-click safe", async ({
    page,
  }) => {
    await page.goto("/settings/cursor-usage");
    await page.waitForLoadState("networkidle");

    await expect(page.getByTestId("cursor-usage-page")).toBeVisible();
    await expect(page.getByTestId("cursor-usage-langfuse-banner")).toBeVisible();

    const fileInput = page.getByTestId("cursor-usage-file-input");
    await fileInput.setInputFiles(fixtureCsv);
    await expect(page.getByTestId("cursor-usage-file-name")).toContainText(
      "sample-usage.csv",
    );

    await page.getByTestId("cursor-usage-export-start").fill("2026-07-19T00:00:00.000Z");
    await page.getByTestId("cursor-usage-export-end").fill("2026-07-19T23:59:59.000Z");

    await page.getByTestId("cursor-usage-preflight-button").click();
    await expect(page.getByTestId("cursor-usage-preflight-table")).toBeVisible();
    await expect(page.getByTestId("preflight-state-matched").first()).toBeVisible();

    const applyButton = page.getByTestId("cursor-usage-apply-button");
    await expect(applyButton).toBeDisabled();

    await page.getByTestId("cursor-usage-apply-confirm").check();
    await expect(applyButton).toBeEnabled();

    await Promise.all([applyButton.click(), applyButton.click()]);
    await expect(page.getByTestId("cursor-usage-lifecycle")).toHaveText("verified", {
      timeout: 60_000,
    });
    await expect(page.getByTestId("cursor-usage-verified")).toHaveText("yes");
    await expect(applyButton).toBeDisabled();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cursor-usage-results-panel")).toBeVisible();
    await expect(page.getByTestId("cursor-usage-analytics-panel")).toBeVisible();

    const html = await page.content();
    expect(html).not.toMatch(/\bsk-[a-z0-9_-]{8,}\b/i);
    expect(html).not.toMatch(/\bpk-[a-z0-9_-]{8,}\b/i);
    expect(html).not.toContain("bc-agent-planning-001");
    expect(html).not.toContain("bc-agent-planreview-001");
  });
});
