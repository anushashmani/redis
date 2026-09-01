// =============================================================
// app/api/cache/[key]/route.ts — Cache Invalidation Endpoint
// =============================================================
// WHY do we need this?
//   When someone updates a product in the database (e.g. changes
//   the price), the cached copy in Redis becomes STALE.  Instead
//   of waiting for the TTL to expire naturally, we can proactively
//   DELETE the key so the next request fetches fresh data.
//
// USAGE:
//   DELETE /api/cache/product:3   →  removes "product:3" from Redis
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * GET /api/cache/[key]
 * Inspects a specific cache key and its remaining TTL in Redis.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { key } = await context.params;

  try {
    const value = await redis.get(key);
    const ttl = await redis.ttl(key);

    if (value === null) {
      return NextResponse.json(
        { exists: false, key, value: null, ttl: -2 },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { exists: true, key, value, ttl },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to get cache key:", error);
    return NextResponse.json(
      { error: "Failed to inspect cache key." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cache/[key]
 * Sets a cache key with a custom TTL (in seconds) for testing or manual overrides.
 * Body: { "value": any, "ex"?: number }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { key } = await context.params;

  try {
    const body = await request.json();
    const { value, ex } = body;

    const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value ?? "");

    if (ex && typeof ex === "number" && ex > 0) {
      await redis.set(key, stringValue, { ex });
      console.log(`📦 Manually set cache key "${key}" with TTL = ${ex}s`);
    } else {
      await redis.set(key, stringValue);
      console.log(`📦 Manually set cache key "${key}" with NO expiry`);
    }

    return NextResponse.json(
      { success: true, key, value, ttl: ex ?? -1 },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to set cache key:", error);
    return NextResponse.json(
      { error: "Failed to set cache key." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/cache/[key]
 * Invalidate / clear a specific cache key from Redis.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { key } = await context.params;

  try {
    // redis.del() returns the number of keys that were removed.
    // It returns 0 if the key didn't exist (which is fine).
    const deleted = await redis.del(key);

    if (deleted === 0) {
      // Key wasn't in Redis — not an error, just informational
      console.log(`ℹ️  Key "${key}" was not found in cache (already expired or never set).`);
      return NextResponse.json(
        { message: `Key "${key}" was not in cache.`, deleted: 0 },
        { status: 200 }
      );
    }

    console.log(`🗑️  Invalidated cache key "${key}"`);
    return NextResponse.json(
      { message: `Cache key "${key}" has been invalidated.`, deleted },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to invalidate cache key:", error);
    return NextResponse.json(
      { error: "Failed to invalidate cache key." },
      { status: 500 }
    );
  }
}

