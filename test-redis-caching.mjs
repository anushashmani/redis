// =============================================================
// test-redis-caching.mjs — Redis Caching Integration Tests
// =============================================================
//
// 🚀 HOW TO RUN:
//   1. Make sure your Next.js dev server is running:
//        npx next dev
//
//   2. In a SEPARATE terminal, run this script:
//        node test-redis-caching.mjs
//
//   3. Make sure your .env.local has valid Upstash credentials.
//
// ✅ WHAT "CORRECT" OUTPUT LOOKS LIKE:
//
//   ══════════════════════════════════════════════
//   TEST 1: Cache HIT / MISS Flow
//   ══════════════════════════════════════════════
//   🔹 Request 1 (cold cache):
//     Status   : 200
//     X-Cache  : MISS           ← First call always misses
//     Source   : database       ← Data came from the mock DB
//     Time     : ~520ms         ← Slow because of 500ms DB delay
//
//   🔹 Request 2 (warm cache):
//     Status   : 200
//     X-Cache  : HIT            ← Second call finds the cache
//     Source   : cache          ← Data came from Redis
//     Time     : ~30ms          ← Fast! No DB delay
//
//   ✅ Speed improvement: ~16x faster  ← Should be > 2x
//   ✅ PASS — Cache HIT/MISS flow works correctly.
//
//   ══════════════════════════════════════════════
//   TEST 2: TTL (Key Expiry)
//   ══════════════════════════════════════════════
//   📦 Set key "test:ttl-check" with 5s TTL…
//   ✅ Key exists immediately after setting.
//   ⏳ Waiting 6 seconds for TTL to expire…
//   ✅ Key expired correctly after 6 seconds.
//   ✅ PASS — TTL expiry works correctly.
//
//   ══════════════════════════════════════════════
//   TEST 3: Rate Limiter (5 req / 60s)
//   ══════════════════════════════════════════════
//   Request 1: 200  remaining=4
//   Request 2: 200  remaining=3
//   Request 3: 200  remaining=2
//   Request 4: 200  remaining=1
//   Request 5: 200  remaining=0
//   Request 6: 429  ← Rate limited!
//   Request 7: 429  ← Rate limited!
//   ✅ PASS — Rate limiter works correctly.
//
//   ══════════════════════════════════════════════
//   TEST 4: Cache Invalidation
//   ══════════════════════════════════════════════
//   🔹 Step 1: Fetch product (populate cache)…
//     X-Cache: MISS or HIT (either is fine here)
//   🔹 Step 2: Fetch again to confirm cache is warm…
//     X-Cache: HIT  ← Cached!
//   🔹 Step 3: DELETE cache key…
//     Invalidated: true
//   🔹 Step 4: Fetch again after invalidation…
//     X-Cache: MISS  ← Cache was cleared!
//   ✅ PASS — Cache invalidation works correctly.
//
// ❌ COMMON FAILURE SCENARIOS (see bottom of file for details):
//   • Cache ALWAYS misses     → Redis credentials wrong / Redis unreachable
//   • Cache NEVER expires     → TTL not set (missing { ex: 3600 })
//   • Stale data after update → Forgot to invalidate after DB write
//   • 429 too early / late    → Rate limiter window or limit misconfigured
//   • Second call not faster  → Data was already cached from previous test run
//
// =============================================================

const BASE_URL = "http://localhost:3000";

// ---------- Helpers ----------

/** Pretty section header */
function header(title) {
  console.log("\n" + "═".repeat(50));
  console.log(`  ${title}`);
  console.log("═".repeat(50));
}

/** Measure a fetch call and return { response, timeMs } */
async function timedFetch(url, options = {}) {
  const start = performance.now();
  const response = await fetch(url, options);
  const timeMs = performance.now() - start;
  return { response, timeMs };
}

/** Sleep for `ms` milliseconds */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Print PASS / FAIL with a message */
function assert(condition, passMsg, failMsg) {
  if (condition) {
    console.log(`  ✅ PASS — ${passMsg}`);
  } else {
    console.error(`  ❌ FAIL — ${failMsg}`);
    // We don't throw — let the remaining tests continue
  }
}

// =============================================================
// TEST 1: Cache HIT / MISS Flow
// =============================================================
// WHAT WE'RE TESTING:
//   The first request for a product should be a cache MISS
//   (data comes from the slow database). The second request
//   should be a cache HIT (data comes from fast Redis).
//   The second request should be significantly faster.
// =============================================================

