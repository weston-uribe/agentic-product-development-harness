import { NextResponse } from "next/server";
import { runLocalReadinessChecks } from "@harness/setup/local-readiness-checks";
import { resolveHarnessWorkspaceDir } from "@harness/gui/repo-root";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const result = await runLocalReadinessChecks({
      cwd: resolveHarnessWorkspaceDir(),
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Local readiness check failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
