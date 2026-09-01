// =============================================================
// app/api/flash-sale/reset/route.ts — Reset Flash Sale Inventory
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { resetInventory } from "@/lib/inventory";

export async function POST(request: NextRequest) {
  try {
    let body: { itemId?: string; stock?: number } = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional; defaults used if omitted
    }

    const itemId = (body.itemId || "limited-ps5-console").trim();
    const stock = Number(body.stock ?? 3);

    const result = await resetInventory(itemId, stock);

    return NextResponse.json(
      {
        message: `Inventory for "${itemId}" has been reset.`,
        ...result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to reset inventory:", error);
    return NextResponse.json(
      { error: "Failed to reset inventory." },
      { status: 500 }
    );
  }
}