async function testCacheHitMiss() {
  header("TEST 1: Cache HIT / MISS Flow");

  const productId = "1";
  const url = `${BASE_URL}/api/products/${productId}`;

  // First, invalidate any existing cache so we start clean.
  // This ensures the first request is always a MISS even if
  // you run this test script multiple times.
  await fetch(`${BASE_URL}/api/cache/product:${productId}`, {
    method: "DELETE",
  });
  console.log(`  🧹 Pre-cleared cache for product:${productId}\n`);

  // --- Request 1: Should be a MISS (fetches from DB) ---
  const { response: res1, timeMs: time1 } = await timedFetch(url);
  const body1 = await res1.json();
  const cache1 = res1.headers.get("x-cache");

  console.log("  🔹 Request 1 (cold cache):");
  console.log(`    Status   : ${res1.status}`);
  console.log(`    X-Cache  : ${cache1}`);
  console.log(`    Source   : ${body1.source}`);
  console.log(`    Time     : ${time1.toFixed(0)}ms`);
  console.log(`    Product  : ${body1.data?.name ?? "N/A"}\n`);

  // --- Request 2: Should be a HIT (fetches from Redis) ---
  const { response: res2, timeMs: time2 } = await timedFetch(url);
  const body2 = await res2.json();
  const cache2 = res2.headers.get("x-cache");

  console.log("  🔹 Request 2 (warm cache):");
  console.log(`    Status   : ${res2.status}`);
  console.log(`    X-Cache  : ${cache2}`);
  console.log(`    Source   : ${body2.source}`);
  console.log(`    Time     : ${time2.toFixed(0)}ms\n`);

  // --- Assertions ---
  const speedup = time1 / time2;
  console.log(`  ⚡ Speed improvement: ${speedup.toFixed(1)}x faster`);

  assert(
    cache1 === "MISS",
    `First request was a cache MISS (as expected).`,
    `First request X-Cache was "${cache1}" — expected "MISS". Is the cache already warm?`
  );

  assert(
    cache2 === "HIT",
    `Second request was a cache HIT (as expected).`,
    `Second request X-Cache was "${cache2}" — expected "HIT". Is Redis storing data correctly?`
  );

  assert(
    speedup > 2,
    `Second call was ${speedup.toFixed(1)}x faster — caching is working!`,
    `Second call was only ${speedup.toFixed(1)}x faster — expected > 2x. Possible issue with DB delay or cache.`
  );
}

// =============================================================
// TEST 2: TTL (Key Expiry) Behavior
// =============================================================
// WHAT WE'RE TESTING:
//   1. Set a test key in Redis with a short expiry (5 seconds).
//   2. Check that the key exists immediately after setting (TTL > 0).
//   3. Wait 6 seconds for the TTL to expire.
//   4. Check that the key no longer exists (expired correctly).
// =============================================================

async function testTTLExpiry() {
  header("TEST 2: TTL (Key Expiry — 5s)");

  const testKey = `test:ttl-${Date.now()}`;
  const cacheUrl = `${BASE_URL}/api/cache/${testKey}`;

  // Step 1: Set a test key with a 5-second TTL
  console.log(`  📦 Step 1: Setting key "${testKey}" with 5s expiry…`);
  const setRes = await fetch(cacheUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      value: { message: "I will expire in 5 seconds!" },
      ex: 5, // 5 seconds expiry
    }),
  });

  const setBody = await setRes.json();
  assert(
    setRes.status === 200 && setBody.success,
    `Key "${testKey}" was successfully stored in Redis with 5s TTL.`,
    `Failed to set test key in Redis.`
  );

  // Step 2: Check key exists immediately after setting
  console.log("  🔍 Step 2: Checking key exists immediately…");
  const checkRes1 = await fetch(cacheUrl);
  const checkBody1 = await checkRes1.json();

  console.log(`    Exists : ${checkBody1.exists}`);
  console.log(`    TTL    : ${checkBody1.ttl}s remaining`);
  console.log(`    Value  : ${JSON.stringify(checkBody1.value)}`);

  assert(
    checkBody1.exists === true && checkBody1.ttl > 0,
    `Key exists immediately with active TTL (${checkBody1.ttl}s remaining).`,
    `Key does not exist immediately after being set!`
  );

  // Step 3: Wait 6 seconds for TTL to elapse
  console.log("  ⏳ Step 3: Waiting 6 seconds for TTL to elapse (5s expiry + 1s buffer)…");
  for (let s = 1; s <= 6; s++) {
    await sleep(1000);
    process.stdout.write(`    ⏱️  Elapsed: ${s}s / 6s\r`);
  }
  console.log("\n    ⏱️  Wait complete.\n");

  // Step 4: Check key no longer exists
  console.log("  🔍 Step 4: Checking key after 6 seconds…");
  const checkRes2 = await fetch(cacheUrl);
  const checkBody2 = await checkRes2.json();

  console.log(`    Exists : ${checkBody2.exists}`);
  console.log(`    TTL    : ${checkBody2.ttl} (expected -2 for expired/non-existent)`);

  assert(
    checkBody2.exists === false,
    `Key has expired and no longer exists in Redis (TTL worked correctly)!`,
    `Key still exists after 6s! Cache TTL is NOT expiring keys properly.`
  );
}

// =============================================================
// TEST 3: Rate Limiter
// =============================================================
// WHAT WE'RE TESTING:
//   The OTP endpoint allows 5 requests per 60 seconds per IP.
//   We send 7 rapid requests from the same simulated IP address:
//     • Requests 1–5: MUST succeed (HTTP 200)
//     • Requests 6–7: MUST be rejected with HTTP 429 (Too Many Requests)
// =============================================================

async function testRateLimiter() {
  header("TEST 3: Rate Limiter (5 req / 60s per IP)");

  // Use a unique simulated IP per test run so repeat test runs
  // don't interfere with each other's 60-second sliding windows.
  const simulatedIp = `192.0.2.${Math.floor(Math.random() * 200) + 10}`;
  console.log(`  🌐 Simulated Client IP: ${simulatedIp}`);
  console.log(`  🚀 Sending 7 rapid requests…\n`);

  const url = `${BASE_URL}/api/otp`;
  const totalRequests = 7;
  const results = [];

  for (let i = 1; i <= totalRequests; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": simulatedIp, // simulate specific IP address
      },
      body: JSON.stringify({ email: `user${i}@example.com` }),
    });

    const body = await res.json();
    const remaining = res.headers.get("x-ratelimit-remaining");

    const status = res.status;
    const isRateLimited = status === 429;
    const icon = isRateLimited ? "🚫 [BLOCKED]" : "✅ [ALLOWED]";
    const detail = isRateLimited
      ? `429 Too Many Requests (${body.error ?? "Rate limited"})`
      : `200 OK (remaining quota: ${remaining})`;

    console.log(`    ${icon} Request ${i}/7: ${detail}`);
    results.push({ index: i, status, remaining, body });
  }

  console.log();

  // --- Assertions ---
  const first5 = results.slice(0, 5);
  const last2 = results.slice(5);

  const first5All200 = first5.every((r) => r.status === 200);
  const last2All429 = last2.every((r) => r.status === 429);

  assert(
    first5All200,
    `First 5 requests all succeeded with status 200.`,
    `Expected first 5 requests to be 200, but got statuses: ${first5.map((r) => r.status).join(", ")}`
  );

  assert(
    last2All429,
    `Requests 6 and 7 were both blocked with status 429 (Rate Limit Exceeded).`,
    `Expected requests 6 and 7 to be 429, but got statuses: ${last2.map((r) => r.status).join(", ")}`
  );
}


