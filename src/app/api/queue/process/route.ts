// =============================================================
// app/api/queue/process/route.ts — Background Worker / Consumer
// =============================================================

import { NextResponse } from "next/server";
import { processNextJob } from "@/lib/queue";

export async function POST() {
  try {
    const result = await processNextJob();

    return NextResponse.json(result, {
      status: result.processed ? 200 : 204, // 204 No Content if queue was empty
    });
  } catch (error: any) {
    console.error("🔥 Worker processing failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
