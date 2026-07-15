import { NextRequest, NextResponse } from "next/server";
import {
  persistOperationsDraft,
  resetOperationsDraft,
} from "@/lib/operations-server";
import { operationsDraftSaveRequestSchema } from "@harness/operations/schema";
import { resolveOperationsSourceContext } from "@harness/operations/source-context";

export const dynamic = "force-dynamic";

function resolveContext(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("source");
  const fixture = request.nextUrl.searchParams.get("fixture");
  return resolveOperationsSourceContext({ source, fixture });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const context = resolveContext(request);
  if (context.rejectionReason) {
    return NextResponse.json(
      { error: context.rejectionReason },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = operationsDraftSaveRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid draft payload.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const result = await persistOperationsDraft({
      context,
      draft: parsed.data,
    });
    return NextResponse.json({
      draft: result.draft,
      validation: result.validation,
      summary: result.summary,
      message:
        context.mode === "fixture"
          ? "Fixture draft saved in isolated fixture store."
          : "Local Operations draft saved.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save Operations draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const context = resolveContext(request);
  if (context.rejectionReason) {
    return NextResponse.json(
      { error: context.rejectionReason },
      { status: 400 },
    );
  }

  try {
    const bootstrap = await resetOperationsDraft(context);
    return NextResponse.json({
      deleted: true,
      bootstrap,
      message:
        context.mode === "fixture"
          ? "Fixture draft reset. Live draft was not modified."
          : "Local Operations draft reset.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reset Operations draft.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