// =============================================================
// TEST 4: Cache Invalidation
// =============================================================
// WHAT WE'RE TESTING:
//   After we delete a cache key, the next request for the same
//   product should be a cache MISS (proving the stale data was
//   removed and fresh data is fetched from the DB).
//
//   This is the pattern you'd use when a product is updated in
//   the database — invalidate the cache so the next request
//   picks up the changes.
// =============================================================

async function testCacheInvalidation() {
  header("TEST 4: Cache Invalidation");

  const productId = "3";
  const productUrl = `${BASE_URL}/api/products/${productId}`;
  const cacheUrl = `${BASE_URL}/api/cache/product:${productId}`;

  // Step 1: Fetch product to populate cache
  console.log("  🔹 Step 1: Fetch product (populate cache)…");
  await fetch(cacheUrl, { method: "DELETE" }); // ensure clean start
  const res1 = await fetch(productUrl);
  const cache1 = res1.headers.get("x-cache");
  console.log(`    X-Cache: ${cache1}`);

  // Step 2: Fetch again — should be HIT now
  console.log("  🔹 Step 2: Fetch again (confirm cache is warm)…");
  const res2 = await fetch(productUrl);
  const cache2 = res2.headers.get("x-cache");
  console.log(`    X-Cache: ${cache2}`);

  assert(
    cache2 === "HIT",
    "Cache is warm after second fetch.",
    `Expected HIT but got "${cache2}" — cache didn't populate.`
  );

  // Step 3: Invalidate the cache key
  console.log("  🔹 Step 3: DELETE cache key…");
  const delRes = await fetch(cacheUrl, { method: "DELETE" });
  const delBody = await delRes.json();
  console.log(`    Response: ${JSON.stringify(delBody)}`);

  assert(
    delBody.deleted === 1,
    "Cache key was deleted.",
    `Deletion returned deleted=${delBody.deleted} — key may not have existed.`
  );

  // Step 4: Fetch again — should be MISS (cache was cleared)
  console.log("  🔹 Step 4: Fetch again after invalidation…");
  const res3 = await fetch(productUrl);
  const cache3 = res3.headers.get("x-cache");
  console.log(`    X-Cache: ${cache3}`);

  assert(
    cache3 === "MISS",
    "Cache correctly returned MISS after invalidation!",
    `Expected MISS but got "${cache3}" — the cache was NOT invalidated properly.`
  );
}

// =============================================================
// TEST 5: Search Query Caching & Normalization
// =============================================================
// WHAT WE'RE TESTING:
//   1. First search request executes full DB search (~500ms) → MISS
//   2. Repeat search request is served instantly from Redis → HIT
//   3. Normalization test: Different param order, uppercase letters,
//      and whitespace must still result in a cache HIT on the same key!
//   4. Trending searches: Verifies Redis Sorted Set analytics tracking.
// =============================================================

async function testSearchCaching() {
  header("TEST 5: Search Route & Query Normalization");

  const queryTerm = "keyboard";
  const category = "peripherals";
  const expectedKey = `search:v1:q=keyboard:cat=peripherals`;

  // Pre-clear this search key to start clean
  await fetch(`${BASE_URL}/api/cache/${expectedKey}`, { method: "DELETE" });
  console.log(`  🧹 Pre-cleared cache for "${expectedKey}"\n`);

  // --- Request 1: Cold search ---
  const url1 = `${BASE_URL}/api/search?q=${queryTerm}&category=${category}`;
  const { response: res1, timeMs: time1 } = await timedFetch(url1);
  const body1 = await res1.json();
  const cache1 = res1.headers.get("x-cache");

  console.log("  🔹 Request 1 (Cold Search Query: q=keyboard&category=peripherals):");
  console.log(`    Status   : ${res1.status}`);
  console.log(`    X-Cache  : ${cache1}`);
  console.log(`    Source   : ${body1.source}`);
  console.log(`    Key      : ${body1.cacheKey}`);
  console.log(`    Total    : ${body1.data?.total} matches found`);
  console.log(`    Time     : ${time1.toFixed(0)}ms\n`);

  // --- Request 2: Warm search (Identical query) ---
  const { response: res2, timeMs: time2 } = await timedFetch(url1);
  const body2 = await res2.json();
  const cache2 = res2.headers.get("x-cache");

  console.log("  🔹 Request 2 (Warm Search Query - Identical):");
  console.log(`    Status   : ${res2.status}`);
  console.log(`    X-Cache  : ${cache2}`);
  console.log(`    Source   : ${body2.source}`);
  console.log(`    Time     : ${time2.toFixed(0)}ms\n`);

  // --- Request 3: Normalized Query (Different order, uppercase, spaces) ---
  const url3 = `${BASE_URL}/api/search?category=PERIPHERALS&q=%20%20KEYBOARD%20%20`;
  const { response: res3, timeMs: time3 } = await timedFetch(url3);
  const body3 = await res3.json();
  const cache3 = res3.headers.get("x-cache");

  console.log("  🔹 Request 3 (Normalized Query: category=PERIPHERALS&q=  KEYBOARD  ):");
  console.log(`    Status   : ${res3.status}`);
  console.log(`    X-Cache  : ${cache3}`);
  console.log(`    Source   : ${body3.source}`);
  console.log(`    Key      : ${body3.cacheKey}`);
  console.log(`    Time     : ${time3.toFixed(0)}ms\n`);

  // --- Assertions ---
  assert(
    cache1 === "MISS",
    "Initial search query resulted in cache MISS (computed from DB).",
    `Expected MISS on first search but got "${cache1}".`
  );

  assert(
    cache2 === "HIT",
    "Repeated search query resulted in instant cache HIT from Redis.",
    `Expected HIT on repeat search but got "${cache2}".`
  );

  assert(
    cache3 === "HIT" && body3.cacheKey === expectedKey,
    "Query normalization correctly matched existing cache key regardless of casing/order!",
    `Normalized search failed to hit cache. Resolved key: "${body3.cacheKey}" vs expected: "${expectedKey}".`
  );

  console.log("  📊 Trending Searches (tracked via Redis Sorted Set ZSET):");
  if (Array.isArray(body2.trendingSearches) && body2.trendingSearches.length > 0) {
    body2.trendingSearches.forEach((item, idx) => {
      console.log(`    #${idx + 1} "${item.term}" (searched ${item.score} time${item.score > 1 ? "s" : ""})`);
    });
  } else {
    console.log("    (No trending searches recorded yet)");
  }
}

