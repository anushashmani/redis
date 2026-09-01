// =============================================================
// app/api/otp/route.ts — Rate-Limited OTP Endpoint
// =============================================================
// This endpoint simulates sending a one-time password (OTP).
// It's rate-limited to 5 requests per 60 seconds per IP to
// prevent brute-force or spam attacks.
//
// TRY IT:
//   POST /api/otp  (with body { "email": "you@example.com" })
//   → Send it 6 times quickly and the 6th will be rejected (429)
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import ratelimit from "@/lib/ratelimit";

export async function POST(request: NextRequest) {
  // ----------------------------------------------------------
  // STEP 1 — Identify the caller
  // ----------------------------------------------------------
  // We use the IP address as the rate-limit identifier.
  // In production behind a proxy / CDN you'd read
  // "x-forwarded-for" or "cf-connecting-ip" instead.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "127.0.0.1";

  try {
    // ----------------------------------------------------------
    // STEP 2 — Check the rate limit
    // ----------------------------------------------------------
    // ratelimit.limit() returns:
    //   { success: boolean, limit, remaining, reset }
    //
    // "success" is false when the caller has exceeded their quota.
    const { success, limit, remaining, reset } = await ratelimit.limit(ip);

    // Include standard rate-limit headers so clients can
    // see how many requests they have left.
    const rateLimitHeaders = {
      "X-RateLimit-Limit": limit.toString(),
      "X-RateLimit-Remaining": remaining.toString(),
      "X-RateLimit-Reset": reset.toString(),
    };

    if (!success) {
      // 🚫 Rate limit exceeded
      console.log(`🚫 Rate limit exceeded for IP: ${ip}`);
      return NextResponse.json(
        {
          error: "Too many requests. Please try again later.",
          retryAfter: `${Math.ceil((reset - Date.now()) / 1000)} seconds`,
        },
        {
          status: 429,   // HTTP 429 = Too Many Requests
          headers: rateLimitHeaders,
        }
      );
    }

    // ----------------------------------------------------------
    // STEP 3 — Process the request (send OTP)
    // ----------------------------------------------------------
    // Parse the request body for the email address
    let body: { email?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Request body must be JSON with an "email" field.' },
        { status: 400 }
      );
    }

    const email = body.email;
    if (!email) {
      return NextResponse.json(
        { error: '"email" field is required.' },
        { status: 400 }
      );
    }

    // Generate a random 6-digit OTP (demo only — use a proper
    // library like `otplib` in production)
    const otp = Math.floor(100_000 + Math.random() * 900_000).toString();

    console.log(`📩 OTP ${otp} "sent" to ${email}  (remaining: ${remaining})`);

    return NextResponse.json(
      {
        message: `OTP sent to ${email} (demo — check server logs for the code).`,
        remaining,          // let the client know how many tries are left
      },
      {
        status: 200,
        headers: rateLimitHeaders,
      }
    );
  } catch (error) {
    console.error("🔥 Rate-limit check failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
