import { NextResponse } from "next/server";
import { applyVercelBridgeRemote } from "@/lib/setup-server";
import type { VercelBridgePlanInput } from "@harness/setup/vercel-setup-apply";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      plan: Omit<VercelBridgePlanInput, "vercelToken" | "linearApiKey"> & {
        vercelToken?: string;
        linearApiKey?: string;
      };
      confirmed: boolean;
      fingerprint: string;
      manualComplete?: boolean;
    };
    const result = await applyVercelBridgeRemote(body);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Vercel bridge apply failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
