// =============================================================
// app/api/cache/warmup/route.ts — Cache Pre-Warming Endpoint
// =============================================================
//
// WHY PRE-WARM THE CACHE?
//   In traditional Cache-Aside, the very first user who visits
//   a page suffers a slow "Cache MISS" latency while data is
//   fetched from the database.
//
//   With Pre-Warming (Cache Warming), we eagerly load catalog data
//   into Redis on deploy or startup so that:
//     • Even Request #1 is an instant CACHE HIT!
//     • Zero cold-start latency for your users.
// =============================================================

import { NextResponse } from "next/server";
import redis from "@/lib/redis";
import { searchProductsInDB } from "@/lib/db";

export async function POST() {
  try {
    console.log("🔥 Starting Cache Pre-Warming…");

    // 1. Fetch all catalog items from the database
    const { results: allProducts } = await searchProductsInDB({});

    if (!allProducts || allProducts.length === 0) {
      return NextResponse.json(
        { message: "No products found in DB to pre-warm." },
        { status: 200 }
      );
    }

    // 2. Use Redis Pipeline to store all products in a single network roundtrip
    const pipeline = redis.pipeline();

    for (const product of allProducts) {
      const key = `product:${product.id}`;
      // Set each product with 24-hour TTL (86400s)
      pipeline.set(key, JSON.stringify(product), { ex: 86400 });
    }

    await pipeline.exec();
    console.log(`✅ Successfully pre-warmed ${allProducts.length} products into Redis!`);

    return NextResponse.json(
      {
        success: true,
        message: `Cache pre-warming complete! ${allProducts.length} products loaded into Redis.`,
        warmedCount: allProducts.length,
        productIds: allProducts.map((p) => p.id),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to pre-warm cache:", error);
    return NextResponse.json(
      { error: "Failed to pre-warm cache." },
      { status: 500 }
    );
  }
}
