// =============================================================
// app/api/presence/heartbeat/route.ts — User Presence Heartbeat
// =============================================================
//
// HOW REDIS PRESENCE WORKS:
//   1. Every connected user/tab sends a lightweight "heartbeat" ping
//      every 15–30 seconds.
//   2. We store the user in a Redis Sorted Set (ZSET):
//        Key   : "presence:global" (or "presence:resource:{id}")
//        Member: userId (e.g. "alice@example.com", "user_123")
//        Score : Current Unix timestamp in milliseconds (Date.now())
//   3. When querying active users, anyone whose timestamp is within
//      the last 60 seconds is considered ONLINE.
//   4. Stale/closed tabs naturally fall outside the window with ZERO
//      database cleanup overhead!
//
// USAGE:
//   POST   /api/presence/heartbeat   (Ping to stay online)
//   DELETE /api/presence/heartbeat   (Explicit disconnect / sign off)
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";

// Inactivity threshold: users who haven't pinged in 60s are considered offline
const PRESENCE_TIMEOUT_MS = 60_000; // 60 seconds

export async function POST(request: NextRequest) {
  try {
    let body: { userId?: string; resourceId?: string; metadata?: Record<string, any> };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body must be JSON with a "userId" field.' },
        { status: 400 }
      );
    }

    const { userId, resourceId, metadata } = body;

    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      return NextResponse.json(
        { error: '"userId" is required to track presence.' },
        { status: 400 }
      );
    }

    const cleanUserId = userId.trim();
    const now = Date.now();
    const staleThreshold = now - PRESENCE_TIMEOUT_MS;

    // ----------------------------------------------------------
    // STEP 1 — Update Global Presence Sorted Set
    // ----------------------------------------------------------
    // `zadd` updates the score (timestamp) to `now` for this member.
    // If the user didn't exist, they are inserted.
    await redis.zadd("presence:global", { score: now, member: cleanUserId });

    // Optional: store user metadata (name, avatar, role) in a Redis Hash
    if (metadata && typeof metadata === "object") {
      await redis.hset(`presence:meta:${cleanUserId}`, {
        ...metadata,
        lastSeen: new Date(now).toISOString(),
      });
      // Give metadata a 2-hour TTL so it doesn't linger indefinitely
      await redis.expire(`presence:meta:${cleanUserId}`, 7200);
    }

    // ----------------------------------------------------------
    // STEP 2 — Update Resource-Specific Presence (if applicable)
    // ----------------------------------------------------------
    // Useful for "3 people are viewing this product right now"
    if (resourceId && typeof resourceId === "string") {
      const cleanResourceId = resourceId.trim();
      const resourceKey = `presence:resource:${cleanResourceId}`;
      await redis.zadd(resourceKey, { score: now, member: cleanUserId });
      // Keep resource sorted set around for 10 minutes
      await redis.expire(resourceKey, 600);
    }

    // ----------------------------------------------------------
    // STEP 3 — Prune Stale Users (Older than 60 seconds)
    // ----------------------------------------------------------
    // Removes any member whose score (timestamp) is between 0 and staleThreshold.
    // This keeps the sorted set compact and clean.
    await redis.zremrangebyscore("presence:global", 0, staleThreshold);

    console.log(`💓 Presence Heartbeat: "${cleanUserId}" is online (score: ${now})`);

    return NextResponse.json(
      {
        success: true,
        userId: cleanUserId,
        lastSeen: now,
        expiresInMs: PRESENCE_TIMEOUT_MS,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Presence heartbeat failed:", error);
    return NextResponse.json(
      { error: "Failed to record presence heartbeat." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    let body: { userId?: string; resourceId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body must be JSON with a "userId" field.' },
        { status: 400 }
      );
    }

    const { userId, resourceId } = body;

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: '"userId" is required to remove presence.' },
        { status: 400 }
      );
    }

    const cleanUserId = userId.trim();

    // Remove from global presence
    await redis.zrem("presence:global", cleanUserId);

    // Remove from specific resource if specified
    if (resourceId && typeof resourceId === "string") {
      await redis.zrem(`presence:resource:${resourceId.trim()}`, cleanUserId);
    }

    // Clean up metadata
    await redis.del(`presence:meta:${cleanUserId}`);

    console.log(`👋 User signed off / left: "${cleanUserId}"`);

    return NextResponse.json(
      {
        success: true,
        message: `User "${cleanUserId}" marked as offline.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to remove presence:", error);
    return NextResponse.json(
      { error: "Failed to remove presence." },
      { status: 500 }
    );
  }
}
