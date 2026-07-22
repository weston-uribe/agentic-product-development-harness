import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const fixtureCsv = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures/cursor-usage/sample-usage.csv",
);

const FAKE_LANGFUSE = "http://127.0.0.1:18999";

const CSV_HEADER =
  "Date,Cloud Agent ID,Automation ID,Kind,Model,Max Mode,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost";

function browserWorkspace(): string {
  const fromEnv = process.env.CURSOR_USAGE_BROWSER_WORKSPACE?.trim();
  if (fromEnv) return fromEnv;
  return readFileSync("/tmp/cursor-usage-browser-workspace.txt", "utf8").trim();
}

async function resetFakeLangfuse(
  scenario:
    | "default"
    | "cut_through"
    | "unmatched_extra"
    | "ambiguous"
    | "model_conflict"
    | "variant_conflict"
    | "unknown_pricing" = "default",
): Promise<void> {
  await fetch(`${FAKE_LANGFUSE}/__test__/reset`, { method: "POST" });
  if (scenario !== "default") {
    await fetch(`${FAKE_LANGFUSE}/__test__/scenario`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario }),
    });
  }
}

/** Wipe only this suite's workspace import artifacts (no production delete route). */
function resetOperatorWorkspaceImports(): void {
  const workspace = browserWorkspace();
  const importsDir = path.join(
    workspace,
    "runs/evaluation-reports/cursor-usage-imports",
  );
  rmSync(importsDir, { recursive: true, force: true });
}

async function scoreCreateCount(): Promise<number> {
  const res = await fetch(`${FAKE_LANGFUSE}/__test__/score-creates`);
  const body = (await res.json()) as { count: number };
  return body.count;
}

