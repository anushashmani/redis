// =============================================================
// app/api/queue/reset/route.ts — Clear All Queue Items
// =============================================================

import { NextResponse } from "next/server";
import { clearQueue } from "@/lib/queue";

export async function POST() {
  try {
    await clearQueue();
    return NextResponse.json({ message: "Job queues cleared successfully." }, { status: 200 });
  } catch (error: any) {
    console.error("🔥 Failed to clear queue:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
