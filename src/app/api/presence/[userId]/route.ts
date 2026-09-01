// =============================================================
// app/api/presence/[userId]/route.ts — Single User Online Status
// =============================================================
//
// USAGE:
//   GET /api/presence/alice@example.com
//   → Returns: { isOnline: true, lastSeen: "2026-09-01T...", secondsAgo: 12 }
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";

const PRESENCE_TIMEOUT_MS = 60_000;

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { userId } = await context.params;
  const decodedUserId = decodeURIComponent(userId).trim();

  const now = Date.now();
  const activeThreshold = now - PRESENCE_TIMEOUT_MS;

  try {
    // Look up the user's score (timestamp) in the global presence set
    const score = await redis.zscore("presence:global", decodedUserId);

    if (score === null) {
      return NextResponse.json(
        {
          userId: decodedUserId,
          isOnline: false,
          lastSeen: null,
          message: "User is offline or has never connected.",
        },
        { status: 200 }
      );
    }

    const lastSeenTimestamp = Number(score);
    const isOnline = lastSeenTimestamp >= activeThreshold;
    const secondsAgo = Math.round((now - lastSeenTimestamp) / 1000);

    // Fetch metadata if available
    const metadata = await redis.hgetall(`presence:meta:${decodedUserId}`);

    return NextResponse.json(
      {
        userId: decodedUserId,
        isOnline,
        lastSeen: new Date(lastSeenTimestamp).toISOString(),
        secondsAgo,
        metadata: metadata || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to check user presence status:", error);
    return NextResponse.json(
      { error: "Failed to check user presence status." },
      { status: 500 }
    );
  }
}