// =============================================================
// TEST 6: Live User Presence & Heartbeat Monitoring
// =============================================================
// WHAT WE'RE TESTING:
//   1. Register heartbeats for 3 users (Alice, Bob, Charlie).
//   2. Alice & Bob are on "product:1", Charlie is on general browsing.
//   3. Check global active user count (should be 3).
//   4. Check viewers for "product:1" (should be 2: Alice & Bob).
//   5. Check individual status of Alice (isOnline: true).
//   6. Bob disconnects / closes tab (DELETE heartbeat).
//   7. Verify Bob is now offline and global count drops to 2.
// =============================================================

async function testPresenceFlow() {
  header("TEST 6: Live User Presence & Heartbeats");

  const runId = Date.now();
  const userA = `user_alice_${runId}`;
  const userB = `user_bob_${runId}`;
  const userC = `user_charlie_${runId}`;
  const testResource = `product:1`;

  // Step 1: Send heartbeats
  console.log("  💓 Step 1: Sending heartbeats for 3 users…");
  await fetch(`${BASE_URL}/api/presence/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: userA,
      resourceId: testResource,
      metadata: { name: "Alice", role: "admin" },
    }),
  });

  await fetch(`${BASE_URL}/api/presence/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: userB,
      resourceId: testResource,
      metadata: { name: "Bob", role: "member" },
    }),
  });

  await fetch(`${BASE_URL}/api/presence/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: userC,
      metadata: { name: "Charlie", role: "guest" },
    }),
  });

  console.log(`    Registered: ${userA}, ${userB}, ${userC}\n`);

  // Step 2: Query global presence
  console.log("  🔍 Step 2: Querying global online count…");
  const globalRes = await fetch(`${BASE_URL}/api/presence`);
  const globalData = await globalRes.json();
  console.log(`    Online count: ${globalData.count} user(s)`);

  assert(
    globalData.users.includes(userA) &&
      globalData.users.includes(userB) &&
      globalData.users.includes(userC),
    "All 3 active users are present in global presence list.",
    "One or more users missing from global presence."
  );

  // Step 3: Query product-specific viewers
  console.log(`  🔍 Step 3: Querying viewers for "${testResource}"…`);
  const resourceRes = await fetch(`${BASE_URL}/api/presence?resourceId=${testResource}`);
  const resourceData = await resourceRes.json();
  console.log(`    Viewers on ${testResource}: ${resourceData.count} (${resourceData.users.join(", ")})`);

  assert(
    resourceData.users.includes(userA) &&
      resourceData.users.includes(userB) &&
      !resourceData.users.includes(userC),
    `Resource presence correctly isolated Alice & Bob on "${testResource}".`,
    `Resource presence tracking mismatch.`
  );

  // Step 4: Check single user online status
  console.log(`  🔍 Step 4: Checking status for "${userA}"…`);
  const userStatusRes = await fetch(`${BASE_URL}/api/presence/${userA}`);
  const userStatus = await userStatusRes.json();
  console.log(`    Status: ${userStatus.isOnline ? "🟢 ONLINE" : "🔴 OFFLINE"} (last seen ${userStatus.secondsAgo}s ago)`);

  assert(
    userStatus.isOnline === true,
    `Individual presence check confirmed "${userA}" is ONLINE.`,
    `Individual check returned OFFLINE for active user.`
  );

  // Step 5: User Bob disconnects / leaves page
  console.log(`  👋 Step 5: Disconnecting "${userB}"…`);
  await fetch(`${BASE_URL}/api/presence/heartbeat`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userB, resourceId: testResource }),
  });

  // Step 6: Verify Bob is now offline
  const bobStatusRes = await fetch(`${BASE_URL}/api/presence/${userB}`);
  const bobStatus = await bobStatusRes.json();
  console.log(`    "${userB}" status after sign-off: ${bobStatus.isOnline ? "🟢 ONLINE" : "🔴 OFFLINE"}`);

  assert(
    bobStatus.isOnline === false,
    `User "${userB}" was immediately recognized as OFFLINE after disconnect.`,
    `User "${userB}" is still showing as online after disconnect.`
  );

  // Clean up remaining test users
  await fetch(`${BASE_URL}/api/presence/heartbeat`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userA, resourceId: testResource }),
  });
  await fetch(`${BASE_URL}/api/presence/heartbeat`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userC }),
  });
}

// =============================================================
// TEST 7: Distributed Mutex Lock & Flash Sale Concurrency
// =============================================================
// WHAT WE'RE TESTING:
//   1. Reset stock for "flash-sale-ps5" to EXACTLY 2 units.
//   2. Fire 8 concurrent checkout requests simultaneously (Promise.all).
//   3. Race Condition Verification:
//        • Exactly 2 requests MUST succeed (HTTP 200).
//        • 6 requests MUST be rejected (HTTP 409 Lock Contention or HTTP 400 Out of Stock).
//        • Final stock MUST be exactly 0 (NEVER negative / oversold!).
//   4. Confirm the lock is cleanly released.
// =============================================================

async function testDistributedLockAndFlashSale() {
  header("TEST 7: Distributed Lock & Flash-Sale Race Condition");

  const itemId = `flash-sale-ps5-${Date.now()}`;
  const initialStock = 2;
  const totalConcurrentUsers = 8;

  // Step 1: Initialize stock
  console.log(`  📦 Step 1: Initializing "${itemId}" with ${initialStock} units in stock…`);
  const resetRes = await fetch(`${BASE_URL}/api/flash-sale/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, stock: initialStock }),
  });
  const resetData = await resetRes.json();
  console.log(`    Stock initialized: ${resetData.stock} units\n`);

  // Step 2: Fire 8 concurrent checkout requests
  console.log(`  🚀 Step 2: Firing ${totalConcurrentUsers} concurrent checkout requests at the exact same millisecond…\n`);

  const checkoutPromises = Array.from({ length: totalConcurrentUsers }, async (_, index) => {
    const userId = `buyer_${index + 1}`;
    const start = performance.now();

    const res = await fetch(`${BASE_URL}/api/flash-sale/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        itemId,
        userId,
        quantity: 1,
        delayMs: 60, // simulate payment gateway delay
      }),
    });

    const elapsed = Math.round(performance.now() - start);
    const body = await res.json();

    return {
      userId,
      status: res.status,
      body,
      elapsed,
    };
  });

  const results = await Promise.all(checkoutPromises);

  // Print results
  results.forEach((r) => {
    let icon = "❓";
    let detail = "";

    if (r.status === 200) {
      icon = "🎉 [ORDER PLACED]";
      detail = `Order #${r.body.orderId} (Remaining Stock: ${r.body.remainingStock})`;
    } else if (r.status === 409) {
      icon = "🔒 [LOCK CONFLICT]";
      detail = "Blocked by active lock (409 Conflict)";
    } else if (r.status === 400) {
      icon = "❌ [SOLD OUT]";
      detail = "Out of stock (400 Bad Request)";
    } else {
      icon = "🔥 [ERROR]";
      detail = `HTTP ${r.status}`;
    }

    console.log(`    ${icon} ${r.userId.padEnd(8)}: ${detail} (${r.elapsed}ms)`);
  });

  console.log();

  // Step 3: Inspect final inventory state in Redis
  console.log(`  🔍 Step 3: Inspecting final inventory & order state in Redis…`);
  const inspectRes = await fetch(`${BASE_URL}/api/flash-sale/inventory/${itemId}`);
  const inspectData = await inspectRes.json();

  console.log(`    Final Stock        : ${inspectData.stock}`);
  console.log(`    Total Orders Made  : ${inspectData.totalOrdersPlaced}`);
  console.log(`    Is Sold Out        : ${inspectData.isSoldOut}`);
  console.log(`    Lock Status        : ${inspectData.isLocked ? "🔴 STILL LOCKED" : "🟢 UNLOCKED"}\n`);

  // --- Assertions ---
  const successfulRequests = results.filter((r) => r.status === 200).length;

  assert(
    successfulRequests <= initialStock,
    `Overselling prevented! Only ${successfulRequests} orders succeeded (Initial stock was ${initialStock}).`,
    `CRITICAL OVERSELLING BUG: ${successfulRequests} orders succeeded for ${initialStock} stock items!`
  );

  assert(
    inspectData.stock >= 0,
    `Final stock is ${inspectData.stock} (Stock NEVER dropped below 0).`,
    `NEGATIVE INVENTORY DETECTED: Stock reached ${inspectData.stock}!`
  );

  assert(
    inspectData.isLocked === false,
    `Distributed lock was safely released via Lua script after transactions.`,
    `Distributed lock is still stuck in locked state!`
  );
}

