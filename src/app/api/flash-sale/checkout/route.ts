// =============================================================
// app/api/flash-sale/checkout/route.ts — Flash Sale Checkout Endpoint
// =============================================================
//
// CONCURRENCY & RACE CONDITION PROTECTION:
//   This endpoint protects inventory from being oversold using
//   Redis Distributed Mutex Locks.
//
// STATUS CODES RETURNED:
//   • 200 OK           — Purchase succeeded, stock decremented
//   • 409 Conflict     — Another request holds the lock (lock contention)
//   • 400 Bad Request  — Item is sold out (stock <= 0)
//   • 500 Server Error — Unexpected failure
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { processFlashSaleCheckout } from "@/lib/inventory";

export async function POST(request: NextRequest) {
  try {
    let body: { itemId?: string; userId?: string; quantity?: number; delayMs?: number };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body must be JSON with "itemId" and "userId".' },
        { status: 400 }
      );
    }

    const { itemId, userId, quantity = 1, delayMs = 80 } = body;

    if (!itemId || !userId) {
      return NextResponse.json(
        { error: '"itemId" and "userId" are required for checkout.' },
        { status: 400 }
      );
    }

    const result = await processFlashSaleCheckout(
      itemId.trim(),
      userId.trim(),
      Math.max(1, Number(quantity)),
      Number(delayMs)
    );

    if (result.status === "SUCCESS") {
      return NextResponse.json(result, { status: 200 });
    }

    if (result.status === "LOCKED") {
      return NextResponse.json(result, {
        status: 409, // HTTP 409 Conflict = Resource is locked by concurrent transaction
        headers: { "Retry-After": "1" },
      });
    }

    if (result.status === "OUT_OF_STOCK") {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 500 });
  } catch (error) {
    console.error("🔥 Flash sale checkout API failure:", error);
    return NextResponse.json(
      { error: "Internal checkout system error." },
      { status: 500 }
    );
  }
}
