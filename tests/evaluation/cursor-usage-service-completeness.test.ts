import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseCursorUsageCsv } from "../../src/evaluation/cursor-usage-import/parse.js";
import { preflightCsvImport } from "../../src/evaluation/cursor-usage-import/service.js";

const CSV_HEADER =
  "Date,Cloud Agent ID,Automation ID,Kind,Model,Max Mode,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost";

const VALID_ROW =
  "2026-07-19T12:00:00.000Z,bc-agent-planning-001,,Included,composer-2.5,false,100,200,300,50,650,Included";

const exportWindow = {
  startIso: "2026-07-19T00:00:00.000Z",
  endIso: "2026-07-20T00:00:00.000Z",
  timezone: "UTC",
  precision: "millisecond" as const,
  boundsSource: "cli_flags" as const,
};

function csvWithRows(...rows: string[]): string {
  return [CSV_HEADER, ...rows].join("\n");
}

describe("cursor usage parse rejection classes", () => {
  it("rejects malformed row without Cloud Agent ID as upload_scoped_rejection", () => {
    const parsed = parseCursorUsageCsv(
      csvWithRows(
        VALID_ROW,
        "2026-07-19T12:01:00.000Z,,,Included,composer-2.5,false,0,150,400,25,575,Included",
      ),
    );
    expect(parsed.arithmetic.identityHolds).toBe(false);
    expect(parsed.rejectionSummary.uploadScopedCount).toBe(1);
    const rejected = parsed.rowEvidence.find(
      (r) => r.rejectionClass === "upload_scoped_rejection",
    );
    expect(rejected?.rejectionReason).toBe("cloud_agent_id_missing");
  });

  it("rejects invalid short Cloud Agent ID as upload_scoped_rejection", () => {
    const parsed = parseCursorUsageCsv(
      csvWithRows(
        "2026-07-19T12:01:00.000Z,abc,,Included,composer-2.5,false,0,150,400,25,575,Included",
      ),
    );
    expect(parsed.rejectionSummary.uploadScopedCount).toBe(1);
    expect(parsed.rowEvidence[0]?.rejectionReason).toBe("cloud_agent_id_invalid");
    expect(parsed.arithmetic.identityHolds).toBe(false);
  });

  it("does not create rejection for blank trailing CSV line", () => {
    const parsed = parseCursorUsageCsv(`${csvWithRows(VALID_ROW)}\n`);
    expect(parsed.rejectionSummary.uploadScopedCount).toBe(0);
    expect(parsed.rejectionSummary.agentScopedCount).toBe(0);
    expect(parsed.rows).toHaveLength(1);
  });

  it("does not create rejection for quoted empty optional Automation ID", () => {
    const parsed = parseCursorUsageCsv(
      csvWithRows(
        '2026-07-19T12:00:00.000Z,bc-agent-planning-001,"",Included,composer-2.5,false,100,200,300,50,650,Included',
      ),
    );
    expect(parsed.rejectionSummary.uploadScopedCount).toBe(0);
    expect(parsed.rejectionSummary.agentScopedCount).toBe(0);
    expect(parsed.arithmetic.identityHolds).toBe(true);
    expect(parsed.rows).toHaveLength(1);
  });

  it("stores rejection reason codes not raw cell contents", () => {
    const rawRejectedCell = "bad-id";
    const parsed = parseCursorUsageCsv(
      csvWithRows(
        `2026-07-19T12:01:00.000Z,${rawRejectedCell},,Included,composer-2.5,false,0,150,400,25,575,Included`,
      ),
    );
    expect(parsed.rejectionSummary.reasonCodes).toContain("cloud_agent_id_invalid");
    expect(parsed.rejectionSummary.reasonCodes).not.toContain(rawRejectedCell);
    for (const code of parsed.rejectionSummary.reasonCodes) {
      expect(code).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe("cursor usage preflight completeness", () => {
  it("preflight with upload-scoped rejection marks sourceScopeComplete false", async () => {
    const logDirectory = mkdtempSync(
      path.join(tmpdir(), "cursor-usage-preflight-"),
    );
    const csv = csvWithRows(
      VALID_ROW,
      "2026-07-19T12:01:00.000Z,,,Included,composer-2.5,false,0,150,400,25,575,Included",
    );

    const result = await preflightCsvImport({
      csvBytes: csv,
      exportWindow,
      namespace: "default",
      logDirectory,
      discoverLangfuse: false,
    });

    expect(result.sourceScopeComplete).toBe(false);
    expect(result.publicSummary.uploadScopedRejectionCount).toBeGreaterThan(0);
    expect(result.publicSummary.rejectionReasonCodes).toContain(
      "cloud_agent_id_missing",
    );

    const summaryJson = JSON.stringify(result.publicSummary);
    expect(summaryJson).not.toContain("bc-agent-planning-001");
    expect(summaryJson).not.toMatch(/Included,composer-2\.5/);
    for (const code of result.publicSummary.rejectionReasonCodes) {
      expect(code).toMatch(/^[a-z0-9_]+$/);
    }
  });
});
