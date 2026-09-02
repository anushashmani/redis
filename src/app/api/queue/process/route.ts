// =============================================================
// app/api/queue/process/route.ts — Background Worker / Consumer
// =============================================================

import { NextResponse } from "next/server";
import { processNextJob } from "@/lib/queue";

export async function POST() {
  try {
    const result = await processNextJob();

    if (!result.processed) {
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("🔥 Worker processing failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