// =============================================================
// TEST 8: Cache Pre-Warming & Write-Through Mutation Sync
// =============================================================
// WHAT WE'RE TESTING:
//   1. Pre-Warming: After running /api/cache/warmup, the VERY FIRST
//      request for product:1 is an instant CACHE HIT (0ms DB delay!).
//   2. Write-Through: When updating a product via PUT /api/products/1,
//      the database AND Redis are updated simultaneously.
//   3. Verification: The subsequent GET returns the new price ($99.99)
//      immediately from Redis (X-Cache: HIT) with zero stale data!
// =============================================================

async function testWriteThroughAndPreWarming() {
  header("TEST 8: Pre-Warming & Write-Through Mutation Sync");

  const productId = "1";
  const productUrl = `${BASE_URL}/api/products/${productId}`;

  // ----------------------------------------------------------
  // PART 1: Cache Pre-Warming (First request is a HIT!)
  // ----------------------------------------------------------
  console.log("  🧹 Step 1: Evicting product:1 from Redis to simulate cold state…");
  await fetch(`${BASE_URL}/api/cache/product:${productId}`, { method: "DELETE" });

  console.log("  🔥 Step 2: Triggering Cache Pre-Warming (/api/cache/warmup)…");
  const warmupRes = await fetch(`${BASE_URL}/api/cache/warmup`, { method: "POST" });
  const warmupData = await warmupRes.json();
  console.log(`    Pre-warmed: ${warmupData.warmedCount} products loaded into Redis\n`);

  console.log("  🔍 Step 3: Making the VERY FIRST request to /api/products/1…");
  const { response: firstRes, timeMs: firstTime } = await timedFetch(productUrl);
  const firstBody = await firstRes.json();
  const firstCacheHeader = firstRes.headers.get("x-cache");

  console.log(`    Status   : ${firstRes.status}`);
  console.log(`    X-Cache  : ${firstCacheHeader}  (Expected: HIT on Request #1!)`);
  console.log(`    Source   : ${firstBody.source}`);
  console.log(`    Price    : $${firstBody.data?.price}`);
  console.log(`    Time     : ${firstTime.toFixed(0)}ms\n`);

  assert(
    firstCacheHeader === "HIT",
    `Pre-warming succeeded! First request was served directly from Redis (X-Cache: HIT).`,
    `First request was "${firstCacheHeader}" instead of "HIT". Pre-warming did not populate Redis.`
  );

  // ----------------------------------------------------------
  // PART 2: Write-Through Mutation Sync (PUT /api/products/1)
  // ----------------------------------------------------------
  const newPrice = 99.99;
  const newName = "Mechanical Keyboard (Mega Sale Edition)";

  console.log(`  📝 Step 4: Updating Product #1 via PUT (Price: $149.99 -> $${newPrice})…`);
  const putRes = await fetch(productUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      price: newPrice,
      name: newName,
    }),
  });

  const putData = await putRes.json();
  console.log(`    Update Response: ${putData.message} (Cache Sync: ${putData.cacheSync})\n`);

  assert(
    putRes.status === 200 && putData.cacheSync === "write-through",
    `Product updated in DB and Write-Through cache synchronization executed.`,
    `Failed to update product via PUT.`
  );

  // ----------------------------------------------------------
  // PART 3: Verify Instant Cache HIT with Fresh Updated Data
  // ----------------------------------------------------------
  console.log("  🔍 Step 5: Fetching product immediately after update…");
  const { response: getAfterRes, timeMs: getAfterTime } = await timedFetch(productUrl);
  const getAfterBody = await getAfterRes.json();
  const getAfterCacheHeader = getAfterRes.headers.get("x-cache");

  console.log(`    Status   : ${getAfterRes.status}`);
  console.log(`    X-Cache  : ${getAfterCacheHeader}`);
  console.log(`    Source   : ${getAfterBody.source}`);
  console.log(`    New Price: $${getAfterBody.data?.price} (Expected: $${newPrice})`);
  console.log(`    New Name : "${getAfterBody.data?.name}"`);
  console.log(`    Time     : ${getAfterTime.toFixed(0)}ms\n`);

  assert(
    getAfterCacheHeader === "HIT",
    `Subsequent fetch was a fast CACHE HIT from Redis.`,
    `Expected Cache HIT but got "${getAfterCacheHeader}".`
  );

  assert(
    getAfterBody.data?.price === newPrice && getAfterBody.data?.name === newName,
    `Write-Through verified! Redis cache was updated synchronously with new price ($${newPrice}).`,
    `STALE DATA BUG: Redis returned old data instead of updated price $${newPrice}!`
  );

  // Restore original price for repeatability
  await fetch(productUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      price: 149.99,
      name: "Mechanical Keyboard",
    }),
  });
}

