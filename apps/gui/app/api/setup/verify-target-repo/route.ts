import { NextResponse } from "next/server";
import { resolveHarnessRepoRoot } from "@harness/gui/repo-root";
import { verifySetupTargetRepo } from "@harness/setup/service-verification";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      targetRepo?: string;
      githubToken?: string;
    };

    if (!body.targetRepo?.trim()) {
      return NextResponse.json(
        { error: "A target repo URL is required." },
        { status: 400 },
      );
    }

    const result = await verifySetupTargetRepo({
      cwd: resolveHarnessRepoRoot(),
      targetRepo: body.targetRepo,
      githubToken: body.githubToken,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Repo verification failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
