import { NextResponse } from "next/server";
import { applyHarnessRepoProvisioningRemote } from "@/lib/setup-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      confirmed?: boolean;
      fingerprint?: string;
      operationId?: string;
    };

    if (!body.fingerprint?.trim() || !body.operationId?.trim()) {
      return NextResponse.json(
        { error: "Provisioning fingerprint and operation ID are required." },
        { status: 400 },
      );
    }

    const result = await applyHarnessRepoProvisioningRemote({
      confirmed: body.confirmed === true,
      fingerprint: body.fingerprint,
      operationId: body.operationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Harness repo provisioning apply failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