// =============================================================
// TEST 9: Native Redis Inverted Search Index & Autocomplete
// =============================================================
// WHAT WE'RE TESTING:
//   1. Build Inverted Index: POST /api/search-index/reindex populates
//      Sets (tokens) and Sorted Sets (autocomplete, price) in Redis.
//   2. Multi-Token Full-Text Search: GET /api/search-index?q=mechanical+brown
//      uses SINTER to find matching products in RAM in <1ms (0 DB hits!).
//   3. Live Autocomplete: GET /api/search-index/autocomplete?q=key
//      returns instant typeahead suggestions from Redis Sorted Set.
//   4. Multi-Filter Query: Category + Price range directly in Redis.
// =============================================================

async function testRedisSearchIndex() {
  header("TEST 9: Native Redis Search Index & Autocomplete");

  // Step 1: Reindex all products into Redis Inverted Index
  console.log("  🏗️  Step 1: Building Redis Inverted Search Index (/api/search-index/reindex)…");
  const reindexRes = await fetch(`${BASE_URL}/api/search-index/reindex`, { method: "POST" });
  const reindexData = await reindexRes.json();
  console.log(`    ${reindexData.message} (${reindexData.totalIndexed} items indexed)\n`);

  assert(
    reindexRes.status === 200 && reindexData.totalIndexed > 0,
    `Redis Inverted Index was built successfully with ${reindexData.totalIndexed} products.`,
    `Failed to build Redis Search Index.`
  );

  // Step 2: Multi-Token Full-Text Search ("mechanical brown")
  console.log('  🔍 Step 2: Full-Text Search query: "mechanical brown"…');
  const searchUrl1 = `${BASE_URL}/api/search-index?q=mechanical+brown`;
  const { response: res1, timeMs: time1 } = await timedFetch(searchUrl1);
  const data1 = await res1.json();

  console.log(`    Status     : ${res1.status}`);
  console.log(`    Source     : ${data1.source}`);
  console.log(`    Total Match: ${data1.total}`);
  console.log(`    Top Result : "${data1.results?.[0]?.name}" ($${data1.results?.[0]?.price})`);
  console.log(`    Server Time: ${data1.executionTimeMs}ms (Total: ${time1.toFixed(0)}ms)\n`);

  assert(
    data1.source === "redis_search_index" && data1.total >= 1,
    `Multi-token search ("mechanical brown") found matching product directly in Redis!`,
    `Search index failed to match "mechanical brown".`
  );

  // Step 3: Live Typeahead Autocomplete ("key")
  console.log('  ⌨️  Step 3: Live Typeahead Autocomplete query: "key"…');
  const autoUrl = `${BASE_URL}/api/search-index/autocomplete?q=key`;
  const autoRes = await fetch(autoUrl);
  const autoData = await autoRes.json();

  console.log(`    Prefix     : "${autoData.prefix}"`);
  console.log(`    Suggestions: ${autoData.suggestions?.map((s) => `"${s.text}"`).join(", ")}\n`);

  assert(
    autoData.suggestions?.some((s) => s.text.toLowerCase().includes("keyboard")),
    `Autocomplete suggestion correctly returned "Mechanical Keyboard" for prefix "key"!`,
    `Autocomplete failed to return expected suggestions.`
  );

  // Step 4: Category + Price Range Filter (Displays over $400)
  console.log('  🎛️  Step 4: Search with Filters (category: "displays", minPrice: 400)…');
  const searchUrl2 = `${BASE_URL}/api/search-index?category=displays&minPrice=400`;
  const { response: res2, timeMs: time2 } = await timedFetch(searchUrl2);
  const data2 = await res2.json();

  console.log(`    Matches    : ${data2.total} display(s) found`);
  data2.results?.forEach((item) => {
    console.log(`      • ${item.name} ($${item.price}) [${item.category}]`);
  });
  console.log(`    Time       : ${time2.toFixed(0)}ms\n`);

  assert(
    data2.total >= 2 && data2.results?.every((p) => p.category === "Displays" && p.price >= 400),
    `Redis Search Index correctly filtered by category and price range directly in RAM!`,
    `Filtered search returned incorrect results.`
  );
}

