import { NextResponse } from "next/server";
import { loadWorkflowBootstrap } from "@/lib/workflow-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const source = url.searchParams.get("source") ?? undefined;
  const fixture = url.searchParams.get("fixture") ?? undefined;
  const scope = url.searchParams.get("scope") ?? undefined;

  try {
    const payload = await loadWorkflowBootstrap({ source, fixture, scope });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Workflow bootstrap failed.",
      },
      { status: 500 },
    );
  }
}
