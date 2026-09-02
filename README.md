# 🚀 Upstash Redis + Next.js Enterprise Control Room

A production-ready reference architecture showcasing **10 advanced Redis enterprise design patterns**, **Live Supabase PostgreSQL database integration**, and a **TanStack React Query Cyber-Enterprise UI Dashboard**.

---

## ⚡ 10 Enterprise Redis Features Implemented

| # | Feature | Redis Data Structures & Patterns | Real-World Company Use Case |
|---|---|---|---|
| **1** | **Cache-Aside Pattern** | String `SET product:{id} <JSON> EX 60`, `GET` | High-traffic e-commerce product catalogs |
| **2** | **TTL & Auto Eviction** | `EXPIRE`, `TTL` | Temporary tokens, short-lived price feeds |
| **3** | **Sliding Window Rate Limiter** | `@upstash/ratelimit` (Sliding Window Algorithm) | OTP endpoints, DDoS/Brute-force protection |
| **4** | **Smart Cache Invalidation** | `DEL product:{id}`, `SCAN` | Catalog updates, inventory changes |
| **5** | **Search Query Cache & Trends** | String Caching + Sorted Sets `ZINCRBY trending:searches` | Popular search analytics (e.g. Amazon search bar) |
| **6** | **Live User Presence & Heartbeats** | Sorted Sets `ZADD presence:global <epoch> <userId>` + `ZREMRANGEBYSCORE` | Figma / Google Docs live active users |
| **7** | **Distributed Mutex Lock** | Atomic `SET resource:lock <uuid> NX EX 5` + Lua Script Unlock | Flash sales (PS5/Ticketmaster) without overselling |
| **8** | **Write-Through Mutation & Pre-Warm** | Synchronous DB + Redis Write + Pipeline `MSET` | Zero cold-start latency for top catalog items |
| **9** | **Inverted Search Index & 5-Tier Autocomplete** | Inverted Sets `idx:token:{w}`, `SINTER`, `SUNION`, Range Sets | Google/Amazon Weighted Hybrid Typeahead Search |
| **10** | **Asynchronous Job Queue & Worker** | Redis Lists `LPUSH` / `RPOP` + Job State JSON + Dead Letter Queue | Netflix video transcoding, PDF invoice generators |

---

## 🛠️ Tech Stack & Architecture

- **Framework:** Next.js 16 (App Router + Turbopack)
- **Frontend State Management:** `@tanstack/react-query` (TanStack Query v5)
- **Icons & Styling:** `lucide-react` + Vanilla CSS Cyber-Enterprise Dark Mode Design System
- **Redis Provider:** Upstash Serverless Redis (`@upstash/redis` + `@upstash/ratelimit`)
- **Primary Database:** Supabase PostgreSQL (`@supabase/supabase-js`) with automatic mock fallback

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create `.env.local` based on `.env.local.example`:
```env
UPSTASH_REDIS_REST_URL="https://your-upstash-redis-url.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_upstash_redis_token"
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Automated Integration Tests (10/10 PASS)

Run the full automated end-to-end integration test suite:
```bash
node test-redis-caching.mjs
```

---

## 📂 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── cache/                  # Cache warmup & key invalidation
│   │   ├── flash-sale/             # Distributed lock checkout & inventory
│   │   ├── presence/               # Live presence & heartbeat pings
│   │   ├── products/               # Cache-Aside & Write-Through endpoints
│   │   ├── queue/                  # Asynchronous Job Queue Producer & Worker
│   │   ├── search-index/           # Inverted Index Search & 5-Tier Typeahead
│   │   ├── supabase/               # Supabase database seeder
│   │   ├── login/ /me/ /otp/       # Stateless auth sessions & rate limiting
│   ├── globals.css                 # Cyber-Enterprise Dark Theme
│   ├── layout.tsx                  # Root layout with QueryProvider
│   └── page.tsx                    # Multi-tab interactive test control room
├── components/                     # Modular React Query components
│   ├── BenchmarkSection.tsx
│   ├── FlashSaleSection.tsx
│   ├── Header.tsx
│   ├── PresenceSection.tsx
│   ├── QueueSection.tsx
│   ├── RateLimitSection.tsx
│   ├── SearchSection.tsx
│   └── SessionSection.tsx
├── lib/
│   ├── db.ts                       # Supabase query abstraction & mock catalog
│   ├── queue.ts                    # Redis Job Queue Engine & Worker state machine
│   ├── redis.ts                    # Upstash Redis client singleton
│   ├── search-index.ts             # Inverted Index & 5-Tier Relevance Algorithm
│   └── supabase.ts                 # Supabase client singleton
└── providers/
    └── QueryProvider.tsx           # TanStack QueryClient Provider wrapper
```

---

## 🔗 Repository
GitHub: [https://github.com/anushashmani/redis.git](https://github.com/anushashmani/redis.git)
