import { NextResponse } from "next/server";
import { loadRunnerUpgradeStatusForGui } from "@/lib/setup-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await loadRunnerUpgradeStatusForGui();
    return NextResponse.json(status);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Runner upgrade status check failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
