"use client";

import type { PublicPreflightRow } from "@/lib/cursor-usage-client";

interface PreflightTableProps {
  rows: PublicPreflightRow[];
}

export function PreflightTable({ rows }: PreflightTableProps) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="cursor-usage-preflight-empty">
        No attribution rows produced.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border" data-testid="cursor-usage-preflight-table">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Agent hash</th>
            <th className="px-3 py-2 font-medium">State</th>
            <th className="px-3 py-2 font-medium">Phase</th>
            <th className="px-3 py-2 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.cloudAgentIdHash}-${row.phase ?? "none"}`} className="border-t">
              <td className="px-3 py-2 font-mono text-xs">{row.cloudAgentIdHash}</td>
              <td className="px-3 py-2" data-testid={`preflight-state-${row.state}`}>
                {row.state}
              </td>
              <td className="px-3 py-2">{row.phase ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{row.reason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
