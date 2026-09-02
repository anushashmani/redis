"use client";

import React, { useState, useEffect, useRef } from "react";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<
    "benchmark" | "search" | "flashsale" | "presence" | "ratelimit" | "session"
  >("benchmark");

  // Global latency / logs
  const [globalStats, setGlobalStats] = useState({
    totalRequests: 0,
    lastLatency: 0,
    lastStatus: "Ready",
  });

  // ==========================================================
  // TAB 1: Benchmark (Cache vs Supabase Live DB)
  // ==========================================================
  const [selectedProductId, setSelectedProductId] = useState("1");
  const [productData, setProductData] = useState<any>(null);
  const [productHeaders, setProductHeaders] = useState<any>(null);
  const [benchmarkTime, setBenchmarkTime] = useState<number | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [editName, setEditName] = useState("");
  const [updateMsg, setUpdateMsg] = useState("");

  const fetchProduct = async (id = selectedProductId) => {
    setLoadingProduct(true);
    setUpdateMsg("");
    const start = performance.now();
    try {
      const res = await fetch(`/api/products/${id}`);
      const elapsed = Number((performance.now() - start).toFixed(1));
      const cacheHeader = res.headers.get("X-Cache") || "UNKNOWN";
      const sourceHeader = res.headers.get("X-Source") || "unknown";
      const data = await res.json();

      setBenchmarkTime(elapsed);
      setProductData(data.data || data);
      setProductHeaders({
        cache: cacheHeader,
        source: sourceHeader,
        status: res.status,
      });

      if (data.data) {
        setEditPrice(String(data.data.price));
        setEditName(data.data.name);
      }

      setGlobalStats((prev) => ({
        totalRequests: prev.totalRequests + 1,
        lastLatency: elapsed,
        lastStatus: `Product #${id} (${cacheHeader} in ${elapsed}ms)`,
      }));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingProduct(false);
    }
  };

  const updateProductWriteThrough = async () => {
    if (!editPrice || !editName) return;
    setLoadingProduct(true);
    try {
      const res = await fetch(`/api/products/${selectedProductId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          price: parseFloat(editPrice),
        }),
      });
      const data = await res.json();
      setUpdateMsg(`✅ Updated in DB & Write-Through synchronized into Redis!`);
      // Immediately fetch again to show instant HIT
      await fetchProduct(selectedProductId);
    } catch (err: any) {
      setUpdateMsg(`❌ Update failed: ${err.message}`);
    } finally {
      setLoadingProduct(false);
    }
  };

  const preWarmCatalog = async () => {
    setLoadingProduct(true);
    try {
      const res = await fetch("/api/cache/warmup", { method: "POST" });
      const data = await res.json();
      setUpdateMsg(`🔥 ${data.message} (${data.totalPreWarmed} items cached)`);
    } catch (err: any) {
      setUpdateMsg(`❌ Warmup failed: ${err.message}`);
    } finally {
      setLoadingProduct(false);
    }
  };

  const invalidateProductCache = async () => {
    try {
      await fetch(`/api/cache/product:${selectedProductId}`, { method: "DELETE" });
      setUpdateMsg(`🧹 Evicted "product:${selectedProductId}" from Redis cache.`);
      setProductHeaders(null);
    } catch (err: any) {
      console.error(err);
    }
  };

  // ==========================================================
  // TAB 2: Google & Amazon Search & Autocomplete
  // ==========================================================
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchEngineStats, setSearchEngineStats] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("1000");
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search-index/autocomplete?q=${encodeURIComponent(searchQuery)}`
        );
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch (err) {
        console.error(err);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const runFullTextSearch = async (overrideQuery?: string) => {
    const q = overrideQuery !== undefined ? overrideQuery : searchQuery;
    const start = performance.now();
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (selectedCategory) params.set("category", selectedCategory);
      if (maxPrice) params.set("maxPrice", maxPrice);

      const res = await fetch(`/api/search-index?${params.toString()}`);
      const data = await res.json();
      const elapsed = Number((performance.now() - start).toFixed(1));

      setSearchResults(data.results || []);
      setSearchEngineStats({
        total: data.total,
        serverTimeMs: data.executionTimeMs,
        clientTimeMs: elapsed,
        matchedTokens: data.matchedTokens,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const reindexCatalog = async () => {
    setReindexing(true);
    try {
      const res = await fetch("/api/search-index/reindex", { method: "POST" });
      const data = await res.json();
      alert(`✅ ${data.message} (${data.totalIndexed} items indexed)`);
      runFullTextSearch();
    } catch (err: any) {
      alert(`❌ Reindex failed: ${err.message}`);
    } finally {
      setReindexing(false);
    }
  };

  // ==========================================================
  // TAB 3: Flash Sale & Distributed Lock
  // ==========================================================
  const [flashItemId, setFlashItemId] = useState("ps5-limited-edition");
  const [flashStock, setFlashStock] = useState<number | null>(null);
  const [flashOrders, setFlashOrders] = useState<any[]>([]);
  const [isSoldOut, setIsSoldOut] = useState(false);
  const [concurrencyLogs, setConcurrencyLogs] = useState<any[]>([]);
  const [simulatingTraffic, setSimulatingTraffic] = useState(false);

  const fetchFlashInventory = async () => {
    try {
      const res = await fetch(`/api/flash-sale/inventory/${flashItemId}`);
      const data = await res.json();
      setFlashStock(data.stock);
      setFlashOrders(data.orders || []);
      setIsSoldOut(data.isSoldOut);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === "flashsale") {
      fetchFlashInventory();
    }
  }, [activeTab, flashItemId]);

  const resetStock = async (units = 3) => {
    try {
      await fetch("/api/flash-sale/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: flashItemId, stock: units }),
      });
      setConcurrencyLogs([]);
      fetchFlashInventory();
    } catch (err) {
      console.error(err);
    }
  };

  const runConcurrentCheckouts = async (buyerCount = 8) => {
    setSimulatingTraffic(true);
    setConcurrencyLogs([]);

    const buyers = Array.from({ length: buyerCount }, (_, i) => ({
      userId: `buyer_${i + 1}@example.com`,
      id: i + 1,
    }));

    // Fire all requests at the exact same millisecond
    const promises = buyers.map(async (buyer) => {
      const start = performance.now();
      try {
        const res = await fetch("/api/flash-sale/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: flashItemId, userId: buyer.userId }),
        });
        const elapsed = Number((performance.now() - start).toFixed(0));
        const data = await res.json();
        return {
          buyerId: buyer.id,
          user: buyer.userId,
          status: res.status,
          success: res.status === 200,
          conflict: res.status === 409,
          soldOut: res.status === 400,
          message: data.message || data.error,
          remainingStock: data.remainingStock,
          elapsed,
        };
      } catch (err: any) {
        return {
          buyerId: buyer.id,
          user: buyer.userId,
          status: 500,
          error: err.message,
        };
      }
    });

    const results = await Promise.all(promises);
    setConcurrencyLogs(results);
    setSimulatingTraffic(false);
    fetchFlashInventory();
  };

  // ==========================================================
  // TAB 4: Live Presence & Heartbeats
  // ==========================================================
  const [isHeartbeatActive, setIsHeartbeatActive] = useState(false);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [myUserId, setMyUserId] = useState("user_" + Math.floor(Math.random() * 9000 + 1000));
  const heartbeatIntervalRef = useRef<any>(null);

  const fetchPresence = async () => {
    try {
      const res = await fetch("/api/presence");
      const data = await res.json();
      setOnlineCount(data.onlineCount || 0);
      setOnlineUsers(data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === "presence") {
      fetchPresence();
    }
  }, [activeTab]);

  useEffect(() => {
    if (isHeartbeatActive) {
      const sendPing = async () => {
        try {
          await fetch("/api/presence/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: myUserId, resourceId: "product:1" }),
          });
          fetchPresence();
        } catch (err) {
          console.error(err);
        }
      };

      sendPing();
      heartbeatIntervalRef.current = setInterval(sendPing, 4000);
    } else {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    }
    return () => {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [isHeartbeatActive, myUserId]);

  const disconnectUser = async () => {
    setIsHeartbeatActive(false);
    try {
      await fetch("/api/presence/heartbeat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: myUserId }),
      });
      fetchPresence();
    } catch (err) {
      console.error(err);
    }
  };

  // ==========================================================
  // TAB 5: Rate Limiting
  // ==========================================================
  const [otpQuota, setOtpQuota] = useState<{
    remaining: number | null;
    limit: number;
    resetTime: string | null;
    lastStatus: number | null;
  }>({
    remaining: null,
    limit: 5,
    resetTime: null,
    lastStatus: null,
  });
  const [otpLogs, setOtpLogs] = useState<any[]>([]);

  const sendOtpRequest = async () => {
    const start = performance.now();
    try {
      const res = await fetch("/api/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });
      const elapsed = Number((performance.now() - start).toFixed(0));
      const remaining = res.headers.get("X-RateLimit-Remaining");
      const reset = res.headers.get("X-RateLimit-Reset");
      const data = await res.json();

      const newEntry = {
        time: new Date().toLocaleTimeString(),
        status: res.status,
        remaining: remaining !== null ? Number(remaining) : null,
        message: data.message || data.error,
        retryAfter: data.retryAfter,
        elapsed,
      };

      setOtpLogs((prev) => [newEntry, ...prev.slice(0, 9)]);
      setOtpQuota({
        remaining: remaining !== null ? Number(remaining) : 0,
        limit: 5,
        resetTime: reset ? new Date(Number(reset)).toLocaleTimeString() : null,
        lastStatus: res.status,
      });
    } catch (err: any) {
      console.error(err);
    }
  };

  const spamOtpRequests = async () => {
    for (let i = 0; i < 6; i++) {
      await sendOtpRequest();
      await new Promise((r) => setTimeout(r, 100));
    }
  };

  // ==========================================================
  // TAB 6: Stateless Session Auth & Cache Inspector
  // ==========================================================
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [sessionId, setSessionId] = useState("");
  const [sessionTTL, setSessionTTL] = useState<number | null>(null);
  const [inspectKey, setInspectKey] = useState("product:1");
  const [inspectedKeyData, setInspectedKeyData] = useState<any>(null);

  const loginSession = async (email: string) => {
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: "password123" }),
      });
      const data = await res.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
        validateSession(data.sessionId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const validateSession = async (token = sessionId) => {
    if (!token) return;
    try {
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSessionUser(data.user);
        setSessionTTL(data.expiresInSeconds);
      } else {
        setSessionUser(null);
        setSessionTTL(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const inspectRedisKey = async () => {
    if (!inspectKey) return;
    try {
      const res = await fetch(`/api/cache/${encodeURIComponent(inspectKey)}`);
      const data = await res.json();
      setInspectedKeyData(data);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ padding: "30px 24px", maxWidth: "1280px", margin: "0 auto" }}>
      {/* ----------------- Header Banner ----------------- */}
      <header
        className="glass-panel"
        style={{
          padding: "24px 30px",
          marginBottom: "28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "18px",
          background: "linear-gradient(135deg, rgba(18,24,38,0.85) 0%, rgba(10,14,26,0.95) 100%)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <span style={{ fontSize: "26px" }}>⚡</span>
            <h1 style={{ fontSize: "24px", fontWeight: "800", letterSpacing: "-0.02em" }}>
              Upstash Redis + Next.js Live Control Room
            </h1>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
            Real-time interactive testing console for Redis caching, Supabase Live PostgreSQL, Mutex Locks, and Inverted Search.
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="badge badge-hit">
            <span className="pulse-dot"></span>
            Redis Active
          </div>
          <div className="badge badge-bypass">
            🐘 Supabase Connected
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              padding: "6px 14px",
              borderRadius: "10px",
              fontSize: "13px",
              fontFamily: "var(--font-mono)",
            }}
          >
            ⏱️ {globalStats.lastLatency}ms ({globalStats.totalRequests} reqs)
          </div>
        </div>
      </header>

      {/* ----------------- Navigation Tabs ----------------- */}
      <nav
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "24px",
          overflowX: "auto",
          paddingBottom: "4px",
        }}
      >
        {[
          { id: "benchmark", label: "⚡ Cache vs Live DB", icon: "⚡" },
          { id: "search", label: "🔍 Google/Amazon Search", icon: "🔍" },
          { id: "flashsale", label: "🛡️ Flash Sale & Mutex Lock", icon: "🛡️" },
          { id: "presence", label: "🟢 Live Presence", icon: "🟢" },
          { id: "ratelimit", label: "🛑 Rate Limiting (OTP)", icon: "🛑" },
          { id: "session", label: "🔐 Sessions & Inspector", icon: "🔐" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={activeTab === tab.id ? "btn-primary" : "btn-secondary"}
            style={{ whiteSpace: "nowrap" }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* ========================================================== */}
      {/* TAB 1: BENCHMARK (CACHE VS SUPABASE LIVE DB)               */}
      {/* ========================================================== */}
      {activeTab === "benchmark" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "24px" }}>
          {/* Action Box */}
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🚀</span> Product Query & Cache-Aside Controls
            </h2>

            <div style={{ marginBottom: "18px" }}>
              <label style={{ fontSize: "13px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                Select Product ID to Fetch:
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {["1", "2", "3", "4", "5", "6", "7", "8"].map((id) => (
                  <button
                    key={id}
                    onClick={() => {
                      setSelectedProductId(id);
                      fetchProduct(id);
                    }}
                    className={selectedProductId === id ? "btn-primary" : "btn-secondary"}
                    style={{ minWidth: "38px", justifyContent: "center" }}
                  >
                    #{id}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
              <button onClick={() => fetchProduct()} className="btn-primary" disabled={loadingProduct}>
                {loadingProduct ? "Fetching..." : "Fetch Product (GET)"}
              </button>
              <button onClick={preWarmCatalog} className="btn-secondary" title="Loads entire catalog into Redis">
                🔥 Pre-Warm All 8 Items
              </button>
              <button onClick={invalidateProductCache} className="btn-danger">
                🧹 Bust Cache (DELETE)
              </button>
            </div>

            {updateMsg && (
              <div
                style={{
                  background: "rgba(16, 185, 129, 0.1)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  color: "var(--accent-emerald)",
                  fontSize: "13px",
                  marginBottom: "16px",
                }}
              >
                {updateMsg}
              </div>
            )}

            {/* Write-Through Updater */}
            <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "18px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "var(--accent-cyan)" }}>
                📝 Test Write-Through Sync (Update DB & Overwrite Cache):
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px", marginBottom: "10px" }}>
                <input
                  type="text"
                  placeholder="Product Name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                    padding: "8px 12px",
                    borderRadius: "8px",
                  }}
                />
                <input
                  type="number"
                  placeholder="Price"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                    padding: "8px 12px",
                    borderRadius: "8px",
                  }}
                />
              </div>
              <button onClick={updateProductWriteThrough} className="btn-secondary" style={{ width: "100%", justifyContent: "center" }}>
                Save in DB + Synchronize Redis Cache (PUT)
              </button>
            </div>
          </div>

          {/* Response & Speedometer */}
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>📊 Real-Time Latency Meter</span>
              {productHeaders && (
                <span
                  className={
                    productHeaders.cache === "HIT"
                      ? "badge badge-hit"
                      : productHeaders.cache === "MISS"
                      ? "badge badge-miss"
                      : "badge badge-bypass"
                  }
                >
                  {productHeaders.cache === "HIT" ? "⚡ CACHE HIT (RAM)" : "🐘 CACHE MISS (LIVE DB)"}
                </span>
              )}
            </h2>

            {benchmarkTime !== null ? (
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "14px" }}>
                  <span style={{ fontSize: "36px", fontWeight: "800", color: benchmarkTime < 50 ? "var(--accent-emerald)" : "var(--accent-amber)" }}>
                    {benchmarkTime} ms
                  </span>
                  <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                    Source: <strong>{productHeaders?.source || "unknown"}</strong>
                  </span>
                </div>

                {/* Progress Bar Visual */}
                <div style={{ background: "rgba(255,255,255,0.08)", height: "10px", borderRadius: "5px", overflow: "hidden", marginBottom: "18px" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, (benchmarkTime / 500) * 100)}%`,
                      background:
                        benchmarkTime < 50
                          ? "linear-gradient(90deg, #10b981, #00f2fe)"
                          : "linear-gradient(90deg, #f59e0b, #f43f5e)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>

                {/* Product Card */}
                {productData && (
                  <div
                    style={{
                      background: "rgba(0,0,0,0.3)",
                      padding: "16px",
                      borderRadius: "12px",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ fontWeight: "700", fontSize: "16px" }}>{productData.name}</span>
                      <span style={{ color: "var(--accent-cyan)", fontWeight: "700" }}>${productData.price}</span>
                    </div>
                    <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "8px" }}>
                      {productData.description}
                    </p>
                    <div style={{ display: "flex", gap: "8px", fontSize: "12px" }}>
                      <span className="badge badge-bypass">{productData.category}</span>
                      <span className={productData.inStock ? "badge badge-hit" : "badge badge-blocked"}>
                        {productData.inStock ? "In Stock" : "Out of Stock"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                Click <strong>"Fetch Product"</strong> to measure latency!
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 2: GOOGLE & AMAZON TYPEAHEAD SEARCH                    */}
      {/* ========================================================== */}
      {activeTab === "search" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div className="glass-panel" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: "700" }}>🔍 Google & Amazon Enterprise Hybrid Search</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
                  Instant Typeahead Autocomplete with 5-Tier Weighted Relevance Ranking running 100% in Redis RAM.
                </p>
              </div>
              <button onClick={reindexCatalog} className="btn-secondary" disabled={reindexing}>
                {reindexing ? "Reindexing..." : "🔄 Rebuild Redis Inverted Index"}
              </button>
            </div>

            {/* Live Search Input & Autocomplete Dropdown */}
            <div style={{ position: "relative", marginBottom: "16px" }}>
              <input
                type="text"
                placeholder='Type e.g. "k", "key", "phone", "brown switch", "displays"...'
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSuggestions([]);
                    runFullTextSearch();
                  }
                }}
                style={{
                  width: "100%",
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid var(--border-focus)",
                  color: "var(--text-primary)",
                  padding: "14px 18px",
                  borderRadius: "12px",
                  fontSize: "16px",
                  boxShadow: "0 0 20px rgba(0,242,254,0.1)",
                }}
              />

              {/* Instant Autocomplete Suggestions */}
              {suggestions.length > 0 && (
                <div
                  className="glass-panel"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: "6px",
                    zIndex: 50,
                    background: "rgba(10,14,26,0.95)",
                    border: "1px solid var(--border-subtle)",
                    overflow: "hidden",
                  }}
                >
                  {suggestions.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSearchQuery(item.text);
                        setSuggestions([]);
                        runFullTextSearch(item.text);
                      }}
                      style={{
                        padding: "12px 18px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        borderBottom: idx < suggestions.length - 1 ? "1px solid var(--border-subtle)" : "none",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span>🔍</span>
                        <span style={{ fontWeight: "600" }}>{item.text}</span>
                        {item.category && <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>in {item.category}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {item.matchType && (
                          <span
                            className={
                              item.matchType === "name_prefix"
                                ? "badge badge-hit"
                                : item.matchType === "word_prefix"
                                ? "badge badge-bypass"
                                : "badge badge-miss"
                            }
                            style={{ fontSize: "10px" }}
                          >
                            {item.matchType.replace("_", " ")}
                          </span>
                        )}
                        {item.price && <span style={{ color: "var(--accent-cyan)", fontWeight: "600" }}>${item.price}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Filters Row */}
            <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Category:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-primary)",
                    padding: "8px 12px",
                    borderRadius: "8px",
                  }}
                >
                  <option value="">All Categories</option>
                  <option value="Peripherals">Peripherals</option>
                  <option value="Displays">Displays</option>
                  <option value="Audio">Audio</option>
                  <option value="Accessories">Accessories</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Max Price: ${maxPrice}</span>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="50"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>

              <button onClick={() => runFullTextSearch()} className="btn-primary">
                Execute Full Search
              </button>
            </div>
          </div>

          {/* Search Results Grid */}
          {searchEngineStats && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                Found <strong>{searchEngineStats.total}</strong> product(s) in{" "}
                <strong style={{ color: "var(--accent-emerald)" }}>{searchEngineStats.serverTimeMs}ms</strong> (Redis Set Intersection)
              </span>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "18px" }}>
            {searchResults.map((p) => (
              <div key={p.id} className="glass-panel" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <h3 style={{ fontWeight: "700", fontSize: "16px" }}>{p.name}</h3>
                  <span style={{ color: "var(--accent-cyan)", fontWeight: "700", fontSize: "16px" }}>${p.price}</span>
                </div>
                <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "12px", minHeight: "38px" }}>
                  {p.description}
                </p>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="badge badge-bypass">{p.category}</span>
                  <span className={p.inStock ? "badge badge-hit" : "badge badge-blocked"}>
                    {p.inStock ? "In Stock" : "Out of Stock"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 3: FLASH SALE & DISTRIBUTED MUTEX LOCK                 */}
      {/* ========================================================== */}
      {activeTab === "flashsale" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "24px" }}>
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>
              🛡️ High-Concurrency Distributed Lock Simulator
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "18px" }}>
              Atomic <code>SET NX EX</code> with Lua script release prevents overselling when multiple buyers click "Buy Now" simultaneously.
            </p>

            <div style={{ background: "rgba(0,0,0,0.3)", padding: "16px", borderRadius: "12px", marginBottom: "18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Item:</span>
                <strong>{flashItemId}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Current Stock in Redis:</span>
                <span style={{ fontSize: "20px", fontWeight: "800", color: flashStock && flashStock > 0 ? "var(--accent-emerald)" : "var(--accent-rose)" }}>
                  {flashStock !== null ? flashStock : "Loading..."} units
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)" }}>Confirmed Orders:</span>
                <span>{flashOrders.length} orders</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
              <button
                onClick={() => runConcurrentCheckouts(8)}
                className="btn-primary"
                disabled={simulatingTraffic}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {simulatingTraffic ? "Executing Race Condition..." : "🚀 Launch 8 Concurrent Buyers (Stress Test)"}
              </button>
              <button onClick={() => resetStock(2)} className="btn-secondary">
                Reset Stock to 2
              </button>
            </div>
          </div>

          {/* Real-time Race Condition Logs */}
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "14px" }}>
              ⚡ Real-time Lock & Concurrency Execution Log
            </h2>

            {concurrencyLogs.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
                {concurrencyLogs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: log.success
                        ? "rgba(16, 185, 129, 0.1)"
                        : log.conflict
                        ? "rgba(245, 158, 11, 0.1)"
                        : "rgba(244, 63, 94, 0.1)",
                      border: `1px solid ${
                        log.success
                          ? "rgba(16,185,129,0.3)"
                          : log.conflict
                          ? "rgba(245,158,11,0.3)"
                          : "rgba(244,63,94,0.3)"
                      }`,
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <strong>Buyer #{log.buyerId}</strong>: {log.message}
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span className={log.success ? "badge badge-hit" : log.conflict ? "badge badge-miss" : "badge badge-blocked"}>
                        {log.status}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{log.elapsed}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                Click <strong>"Launch 8 Concurrent Buyers"</strong> to test Distributed Lock!
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 4: REAL-TIME PRESENCE & HEARTBEATS                     */}
      {/* ========================================================== */}
      {activeTab === "presence" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "24px" }}>
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>
              🟢 Live Presence & Active Viewers
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
              Tracks active users with millisecond timestamps in Redis Sorted Sets (<code>ZSET</code>). Automatically evicts idle users (&gt;60s).
            </p>

            <div style={{ background: "rgba(0,0,0,0.3)", padding: "18px", borderRadius: "12px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span>My User ID:</span>
                <code style={{ color: "var(--accent-cyan)" }}>{myUserId}</code>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Heartbeat Status:</span>
                <span className={isHeartbeatActive ? "badge badge-hit" : "badge badge-blocked"}>
                  {isHeartbeatActive ? "🟢 Pinging Every 4s" : "🔴 Inactive"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => setIsHeartbeatActive(!isHeartbeatActive)}
                className={isHeartbeatActive ? "btn-danger" : "btn-primary"}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {isHeartbeatActive ? "Stop Heartbeat" : "Start Live Heartbeat Ping"}
              </button>
              <button onClick={disconnectUser} className="btn-secondary">
                Sign Off (DELETE)
              </button>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>👥 Active Online Users</span>
              <span className="badge badge-hit">{onlineCount} Online</span>
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {onlineUsers.map((user, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    fontSize: "13px",
                  }}
                >
                  <span className="pulse-dot"></span>
                  <code style={{ flex: 1 }}>{user}</code>
                  {user === myUserId && <span className="badge badge-bypass">You</span>}
                </div>
              ))}
              {onlineUsers.length === 0 && (
                <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "30px 0" }}>
                  No active users. Click "Start Live Heartbeat Ping" to join!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 5: SLIDING-WINDOW RATE LIMITER                         */}
      {/* ========================================================== */}
      {activeTab === "ratelimit" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "24px" }}>
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>
              🛑 Sliding-Window Rate Limiter
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "20px" }}>
              Limits IP to <strong>5 requests / 60 seconds</strong>. Request #6 is blocked with <code>HTTP 429 Too Many Requests</code>.
            </p>

            {/* Quota Gauge */}
            <div style={{ background: "rgba(0,0,0,0.3)", padding: "18px", borderRadius: "12px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span>Remaining Quota:</span>
                <strong>{otpQuota.remaining !== null ? `${otpQuota.remaining} / ${otpQuota.limit}` : "5 / 5"}</strong>
              </div>
              <div style={{ display: "flex", gap: "6px", height: "12px" }}>
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      borderRadius: "3px",
                      background:
                        otpQuota.remaining === null || idx <= otpQuota.remaining
                          ? "var(--accent-emerald)"
                          : "rgba(244, 63, 94, 0.4)",
                      transition: "background 0.2s ease",
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={sendOtpRequest} className="btn-primary" style={{ flex: 1, justifyContent: "center" }}>
                Send Single OTP (1 Req)
              </button>
              <button onClick={spamOtpRequests} className="btn-danger">
                ⚡ Spam 6 Rapid Requests
              </button>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "14px" }}>
              📋 Rate Limit Logs &amp; 429 Interceptor
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
              {otpLogs.map((log, idx) => (
                <div
                  key={idx}
                  style={{
                    background: log.status === 200 ? "rgba(16,185,129,0.08)" : "rgba(244,63,94,0.12)",
                    border: `1px solid ${log.status === 200 ? "rgba(16,185,129,0.25)" : "rgba(244,63,94,0.35)"}`,
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <span>{log.time} — </span>
                    <strong>{log.status === 200 ? "✅ 200 OK" : "🚫 429 Rate Limit Exceeded"}</strong>
                    {log.retryAfter && <span style={{ color: "var(--accent-rose)", marginLeft: "8px" }}>(Retry in {log.retryAfter})</span>}
                  </div>
                  <span className={log.status === 200 ? "badge badge-hit" : "badge badge-blocked"}>
                    {log.status === 200 ? `${log.remaining} left` : "BLOCKED"}
                  </span>
                </div>
              ))}
              {otpLogs.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
                  Click "Send Single OTP" or "Spam 6 Rapid Requests" to test rate limiter!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* TAB 6: STATELESS SESSIONS & CACHE INSPECTOR                */}
      {/* ========================================================== */}
      {activeTab === "session" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "24px" }}>
          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>
              🔐 Stateless Serverless Sessions
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginBottom: "18px" }}>
              Generates random session UUID in Redis with <strong>30-minute auto-expiry (1800s TTL)</strong>.
            </p>

            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              <button onClick={() => loginSession("alice@example.com")} className="btn-primary">
                Login as Alice
              </button>
              <button onClick={() => loginSession("bob@example.com")} className="btn-secondary">
                Login as Bob
              </button>
              <button
                onClick={() => {
                  setSessionId("");
                  setSessionUser(null);
                  setSessionTTL(null);
                }}
                className="btn-danger"
              >
                Logout
              </button>
            </div>

            {sessionUser && (
              <div style={{ background: "rgba(0,0,0,0.3)", padding: "16px", borderRadius: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span>User:</span>
                  <strong>{sessionUser.name} ({sessionUser.email})</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span>Role:</span>
                  <span className="badge badge-bypass">{sessionUser.role}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Session TTL Remaining:</span>
                  <strong style={{ color: "var(--accent-emerald)" }}>{sessionTTL} seconds</strong>
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel" style={{ padding: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "16px" }}>
              🎛️ Direct Redis Key Inspector
            </h2>

            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input
                type="text"
                value={inspectKey}
                onChange={(e) => setInspectKey(e.target.value)}
                placeholder="e.g. product:1, idx:price, presence:global"
                style={{
                  flex: 1,
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-primary)",
                  padding: "8px 12px",
                  borderRadius: "8px",
                }}
              />
              <button onClick={inspectRedisKey} className="btn-primary">
                Inspect Key
              </button>
            </div>

            {inspectedKeyData && (
              <pre
                style={{
                  background: "rgba(0,0,0,0.4)",
                  padding: "14px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--accent-cyan)",
                  overflowX: "auto",
                  maxHeight: "220px",
                }}
              >
                {JSON.stringify(inspectedKeyData, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
