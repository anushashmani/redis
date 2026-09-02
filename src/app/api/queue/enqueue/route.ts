// =============================================================
// app/api/queue/enqueue/route.ts — Background Job Producer
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { enqueueJob, JobType } from "@/lib/queue";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type: JobType = body.type || "GENERATE_PDF_INVOICE";
    const payload = body.payload || {};
    const maxRetries = body.maxRetries ?? 3;

    const job = await enqueueJob(type, payload, maxRetries);

    return NextResponse.json(
      {
        message: `Job "${job.id}" enqueued successfully.`,
        job,
      },
      { status: 202 } // HTTP 202 Accepted
    );
  } catch (error: any) {
    console.error("🔥 Enqueue failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
