// =============================================================
// lib/redis.ts — Reusable Upstash Redis Client
// =============================================================
// WHY a separate file?
//   → We create the Redis client ONCE and re-use it everywhere.
//     This avoids opening a new connection on every API request,
//     which would be slow and wasteful.
//
// Upstash's "@upstash/redis" package uses HTTP (REST) under the
// hood, so it works perfectly in serverless / edge environments
// like Next.js API routes — no persistent TCP connection needed.
// =============================================================

import { Redis } from "@upstash/redis";

// The Redis() constructor reads these two env vars automatically
// if you name them exactly UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN. But we pass them explicitly here so
// you can see what's happening — great for learning!
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,   // REST endpoint provided by Upstash
  token: process.env.UPSTASH_REDIS_REST_TOKEN!, // Auth token for that endpoint
});

export default redis;
