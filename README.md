# Upstash Redis + Next.js 14+ Enterprise Architecture

A comprehensive, production-ready reference implementation demonstrating modern Redis caching strategies, distributed concurrency patterns, real-time presence tracking, and in-memory search indexing in a Next.js 14+ (App Router) serverless architecture.

---

## ⚡ Architectural Features & Implemented Flows

| Flow | Pattern | Redis Commands | Key Benefit |
|---|---|---|---|
| **1. Product Lookup** | Cache-Aside with Graceful DB Fallback | `GET`, `SET EX 3600` | Reduces database load; falls back to DB if Redis is offline |
| **2. Product Updates** | Write-Through Cache Synchronization | `SET EX` (on PUT) | 0ms stale data; updates cache synchronously on DB mutation |
| **3. Cold-Start Elimination** | Eager Cache Pre-Warming | `pipeline.set(..., EX)` | 0ms latency even on the very first user request after deployment |
| **4. Live Autocomplete** | Google/Amazon Hybrid Typeahead | `idx:doc:*`, Pipeline | Instant suggestions as-you-type with weighted relevance |
| **5. Full-Text Search** | Inverted Index Multi-Token Search | `SINTER`, `SUNION`, `ZSET` | Multi-token set intersection in RAM in <1ms without hitting SQL DB |
| **6. Flash-Sale Concurrency** | Distributed Mutex Lock & Stock Safety | `SET NX EX`, Lua `EVAL` | Prevents overselling and race conditions under extreme traffic |
| **7. Live User Presence** | Real-Time Heartbeat & Viewer Counter | `ZADD`, `ZRANGE`, `ZREMRANGEBYSCORE` | Tracks active users and isolated page viewers with auto-pruning |
| **8. API Protection** | Sliding-Window Rate Limiting | `@upstash/ratelimit` | Prevents brute-force, DDoS, and runaway third-party API bills |
| **9. Serverless Auth** | Stateless Session Store | `SET EX 1800`, `GET`, `TTL` | Fast microsecond session validation via Bearer token |

---

## 📁 Project Directory Structure

```
src/
├── lib/
│   ├── redis.ts                 ← Shared Upstash Redis REST client instance
│   ├── search-index.ts          ← Native Redis Inverted Search Index Engine & Autocomplete
│   ├── lock.ts                  ← Distributed Mutex Lock with atomic Lua script releases
│   ├── inventory.ts             ← Flash-sale inventory manager & concurrency checkout engine
│   ├── db.ts                    ← Mock database layer (500ms latency, search filters, mutations)
│   └── ratelimit.ts             ← Reusable sliding-window rate limiter (@upstash/ratelimit)
└── app/
    └── api/
        ├── search-index/
        │   ├── route.ts         ← Full-text multi-token search in Redis (GET)
        │   ├── autocomplete/route.ts ← Instant typeahead suggestions (GET)
        │   └── reindex/route.ts ← Rebuild Redis inverted index (POST)
        ├── products/
        │   └── [id]/route.ts    ← Cache-Aside (GET), Write-Through (PUT), Purge (DELETE)
        ├── cache/
        │   ├── warmup/route.ts   ← Eager Cache Pre-Warming pipeline (POST)
        │   └── [key]/route.ts    ← Direct inspection (GET), override (POST), invalidation (DELETE)
        ├── search/
        │   └── route.ts         ← Normalized query caching & Trending terms via ZSET (GET)
        ├── flash-sale/
        │   ├── checkout/route.ts ← Concurrency-protected checkout with lock (POST)
        │   ├── inventory/[itemId]/route.ts ← Real-time stock & order tracker (GET)
        │   └── reset/route.ts    ← Stock reset endpoint for stress tests (POST)
        ├── presence/
        │   ├── heartbeat/route.ts ← Keepalive pings & disconnects (POST/DELETE)
        │   ├── route.ts          ← Global & resource-specific online counts (GET)
        │   └── [userId]/route.ts ← Single user online status & last seen (GET)
        ├── otp/
        │   └── route.ts         ← Sliding-window rate-limited OTP sender (POST)
        ├── login/
        │   └── route.ts         ← Stateless session generation with 30-min TTL (POST)
        └── me/
            └── route.ts         ← Bearer token session validation (GET)

test-redis-caching.mjs            ← Automated integration test suite (9 test scenarios)
.env.local.example               ← Template for required Upstash environment variables
```

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/anushashmani/redis.git
cd redis
npm install
```

### 2. Configure Environment Variables
Create a free Redis database at [Upstash Console](https://console.upstash.com).

Copy `.env.local.example` to `.env.local`:
```bash
cp .env.local.example .env.local
```

Add your credentials in `.env.local`:
```env
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-rest-token-here
```

### 3. Run the Development Server
```bash
npm run dev
```

---

## 🧪 Automated Integration Test Suite

A standalone, zero-dependency Node.js test script verifies all 9 Redis flows:

```bash
node test-redis-caching.mjs
```

### Tests Covered:
- ✅ **Test 1:** Cache HIT / MISS Latency Flow (>2x speedup)
- ✅ **Test 2:** Dynamic TTL & Key Auto-Expiry (5s TTL)
- ✅ **Test 3:** Sliding Window Rate Limiter (5 req / 60s -> HTTP 429)
- ✅ **Test 4:** Cache Invalidation & Purge Flow
- ✅ **Test 5:** Query Normalization & Trending Searches via `ZSET`
- ✅ **Test 6:** Live User Presence, Viewers Count & Heartbeat Monitoring
- ✅ **Test 7:** Distributed Mutex Lock & Flash Sale Concurrency Protection
- ✅ **Test 8:** Cache Pre-Warming & Write-Through Mutation Synchronization
- ✅ **Test 9:** Native Redis Inverted Search Index & Typeahead Autocomplete

---

## 📜 License
MIT License.
