// =============================================================
// app/api/products/[id]/route.ts — Cached Product Endpoint
// =============================================================
// FLOW:
//   1. Try to GET `product:{id}` from Redis.
//   2. Cache HIT  → return the cached JSON instantly.
//   3. Cache MISS → fetch from DB, store in Redis with 1-hour TTL,
//      then return the data.
//   4. If Redis itself is down, we STILL return DB data (graceful
//      degradation) — caching should never break your app.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { fetchProductFromDB, updateProductInDB } from "@/lib/db";


// Typing for the dynamic route segment — Next.js 14+ App Router
// passes route params as the second argument to the handler.
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  // 🔑 Build the cache key.
  // Using a "namespace:id" pattern (e.g. "product:3") is a Redis
  // best practice — it keeps keys organised and avoids collisions.
  const cacheKey = `product:${id}`;

  try {
    // ----------------------------------------------------------
    // STEP 1 — Check the cache
    // ----------------------------------------------------------
    // redis.get() returns `null` when the key doesn't exist.
    // Because we stored the product as JSON (see STEP 3), Upstash
    // automatically deserialises it back into an object for us.
    const cached = await redis.get(cacheKey);

    if (cached) {
      // 🎯 CACHE HIT — the data was already in Redis!
      console.log(`✅ Cache HIT  for key "${cacheKey}"`);

      return NextResponse.json(
        {
          source: "cache",       // tells the client where data came from
          data: cached,
        },
        {
          status: 200,
          headers: { "X-Cache": "HIT" },  // custom header for debugging
        }
      );
    }

    // ----------------------------------------------------------
    // STEP 2 — Cache MISS → fetch from the database
    // ----------------------------------------------------------
    console.log(`❌ Cache MISS for key "${cacheKey}" — querying database…`);

    const product = await fetchProductFromDB(id);

    // If the product doesn't exist at all, return 404
    if (!product) {
      return NextResponse.json(
        { error: `Product with id "${id}" not found.` },
        { status: 404 }
      );
    }

    // ----------------------------------------------------------
    // STEP 3 — Populate the cache for next time
    // ----------------------------------------------------------
    // redis.set() with { ex: 3600 } sets a 1-hour TTL (time-to-live).
    // After 3600 seconds Redis automatically deletes the key,
    // ensuring stale data doesn't live forever.
    //
    // We wrap this in its own try/catch so a Redis write failure
    // doesn't prevent us from returning the DB data to the user.
    try {
      await redis.set(cacheKey, JSON.stringify(product), { ex: 3600 });
      console.log(`📦 Stored "${cacheKey}" in Redis (TTL = 3600 s)`);
    } catch (cacheWriteError) {
      // Non-fatal: log it but still return the data
      console.error("⚠️  Failed to write to Redis cache:", cacheWriteError);
    }

    return NextResponse.json(
      {
        source: "database",      // first fetch always comes from DB
        data: product,
      },
      {
        status: 200,
        headers: { "X-Cache": "MISS" },
      }
    );
  } catch (error) {
    // ----------------------------------------------------------
    // STEP 4 — Graceful degradation
    // ----------------------------------------------------------
    // If Redis is completely unreachable (network issue, wrong
    // credentials, etc.), we fall back to the database directly.
    // Caching is an optimisation — it should NEVER be a single
    // point of failure.
    console.error("🔥 Redis error — falling back to database:", error);

    try {
      const product = await fetchProductFromDB(id);

      if (!product) {
        return NextResponse.json(
          { error: `Product with id "${id}" not found.` },
          { status: 404 }
        );
      }

      return NextResponse.json(
        {
          source: "database (Redis fallback)",
          data: product,
        },
        {
          status: 200,
          headers: { "X-Cache": "BYPASS" },  // indicates cache was skipped
        }
      );
    } catch (dbError) {
      // Both Redis AND the DB failed — nothing we can do
      console.error("💀 Database also failed:", dbError);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
}

/**
 * PUT /api/products/[id]
 * Updates product data in DB and synchronizes Redis cache (Write-Through pattern).
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const cacheKey = `product:${id}`;

  try {
    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    // ----------------------------------------------------------
    // STEP 1 — Update in Database
    // ----------------------------------------------------------
    const updatedProduct = await updateProductInDB(id, body);

    if (!updatedProduct) {
      return NextResponse.json(
        { error: `Product with id "${id}" not found.` },
        { status: 404 }
      );
    }

    console.log(`📝 Product "${id}" updated in Database:`, updatedProduct);

    // ----------------------------------------------------------
    // STEP 2 — WRITE-THROUGH: Immediately update Redis Cache
    // ----------------------------------------------------------
    // By updating Redis now, the next customer request gets
    // the fresh data instantly as a Cache HIT without hitting the DB!
    try {
      await redis.set(cacheKey, JSON.stringify(updatedProduct), { ex: 3600 });
      console.log(`⚡ Write-Through: Overwrote cache for "${cacheKey}" with fresh data! (TTL: 3600s)`);
    } catch (cacheError) {
      console.error("⚠️  Failed to update Redis cache on mutation:", cacheError);
    }

    return NextResponse.json(
      {
        message: `Product "${id}" updated successfully.`,
        cacheSync: "write-through",
        data: updatedProduct,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to update product:", error);
    return NextResponse.json(
      { error: "Internal server error while updating product." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/products/[id]
 * Deletes product from DB and purges it from Redis cache.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const cacheKey = `product:${id}`;

  try {
    // Purge from Redis cache
    await redis.del(cacheKey);
    console.log(`🗑️  Purged "${cacheKey}" from Redis cache.`);

    return NextResponse.json(
      {
        message: `Product "${id}" deleted and cache purged.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to delete product cache:", error);
    return NextResponse.json(
      { error: "Failed to delete product." },
      { status: 500 }
    );
  }
}

