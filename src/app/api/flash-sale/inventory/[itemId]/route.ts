// =============================================================
// app/api/flash-sale/inventory/[itemId]/route.ts — Inspect Flash Sale
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { getInventory } from "@/lib/inventory";

type RouteContext = { params: Promise<{ itemId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { itemId } = await context.params;
  const cleanItemId = decodeURIComponent(itemId).trim();

  try {
    const stock = await getInventory(cleanItemId);
    const lockKey = `lock:inventory:${cleanItemId}`;
    const ordersKey = `inventory:orders:${cleanItemId}`;

    const lockHolder = await redis.get(lockKey);
    const isLocked = lockHolder !== null;

    // Fetch confirmed orders from the Redis list
    const rawOrders = await redis.lrange(ordersKey, 0, -1);
    const orders = rawOrders.map((item) => {
      try {
        return typeof item === "string" ? JSON.parse(item) : item;
      } catch {
        return item;
      }
    });

    return NextResponse.json(
      {
        itemId: cleanItemId,
        stock,
        isSoldOut: stock <= 0,
        isLocked,
        lockHolderToken: isLocked ? String(lockHolder).slice(0, 8) + "…" : null,
        totalOrdersPlaced: orders.length,
        orders,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error) {
    console.error("🔥 Failed to inspect inventory:", error);
    return NextResponse.json(
      { error: "Failed to inspect flash sale inventory." },
      { status: 500 }
    );
  }
}
