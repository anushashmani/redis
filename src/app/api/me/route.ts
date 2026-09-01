// =============================================================
// app/api/me/route.ts — Session Validation ("Who am I?")
// =============================================================
// This endpoint reads the session token from the "Authorization"
// header, looks it up in Redis, and returns the user's profile
// if the session is still valid.
//
// USAGE:
//   GET /api/me
//   Headers:  Authorization: Bearer <sessionId>
//
// FLOW:
//   1. Extract the session ID from the Authorization header.
//   2. Look up "session:{sessionId}" in Redis.
//   3. If found → user is authenticated, return their data.
//   4. If not found → session expired or invalid, return 401.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";

export async function GET(request: NextRequest) {
  // ----------------------------------------------------------
  // STEP 1 — Extract the session token
  // ----------------------------------------------------------
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      {
        error: "Missing or malformed Authorization header.",
        hint: 'Send:  Authorization: Bearer <sessionId>',
      },
      { status: 401 }
    );
  }

  // "Bearer a1b2c3d4-..." → "a1b2c3d4-..."
  const sessionId = authHeader.split(" ")[1];
  const sessionKey = `session:${sessionId}`;

  try {
    // ----------------------------------------------------------
    // STEP 2 — Look up the session in Redis
    // ----------------------------------------------------------
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      // The key doesn't exist — either the session expired
      // (TTL elapsed) or the ID is bogus.
      console.log(`🚫 Invalid / expired session: ${sessionKey}`);
      return NextResponse.json(
        { error: "Session expired or invalid. Please log in again." },
        { status: 401 }
      );
    }

    // ----------------------------------------------------------
    // STEP 3 — Session is valid → return user info
    // ----------------------------------------------------------
    // redis.get() with Upstash returns the parsed object if
    // the value was stored as a JSON string.
    console.log(`✅ Valid session: ${sessionKey}`);

    // Check remaining TTL so the client knows when to refresh
    const ttl = await redis.ttl(sessionKey);

    return NextResponse.json(
      {
        message: "Authenticated!",
        user: sessionData,
        sessionExpiresIn: `${ttl} seconds`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Session lookup failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