function writeTempCsv(name: string, body: string): string {
  const dir = path.join(tmpdir(), `cursor-usage-e2e-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, name);
  writeFileSync(filePath, body, "utf8");
  return filePath;
}

async function runPreflight(
  page: import("@playwright/test").Page,
  csvPath: string,
  exportStart: string,
  exportEnd: string,
): Promise<void> {
  await page.goto("/settings/cursor-usage");
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    sessionStorage.removeItem("cursor-usage-import-id");
  });
  await page.getByTestId("cursor-usage-file-input").setInputFiles(csvPath);
  await page.getByTestId("cursor-usage-export-start").fill(exportStart);
  await page.getByTestId("cursor-usage-export-end").fill(exportEnd);
  await page.getByTestId("cursor-usage-preflight-button").click();
}

test.describe("cursor usage import browser", () => {
  test.beforeEach(async () => {
    resetOperatorWorkspaceImports();
    await resetFakeLangfuse("default");
  });

  test("happy path: bulk CSV import stays secret-safe and duplicate-click safe", async ({
    page,
  }) => {
    await runPreflight(
      page,
      fixtureCsv,
      "2026-07-19T00:00:00.000Z",
      "2026-07-19T23:59:59.000Z",
    );
    await expect(page.getByTestId("cursor-usage-preflight-table")).toBeVisible();
    await expect(page.getByTestId("preflight-state-matched").first()).toBeVisible();

    const applyButton = page.getByTestId("cursor-usage-apply-button");
    await expect(applyButton).toBeDisabled();
    await page.getByTestId("cursor-usage-apply-confirm").check();
    await expect(applyButton).toBeEnabled();

    await Promise.all([applyButton.click(), applyButton.click()]);
    await expect(page.getByTestId("cursor-usage-lifecycle")).toHaveText(
      "verified",
      { timeout: 60_000 },
    );
    await expect(page.getByTestId("cursor-usage-verified")).toHaveText("yes");
    await expect(applyButton).toBeDisabled();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cursor-usage-results-panel")).toBeVisible();
    await expect(page.getByTestId("cursor-usage-analytics-panel")).toBeVisible();
    await expect(
      page.getByTestId("cursor-usage-analytics-langfuse-status"),
    ).toContainText("Not run");

    const html = await page.content();
    expect(html).not.toMatch(/\bsk-[a-z0-9_-]{8,}\b/i);
    expect(html).not.toMatch(/\bpk-[a-z0-9_-]{8,}\b/i);
    expect(html).not.toContain("bc-agent-planning-001");
    expect(html).not.toContain("bc-agent-planreview-001");
  });

  test("cut-through export: Apply disabled and zero score-creates", async ({
    page,
  }) => {
    await resetFakeLangfuse("cut_through");
    const before = await scoreCreateCount();
    await runPreflight(
      page,
      fixtureCsv,
      "2026-07-19T10:00:00.000Z",
      "2026-07-19T14:00:00.000Z",
    );
    await expect(page.getByTestId("cursor-usage-source-incomplete")).toBeVisible();
    await expect(page.getByTestId("cursor-usage-apply-button")).toBeDisabled();
    expect(await scoreCreateCount()).toBe(before);
  });

  test("matched + unmatched agent: incomplete, zero score-creates", async ({
    page,
  }) => {
    await resetFakeLangfuse("unmatched_extra");
    const csv = writeTempCsv(
      "unmatched.csv",
      [
        CSV_HEADER,
        "2026-07-19T12:00:00.000Z,bc-agent-planning-001,,Included,composer-2.5,false,100,200,300,50,650,Included",
        "2026-07-19T12:30:00.000Z,bc-agent-unknown-999,,Included,composer-2.5,false,10,20,30,5,65,Included",
      ].join("\n"),
    );
    const before = await scoreCreateCount();
    await runPreflight(
      page,
      csv,
      "2026-07-19T00:00:00.000Z",
      "2026-07-19T23:59:59.000Z",
    );
    await expect(page.getByTestId("cursor-usage-source-incomplete")).toBeVisible();
    await expect(page.getByTestId("cursor-usage-apply-button")).toBeDisabled();
    expect(await scoreCreateCount()).toBe(before);
  });

  test("ambiguous mapping: Apply disabled, zero score-creates", async ({
    page,
  }) => {
    await resetFakeLangfuse("ambiguous");
    const before = await scoreCreateCount();
    await runPreflight(
      page,
      fixtureCsv,
      "2026-07-19T00:00:00.000Z",
      "2026-07-19T23:59:59.000Z",
    );
    await expect(page.getByTestId("cursor-usage-apply-button")).toBeDisabled();
    expect(await scoreCreateCount()).toBe(before);
  });

  test("model conflict: incomplete copy, zero score-creates", async ({
    page,
  }) => {
    await resetFakeLangfuse("model_conflict");
    const before = await scoreCreateCount();
    await runPreflight(
      page,
      fixtureCsv,
      "2026-07-19T00:00:00.000Z",
      "2026-07-19T23:59:59.000Z",
    );
    await expect(page.getByTestId("cursor-usage-source-incomplete")).toBeVisible();
    await expect(
      page.getByTestId("cursor-usage-model-conflict-copy"),
    ).toBeVisible();
    await expect(page.getByTestId("cursor-usage-apply-button")).toBeDisabled();
    expect(await scoreCreateCount()).toBe(before);
  });

  test("variant conflict: incomplete, zero score-creates", async ({ page }) => {
    await resetFakeLangfuse("variant_conflict");
    const before = await scoreCreateCount();
    await runPreflight(
      page,
      fixtureCsv,
      "2026-07-19T00:00:00.000Z",
      "2026-07-19T23:59:59.000Z",
    );
    await expect(page.getByTestId("cursor-usage-source-incomplete")).toBeVisible();
    await expect(page.getByTestId("cursor-usage-apply-button")).toBeDisabled();
    expect(await scoreCreateCount()).toBe(before);
  });

  test("unknown pricing: tokens-only apply, pricing-incomplete analytics", async ({
    page,
  }) => {
    await resetFakeLangfuse("unknown_pricing");
    const before = await scoreCreateCount();
    await runPreflight(
      page,
      fixtureCsv,
      "2026-07-19T00:00:00.000Z",
      "2026-07-19T23:59:59.000Z",
    );
    const applyButton = page.getByTestId("cursor-usage-apply-button");
    await page.getByTestId("cursor-usage-apply-confirm").check();
    await expect(applyButton).toBeEnabled();
    await applyButton.click();
    await expect(page.getByTestId("cursor-usage-lifecycle")).toHaveText(
      "verified",
      { timeout: 60_000 },
    );
    const created = (await scoreCreateCount()) - before;
    // Two phases × 12 token/boolean scores; numeric USD cost totals omitted.
    expect(created).toBe(24);
    const createsRes = await fetch(`${FAKE_LANGFUSE}/__test__/score-creates`);
    const createsBody = (await createsRes.json()) as {
      events: Array<{ name?: string }>;
    };
    const names = createsBody.events.map((e) => String(e.name ?? ""));
    expect(names.some((n) => n.includes("cost_usd"))).toBe(false);
    expect(names).not.toContain("cursor_provider_actual_usd");
    await expect(
      page.getByTestId("cursor-usage-analytics-pricing-incomplete"),
    ).toBeVisible();
    const incompleteText = await page
      .getByTestId("cursor-usage-analytics-pricing-incomplete")
      .innerText();
    expect(Number.parseInt(incompleteText, 10)).toBeGreaterThan(0);
  });

  test("upload-scoped rejection (no agent id): blocks apply, zero score-creates", async ({
    page,
  }) => {
    await resetFakeLangfuse("default");
    const csv = writeTempCsv(
      "no-agent.csv",
      [
        CSV_HEADER,
        "2026-07-19T12:00:00.000Z,, ,Included,composer-2.5,false,100,200,300,50,650,Included",
      ].join("\n"),
    );
    const before = await scoreCreateCount();
    await runPreflight(
      page,
      csv,
      "2026-07-19T00:00:00.000Z",
      "2026-07-19T23:59:59.000Z",
    );
    await expect(page.getByTestId("cursor-usage-rejection-summary")).toBeVisible();
    await expect(page.getByTestId("cursor-usage-apply-button")).toBeDisabled();
    const summary = await page
      .getByTestId("cursor-usage-rejection-summary")
      .innerText();
    expect(summary).toMatch(/upload-scoped:\s*[1-9]/);
    expect(summary).not.toContain("Included,composer");
    expect(summary).not.toContain("100,200,300");
    expect(await scoreCreateCount()).toBe(before);
  });

  test("analytics shows grouped issue/phase/model/variant/digest after verified import", async ({
    page,
  }) => {
    // beforeEach already emptied the workspace; preserve this scenario's import across reload.
    await resetFakeLangfuse("default");
    await runPreflight(
      page,
      fixtureCsv,
      "2026-07-19T00:00:00.000Z",
      "2026-07-19T23:59:59.000Z",
    );
    await page.getByTestId("cursor-usage-apply-confirm").check();
    await page.getByTestId("cursor-usage-apply-button").click();
    await expect(page.getByTestId("cursor-usage-lifecycle")).toHaveText(
      "verified",
      { timeout: 60_000 },
    );

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("cursor-usage-analytics-panel")).toBeVisible();
    await expect(
      page.getByTestId("cursor-usage-analytics-langfuse-status"),
    ).toContainText("Not run");
    await expect(
      page.getByTestId("cursor-usage-analytics-by-issue"),
    ).toBeVisible();
    await expect(
      page.getByTestId("cursor-usage-analytics-by-phase"),
    ).toBeVisible();
    await expect(
      page.getByTestId("cursor-usage-analytics-by-source-model"),
    ).toBeVisible();
    await expect(
      page.getByTestId("cursor-usage-analytics-by-variant"),
    ).toBeVisible();
    await expect(
      page.getByTestId("cursor-usage-analytics-by-source-digest"),
    ).toBeVisible();
    await expect(
      page.getByTestId("cursor-usage-analytics-by-pricing-registry"),
    ).toBeVisible();
  });
});
