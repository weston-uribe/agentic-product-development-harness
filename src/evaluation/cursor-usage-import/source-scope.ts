import type { ExportWindow, UsageSegment } from "./canonical.js";

const DEFAULT_GUARD_SLACK_MS = 6 * 60 * 60 * 1000;

export type SourceScopeIncompleteReason =
  | "export_window_unproven"
  | "export_window_missing"
  | "export_window_invalid"
  | "execution_outside_export_window"
  | "rejected_or_ambiguous_row_for_agent"
  | "langfuse_retrieval_incomplete"
  | "token_arithmetic_incomplete"
  | "unaccounted_source_segment"
  | null;

export interface SourceScopeVerdict {
  sourceScopeComplete: boolean;
  sourceScopeIncompleteReason: SourceScopeIncompleteReason;
}

function parseIso(s: string): number | null {
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function validateExportWindow(
  window: ExportWindow | null | undefined,
): { ok: true; window: ExportWindow } | { ok: false; reason: SourceScopeIncompleteReason } {
  if (!window) {
    return { ok: false, reason: "export_window_missing" };
  }
  if (window.boundsSource === "unproven") {
    return { ok: false, reason: "export_window_unproven" };
  }
  const start = parseIso(window.startIso);
  const end = parseIso(window.endIso);
  if (start == null || end == null || end < start) {
    return { ok: false, reason: "export_window_invalid" };
  }
  return { ok: true, window };
}

/**
 * A trace bundle is source-scope complete only when the agent execution window
 * is contained in the export window (with slack), every segment for that agent
 * is accounted for, and no rejected/ambiguous row could belong to the execution.
 */
export function evaluateSourceScope(params: {
  exportWindow: ExportWindow | null | undefined;
  executionWindowStartIso: string | null;
  executionWindowEndIso: string | null;
  agentSegments: UsageSegment[];
  accountedSegmentFingerprints: Set<string>;
  hasRejectedOrAmbiguousForAgent: boolean;
  langfuseRetrievalComplete: boolean;
  tokenArithmeticComplete: boolean;
  guardSlackMs?: number;
}): SourceScopeVerdict {
  const validated = validateExportWindow(params.exportWindow);
  if (!validated.ok) {
    return {
      sourceScopeComplete: false,
      sourceScopeIncompleteReason: validated.reason,
    };
  }

  if (!params.tokenArithmeticComplete) {
    return {
      sourceScopeComplete: false,
      sourceScopeIncompleteReason: "token_arithmetic_incomplete",
    };
  }
  if (!params.langfuseRetrievalComplete) {
    return {
      sourceScopeComplete: false,
      sourceScopeIncompleteReason: "langfuse_retrieval_incomplete",
    };
  }
  if (params.hasRejectedOrAmbiguousForAgent) {
    return {
      sourceScopeComplete: false,
      sourceScopeIncompleteReason: "rejected_or_ambiguous_row_for_agent",
    };
  }

  const slack = params.guardSlackMs ?? DEFAULT_GUARD_SLACK_MS;
  const execStart = params.executionWindowStartIso
    ? parseIso(params.executionWindowStartIso)
    : null;
  const execEnd = params.executionWindowEndIso
    ? parseIso(params.executionWindowEndIso)
    : null;
  const exportStart = parseIso(validated.window.startIso)!;
  const exportEnd = parseIso(validated.window.endIso)!;

  if (execStart == null || execEnd == null) {
    return {
      sourceScopeComplete: false,
      sourceScopeIncompleteReason: "execution_outside_export_window",
    };
  }
  // Complete execution window must be contained within export window (+slack on edges).
  if (execStart < exportStart - slack || execEnd > exportEnd + slack) {
    return {
      sourceScopeComplete: false,
      sourceScopeIncompleteReason: "execution_outside_export_window",
    };
  }

  for (const seg of params.agentSegments) {
    for (const fp of seg.fingerprints) {
      if (!params.accountedSegmentFingerprints.has(fp)) {
        return {
          sourceScopeComplete: false,
          sourceScopeIncompleteReason: "unaccounted_source_segment",
        };
      }
    }
  }

  return {
    sourceScopeComplete: true,
    sourceScopeIncompleteReason: null,
  };
}
