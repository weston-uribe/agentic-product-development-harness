import { NextResponse } from "next/server";
import { loadSetupSummary } from "@/lib/setup-server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const summary = await loadSetupSummary();
    return NextResponse.json({
      doctor: summary.doctor,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Diagnostics run failed.",
      },
      { status: 500 },
    );
  }
}
