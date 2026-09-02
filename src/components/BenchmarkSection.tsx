"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Zap, Database, Flame, Trash2, ArrowRight, CheckCircle2, Clock, DollarSign, Package } from "lucide-react";

interface BenchmarkSectionProps {
  onMetricsUpdate: (latency: number) => void;
}

export default function BenchmarkSection({ onMetricsUpdate }: BenchmarkSectionProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("1");
  const [editName, setEditName] = useState("Mechanical Keyboard (Sale)");
  const [editPrice, setEditPrice] = useState("129.99");
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // ---------------------------------------------------------
  // React Query: Fetch Product (GET /api/products/[id])
  // ---------------------------------------------------------
  const {
    data: productResponse,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["product", selectedId],
    queryFn: async () => {
      const start = performance.now();
      const res = await fetch(`/api/products/${selectedId}`);
      const elapsed = Number((performance.now() - start).toFixed(1));
      const cacheHeader = res.headers.get("X-Cache") || "UNKNOWN";
      const sourceHeader = res.headers.get("X-Source") || "unknown";
      const json = await res.json();

      onMetricsUpdate(elapsed);

      return {
        product: json.data || json,
        cacheHeader,
        sourceHeader,
        elapsed,
        status: res.status,
      };
    },
    staleTime: 0, // allow manual testing of fresh cache
  });

  // ---------------------------------------------------------
  // React Query: Write-Through Mutation (PUT /api/products/[id])
  // ---------------------------------------------------------
  const updateMutation = useMutation({
    mutationFn: async (payload: { name: string; price: number }) => {
      const res = await fetch(`/api/products/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: (data) => {
      setBannerMsg(`✅ Write-Through Success! Database updated & Redis cache overwritten instantly.`);
      // Invalidate query to trigger fresh fetch from Redis
      queryClient.invalidateQueries({ queryKey: ["product", selectedId] });
      refetch();
    },
    onError: (err: any) => {
      setBannerMsg(`❌ Mutation failed: ${err.message}`);
    },
  });

  // ---------------------------------------------------------
  // React Query: Cache Pre-Warming (POST /api/cache/warmup)
  // ---------------------------------------------------------
  const prewarmMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/cache/warmup", { method: "POST" });
      return res.json();
    },
    onSuccess: (data) => {
      setBannerMsg(`🔥 ${data.message} (${data.totalPreWarmed} items cached with 0ms cold-start)`);
      queryClient.invalidateQueries({ queryKey: ["product"] });
      refetch();
    },
  });

  // ---------------------------------------------------------
  // React Query: Invalidate Specific Cache Key (DELETE /api/cache/[key])
  // ---------------------------------------------------------
  const invalidateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/cache/product:${selectedId}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      setBannerMsg(`🧹 Purged "product:${selectedId}" from Redis. Next request will be a Cache MISS!`);
      queryClient.removeQueries({ queryKey: ["product", selectedId] });
      refetch();
    },
  });

  const product = productResponse?.product;
  const isHit = productResponse?.cacheHeader === "HIT";
  const elapsed = productResponse?.elapsed ?? 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px" }}>
      {/* Action Control Panel */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(0, 242, 254, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={20} color="var(--neon-cyan)" />
          </div>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Cache-Aside &amp; Write-Through Controls</h2>
            <p style={{ color: "var(--text-dim)", fontSize: "12.5px" }}>
              React Query <code>useQuery</code> + <code>useMutation</code>
            </p>
          </div>
        </div>

        {/* Product Selector */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ fontSize: "13px", color: "var(--text-dim)", display: "block", marginBottom: "8px" }}>
            Select Product ID to Query:
          </label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {["1", "2", "3", "4", "5", "6", "7", "8"].map((id) => (
              <button
                key={id}
                onClick={() => {
                  setSelectedId(id);
                  setBannerMsg(null);
                }}
                className={selectedId === id ? "btn-neon-primary" : "btn-neon-secondary"}
                style={{ minWidth: "40px", justifyContent: "center", padding: "8px 12px" }}
              >
                #{id}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "22px" }}>
          <button
            onClick={() => refetch()}
            className="btn-neon-primary"
            disabled={isFetching}
            style={{ flex: 1, justifyContent: "center" }}
          >
            <Zap size={15} />
            {isFetching ? "Querying..." : "Fetch Product (GET)"}
          </button>
          <button
            onClick={() => prewarmMutation.mutate()}
            className="btn-neon-secondary"
            disabled={prewarmMutation.isPending}
            title="Pre-warms all 8 products in Redis using pipelining"
          >
            <Flame size={15} color="var(--neon-amber)" />
            {prewarmMutation.isPending ? "Warming..." : "Pre-Warm All"}
          </button>
          <button
            onClick={() => invalidateMutation.mutate()}
            className="btn-neon-danger"
            disabled={invalidateMutation.isPending}
            title="Deletes product from Redis cache"
          >
            <Trash2 size={15} />
            Bust Cache
          </button>
        </div>

        {/* Banner Feedback */}
        {bannerMsg && (
          <div
            style={{
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              padding: "12px 16px",
              borderRadius: "10px",
              color: "#34d399",
              fontSize: "13px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <CheckCircle2 size={16} />
            <span>{bannerMsg}</span>
          </div>
        )}

        {/* Write-Through Form */}
        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <Database size={15} color="var(--neon-cyan)" />
            <h3 style={{ fontSize: "14px", fontWeight: "700", color: "var(--neon-cyan)" }}>
              Test Write-Through Sync (DB + Synchronous Redis Overwrite):
            </h3>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "10px", marginBottom: "12px" }}>
            <input
              type="text"
              placeholder="Product Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-white)",
                padding: "9px 12px",
                borderRadius: "8px",
                fontSize: "13.5px",
              }}
            />
            <input
              type="number"
              placeholder="Price"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-white)",
                padding: "9px 12px",
                borderRadius: "8px",
                fontSize: "13.5px",
              }}
            />
          </div>
          <button
            onClick={() =>
              updateMutation.mutate({
                name: editName,
                price: parseFloat(editPrice) || 99.99,
              })
            }
            className="btn-neon-secondary"
            disabled={updateMutation.isPending}
            style={{ width: "100%", justifyContent: "center" }}
          >
            <ArrowRight size={15} />
            {updateMutation.isPending ? "Syncing..." : "Update in DB + Overwrite Redis (PUT)"}
          </button>
        </div>
      </div>

      {/* Latency Speedometer & Product Card */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Clock size={20} color={isHit ? "var(--neon-emerald)" : "var(--neon-amber)"} />
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Live Latency Comparator</h2>
          </div>
          {productResponse && (
            <span className={isHit ? "chip chip-hit" : "chip chip-miss"}>
              {isHit ? "⚡ CACHE HIT (RAM)" : "🐘 CACHE MISS (LIVE DB)"}
            </span>
          )}
        </div>

        {productResponse ? (
          <div>
            {/* Speedometer Gauge Display */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "12px" }}>
              <span
                style={{
                  fontSize: "42px",
                  fontWeight: "800",
                  letterSpacing: "-0.03em",
                  color: isHit ? "var(--neon-emerald)" : "var(--neon-amber)",
                }}
              >
                {elapsed} ms
              </span>
              <span style={{ color: "var(--text-dim)", fontSize: "14px" }}>
                Source: <strong>{productResponse.sourceHeader}</strong>
              </span>
            </div>

            {/* Visual Multiplier Bar */}
            <div style={{ marginBottom: "22px" }}>
              <div
                style={{
                  background: "rgba(255,255,255,0.06)",
                  height: "12px",
                  borderRadius: "6px",
                  overflow: "hidden",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(5, Math.min(100, (elapsed / 500) * 100))}%`,
                    background: isHit
                      ? "linear-gradient(90deg, #10b981 0%, #00f2fe 100%)"
                      : "linear-gradient(90deg, #fbbf24 0%, #f43f5e 100%)",
                    transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11.5px", color: "var(--text-muted)" }}>
                <span>0ms (Instant RAM)</span>
                <span>{isHit ? "⚡ ~20x - 50x Faster than DB" : "⏳ Database Network Roundtrip"}</span>
                <span>500ms+</span>
              </div>
            </div>

            {/* Product Card Details */}
            {product && (
              <div
                style={{
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "14px",
                  padding: "20px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                  <h3 style={{ fontSize: "17px", fontWeight: "700" }}>{product.name}</h3>
                  <span style={{ fontSize: "18px", fontWeight: "800", color: "var(--neon-cyan)" }}>
                    ${product.price}
                  </span>
                </div>
                <p style={{ color: "var(--text-dim)", fontSize: "13.5px", marginBottom: "14px", lineHeight: "1.6" }}>
                  {product.description}
                </p>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <span className="chip chip-violet">{product.category}</span>
                  <span className={product.inStock ? "chip chip-hit" : "chip chip-rose"}>
                    {product.inStock ? "In Stock" : "Out of Stock"}
                  </span>
                  {product.created_at && (
                    <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginLeft: "auto" }}>
                      Supabase Row
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
            <Package size={40} style={{ opacity: 0.3, marginBottom: "12px" }} />
            <p>Click <strong>"Fetch Product"</strong> to measure database vs Redis latency!</p>
          </div>
        )}
      </div>
    </div>
  );
}
