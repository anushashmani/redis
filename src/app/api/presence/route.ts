// =============================================================
// app/api/presence/route.ts — Active Users & Live Presence Count
// =============================================================
//
// USAGE:
//   GET /api/presence
//     → Returns overall online count and list of active users.
//
//   GET /api/presence?resourceId=product:1
//     → Returns number of users currently viewing product 1.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";

// Users who sent a heartbeat in the last 60 seconds are considered online
const PRESENCE_TIMEOUT_MS = 60_000;

export async function GET(request: NextRequest) {
  const resourceId = request.nextUrl.searchParams.get("resourceId") || undefined;
  const includeMeta = request.nextUrl.searchParams.get("includeMeta") === "true";

  const now = Date.now();
  const activeThreshold = now - PRESENCE_TIMEOUT_MS;

  const key = resourceId ? `presence:resource:${resourceId.trim()}` : "presence:global";

  try {
    // ----------------------------------------------------------
    // STEP 1 — Prune Stale Users
    // ----------------------------------------------------------
    // Evict any users whose timestamp is older than 60s
    await redis.zremrangebyscore(key, 0, activeThreshold);

    // ----------------------------------------------------------
    // STEP 2 — Query Active Users (Score between activeThreshold and +inf)
    // ----------------------------------------------------------
    // zrange with { byScore: true } fetches active members
    const activeUsers = await redis.zrange(key, activeThreshold, "+inf", {
      byScore: true,
    });

    const count = Array.isArray(activeUsers) ? activeUsers.length : 0;

    // Optional: fetch user metadata if requested
    let usersWithMeta: any[] = activeUsers;
    if (includeMeta && count > 0) {
      usersWithMeta = await Promise.all(
        activeUsers.map(async (userId) => {
          const meta = await redis.hgetall(`presence:meta:${userId}`);
          return {
            userId,
            ...(meta || {}),
          };
        })
      );
    }

    console.log(`👥 Active Presence (${key}): ${count} user(s) online`);

    return NextResponse.json(
      {
        resource: resourceId ?? "global",
        count,
        users: usersWithMeta,
        timestamp: new Date(now).toISOString(),
        timeoutWindowSeconds: PRESENCE_TIMEOUT_MS / 1000,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0", // Real-time data should not be browser-cached
        },
      }
    );
  } catch (error) {
    console.error("🔥 Failed to query presence:", error);
    return NextResponse.json(
      { error: "Failed to query presence." },
      { status: 500 }
    );
  }
}