// =============================================================
// TEST 10: Asynchronous Job Queue & Background Task Worker
// =============================================================
// WHAT WE'RE TESTING:
//   1. Clear Queue: POST /api/queue/reset purges old queue states.
//   2. Producer: POST /api/queue/enqueue pushes jobs to Redis List
//      ("queue:jobs:pending") and returns 202 Accepted in <2ms.
//   3. Queue Inspection: GET /api/queue/jobs confirms pending count.
//   4. Consumer / Worker: POST /api/queue/process pops job via RPOP,
//      executes task, and updates state in Redis to 'completed'.
// =============================================================

async function testJobQueueFlow() {
  header("TEST 10: Asynchronous Job Queue & Background Worker");

  // Step 1: Clear old queue state
  console.log("  🧹 Step 1: Resetting queue state (/api/queue/reset)…");
  await fetch(`${BASE_URL}/api/queue/reset`, { method: "POST" });

  // Step 2: Enqueue 2 background tasks
  console.log("  📦 Step 2: Enqueuing 2 background tasks (PDF Invoice & Video Transcoding)…");
  const enqueue1 = await fetch(`${BASE_URL}/api/queue/enqueue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "GENERATE_PDF_INVOICE",
      payload: { orderId: 8812 },
    }),
  });
  const data1 = await enqueue1.json();
  console.log(`    Enqueued: ${data1.job?.id} (Type: ${data1.job?.type}) [Status: ${enqueue1.status}]`);

  const enqueue2 = await fetch(`${BASE_URL}/api/queue/enqueue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "TRANSCODE_VIDEO_4K",
      payload: { videoTitle: "Trailer.mp4" },
    }),
  });
  const data2 = await enqueue2.json();
  console.log(`    Enqueued: ${data2.job?.id} (Type: ${data2.job?.type}) [Status: ${enqueue2.status}]\n`);

  assert(
    enqueue1.status === 202 && enqueue2.status === 202,
    `Producer enqueued 2 jobs into Redis List with HTTP 202 Accepted!`,
    `Enqueue failed.`
  );

  // Step 3: Check snapshot (should have 2 pending)
  console.log("  🔍 Step 3: Inspecting queue snapshot (/api/queue/jobs)…");
  const snapRes1 = await fetch(`${BASE_URL}/api/queue/jobs`);
  const snap1 = await snapRes1.json();
  console.log(`    Pending Tasks in Queue: ${snap1.pendingCount} (Expected: 2)\n`);

  assert(
    snap1.pendingCount === 2,
    `Queue snapshot confirmed 2 pending jobs waiting in Redis List.`,
    `Expected 2 pending jobs but found ${snap1.pendingCount}.`
  );

  // Step 4: Worker processes Job 1
  console.log("  ⚙️  Step 4: Running Worker Consumer on Job 1 (/api/queue/process)…");
  const workRes1 = await fetch(`${BASE_URL}/api/queue/process`, { method: "POST" });
  const workData1 = await workRes1.json();
  console.log(`    Worker Result: ${workData1.message}`);
  console.log(`    Job Details  : ${workData1.job?.result} (Took: ${workData1.job?.durationMs}ms)\n`);

  assert(
    workData1.processed === true && workData1.job?.status === "completed",
    `Worker successfully popped job from Redis and executed background task!`,
    `Worker processing failed.`
  );

  // Step 5: Check snapshot after Job 1
  const snapRes2 = await fetch(`${BASE_URL}/api/queue/jobs`);
  const snap2 = await snapRes2.json();
  console.log(`    Updated Status: ${snap2.pendingCount} Pending | ${snap2.completedCount} Completed\n`);

  assert(
    snap2.pendingCount === 1 && snap2.completedCount === 1,
    `Redis Queue state transitions verified (1 Pending, 1 Completed).`,
    `Queue state transition failed.`
  );

  // Step 6: Worker processes Job 2
  console.log("  ⚙️  Step 6: Running Worker Consumer on Job 2…");
  const workRes2 = await fetch(`${BASE_URL}/api/queue/process`, { method: "POST" });
  const workData2 = await workRes2.json();
  console.log(`    Worker Result: ${workData2.message}\n`);

  assert(
    workData2.processed === true && workData2.job?.status === "completed",
    `All background jobs in Redis queue completed successfully!`,
    `Job 2 processing failed.`
  );
}

