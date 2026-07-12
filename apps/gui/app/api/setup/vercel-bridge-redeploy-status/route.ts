import { NextResponse } from "next/server";
import { pollVercelBridgeRedeployRemote } from "@/lib/setup-server";
import type { VercelBridgePlanInput } from "@harness/setup/vercel-setup-apply";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      actionId?: string;
      plan: Omit<VercelBridgePlanInput, "vercelToken" | "linearApiKey"> & {
        vercelToken?: string;
        linearApiKey?: string;
      };
    };
    const result = await pollVercelBridgeRedeployRemote(body);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Vercel bridge redeploy status check failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
