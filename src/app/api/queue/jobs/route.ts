// =============================================================
// app/api/queue/jobs/route.ts — Job Queue Snapshot & Metrics
// =============================================================

import { NextResponse } from "next/server";
import { getQueueSnapshot } from "@/lib/queue";

export async function GET() {
  try {
    const snapshot = await getQueueSnapshot();

    return NextResponse.json(snapshot, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("🔥 Failed to get queue snapshot:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