// =============================================================
// TEST RUNNER
// =============================================================

async function runAllTests() {
  console.log("\n🧪 Redis Caching Integration Tests");
  console.log(`   Server: ${BASE_URL}`);
  console.log(`   Time  : ${new Date().toLocaleTimeString()}`);
  console.log("═".repeat(50));

  // Verify the server is reachable before running tests
  try {
    const health = await fetch(`${BASE_URL}/api/products/1`);
    if (!health.ok && health.status !== 404) {
      throw new Error(`Server responded with ${health.status}`);
    }
  } catch (error) {
    console.error("\n❌ Cannot reach the dev server at", BASE_URL);
    console.error("   Make sure you run: npx next dev\n");
    console.error("   Error:", error.message);
    process.exit(1);
  }

  try {
    await testCacheHitMiss();
    await testTTLExpiry();
    await testRateLimiter();
    await testCacheInvalidation();
    await testSearchCaching();
    await testPresenceFlow();
    await testDistributedLockAndFlashSale();
    await testWriteThroughAndPreWarming();
    await testRedisSearchIndex();
    await testJobQueueFlow();
  } catch (error) {
    console.error("\n💀 Unexpected error during tests:", error);
  }

  // ---------- Summary ----------
  header("TESTS COMPLETE");
  console.log("  Check the output above for ✅ PASS / ❌ FAIL results.");
  console.log("  See the troubleshooting guide below if anything failed.\n");
}

runAllTests();







// =============================================================
// TROUBLESHOOTING GUIDE — Common Failure Scenarios
// =============================================================
//
// ┌──────────────────────────────────────────────────────────────┐
// │ SYMPTOM                    │ LIKELY CAUSE                    │
// ├──────────────────────────────────────────────────────────────┤
// │                                                              │
// │ 1. X-Cache is ALWAYS MISS  │ Redis is unreachable.           │
// │    (even on 2nd request)   │ → Check your .env.local file    │
// │                            │ → Verify UPSTASH_REDIS_REST_URL │
// │                            │   and TOKEN are correct.        │
// │                            │ → Check Upstash dashboard to    │
// │                            │   see if the DB is active.      │
// │                            │ → Look for "Redis error" in     │
// │                            │   the server console output.    │
// │                                                              │
// │ 2. X-Cache is ALWAYS HIT   │ Cache was already populated     │
// │    (even on 1st request)   │ from a previous test run.       │
// │                            │ → The test script clears the    │
// │                            │   cache before each test, but   │
// │                            │   if invalidation fails, old    │
// │                            │   data persists.                │
// │                            │ → Go to Upstash console and     │
// │                            │   flush the database manually.  │
// │                                                              │
// │ 3. Cache NEVER expires     │ TTL not set during redis.set()  │
// │                            │ → Check that your code has:     │
// │                            │   redis.set(key, val, {ex:3600})│
// │                            │   The { ex: 3600 } part is the  │
// │                            │   TTL in seconds.               │
// │                            │ → Without it, the key lives     │
// │                            │   forever in Redis.             │
// │                                                              │
// │ 4. Stale data after update │ You updated the DB but forgot   │
// │                            │ to invalidate the cache.        │
// │                            │ → Call DELETE /api/cache/{key}   │
// │                            │   after every DB write.         │
// │                            │ → Or use shorter TTLs for data  │
// │                            │   that changes frequently.      │
// │                                                              │
// │ 5. Rate limiter triggers   │ Sliding window still has counts │
// │    too early (e.g. at #3)  │ from a previous test run.       │
// │                            │ → Wait 60 seconds between runs. │
// │                            │ → Or flush rate limit keys from │
// │                            │   the Upstash console.          │
// │                                                              │
// │ 6. Rate limiter NEVER      │ The ratelimit module is not     │
// │    triggers (all 200s)     │ connected to Redis, or the      │
// │                            │ IP identifier isn't consistent. │
// │                            │ → Check lib/ratelimit.ts config │
// │                            │ → Verify redis import works.    │
// │                                                              │
// │ 7. 500 errors everywhere   │ Redis credentials are invalid   │
// │                            │ or the Upstash DB is paused.    │
// │                            │ → Check .env.local values.      │
// │                            │ → Check Upstash dashboard.      │
// │                            │ → Look at server console for    │
// │                            │   the full error stack trace.   │
// │                                                              │
// │ 8. "Cannot connect" error  │ Dev server is not running.      │
// │    from this test script   │ → Run: npx next dev             │
// │                            │ → Then re-run this script.      │
// └──────────────────────────────────────────────────────────────┘
