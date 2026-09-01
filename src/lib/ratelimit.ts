// =============================================================
// lib/ratelimit.ts — Upstash Rate Limiter (reusable)
// =============================================================
// Rate limiting protects your API from abuse (brute-force attacks,
// bots, accidental infinite loops in a client, etc.).
//
// @upstash/ratelimit stores counters in Redis, so it works across
// multiple serverless instances — every function invocation shares
// the same counter via the same Redis database.
//
// ALGORITHM — "Sliding Window"
//   Upstash supports three algorithms:
//     • fixedWindow  — simple, but bursty at window boundaries
//     • slidingWindow — smoother, avoids boundary bursts ✅ (we use this)
//     • tokenBucket  — good for steady throughput
// =============================================================

import { Ratelimit } from "@upstash/ratelimit";
import redis from "@/lib/redis";

/**
 * Allow a maximum of 5 requests per 60-second sliding window.
 * The identifier (IP address, user ID, API key, etc.) is passed
 * when you call `ratelimit.limit(identifier)`.
 */
const ratelimit = new Ratelimit({
  redis,                             // our shared Upstash Redis client
  limiter: Ratelimit.slidingWindow(
    5,   // max 5 requests …
    "60 s" // … per 60-second window
  ),
  analytics: true,                   // optional: sends usage stats to Upstash dashboard
  prefix: "@upstash/ratelimit",      // key prefix in Redis (default)
});

export default ratelimit;
