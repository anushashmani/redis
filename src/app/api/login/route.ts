// =============================================================
// app/api/login/route.ts — Session Creation (Login)
// =============================================================
// HOW SESSIONS WORK WITH REDIS:
//   1. User sends credentials (email + password).
//   2. We validate them (mock check here).
//   3. We generate a random session ID (UUID v4).
//   4. We store the session data in Redis under the key
//      "session:{sessionId}" with a 30-minute TTL.
//   5. We return the session ID to the client.
//
// The client then sends this session ID on every subsequent
// request (e.g. in an "Authorization" header) so we can look up
// the session in /api/me.
//
// WHY Redis for sessions?
//   • Lightning fast reads (~1 ms) — perfect for auth checks
//     that happen on EVERY request.
//   • Built-in TTL — sessions auto-expire, no cleanup cron needed.
//   • Shared across all serverless instances — stateless deploy.
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import redis from "@/lib/redis";

// ---------- Mock user database ----------
const USERS: Record<string, { password: string; name: string; role: string }> = {
  "alice@example.com": { password: "password123", name: "Alice", role: "admin" },
  "bob@example.com":   { password: "hunter2",     name: "Bob",   role: "user"  },
};

// ---------- Constants ----------
const SESSION_TTL = 1800; // 30 minutes in seconds (30 × 60)

export async function POST(request: NextRequest) {
  // ----------------------------------------------------------
  // STEP 1 — Parse & validate input
  // ----------------------------------------------------------
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Request body must be JSON with "email" and "password".' },
      { status: 400 }
    );
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: '"email" and "password" fields are required.' },
      { status: 400 }
    );
  }

  // ----------------------------------------------------------
  // STEP 2 — Authenticate (mock)
  // ----------------------------------------------------------
  const user = USERS[email];

  if (!user || user.password !== password) {
    // ⚠️  In production, NEVER reveal whether the email exists —
    // always return a generic "invalid credentials" message.
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  // ----------------------------------------------------------
  // STEP 3 — Create a session in Redis
  // ----------------------------------------------------------
  const sessionId = randomUUID(); // e.g. "a1b2c3d4-..."
  const sessionKey = `session:${sessionId}`;

  // The session payload — everything you need to identify the
  // user on subsequent requests without hitting the DB.
  const sessionData = {
    email,
    name: user.name,
    role: user.role,
    createdAt: new Date().toISOString(),
  };

  try {
    // Store as a JSON string with a 30-minute expiry.
    // When the TTL elapses, Redis deletes the key automatically
    // → the session "expires" with zero cleanup code from us.
    await redis.set(sessionKey, JSON.stringify(sessionData), {
      ex: SESSION_TTL,
    });

    console.log(`🔐 Session created: ${sessionKey} (TTL = ${SESSION_TTL}s)`);

    return NextResponse.json(
      {
        message: "Login successful!",
        sessionId,              // the client stores this (cookie, localStorage, etc.)
        expiresIn: `${SESSION_TTL} seconds`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Failed to create session in Redis:", error);
    return NextResponse.json(
      { error: "Could not create session. Please try again." },
      { status: 500 }
    );
  }
}
