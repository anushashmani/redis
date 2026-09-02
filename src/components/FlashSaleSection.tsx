"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Lock, Unlock, Users, AlertTriangle, CheckCircle2, RefreshCw, ShoppingCart } from "lucide-react";

export default function FlashSaleSection() {
  const queryClient = useQueryClient();
  const [itemId] = useState("limited-ps5-console");
  const [concurrencyLogs, setConcurrencyLogs] = useState<any[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);

  // ---------------------------------------------------------
  // React Query: Fetch Real-Time Flash Inventory (GET /api/flash-sale/inventory/[id])
  // ---------------------------------------------------------
  const { data: inventoryData, refetch: refetchInventory } = useQuery({
    queryKey: ["inventory", itemId],
    queryFn: async () => {
      const res = await fetch(`/api/flash-sale/inventory/${itemId}`);
      return res.json();
    },
    refetchInterval: 3000, // auto poll every 3s
  });

  // ---------------------------------------------------------
  // React Query: Reset Inventory (POST /api/flash-sale/reset)
  // ---------------------------------------------------------
  const resetMutation = useMutation({
    mutationFn: async (stock: number) => {
      const res = await fetch("/api/flash-sale/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, stock }),
      });
      return res.json();
    },
    onSuccess: () => {
      setConcurrencyLogs([]);
      queryClient.invalidateQueries({ queryKey: ["inventory", itemId] });
    },
  });

  // ---------------------------------------------------------
  // Parallel Multi-Buyer Concurrency Stress Test
  // ---------------------------------------------------------
  const runConcurrencyStressTest = async (buyerCount = 8) => {
    setIsSimulating(true);
    setConcurrencyLogs([]);

    const buyers = Array.from({ length: buyerCount }, (_, i) => ({
      userId: `buyer_${i + 1}@example.com`,
      id: i + 1,
    }));

    // Fire all requests asynchronously at the exact same millisecond
    const promises = buyers.map(async (buyer) => {
      const start = performance.now();
      try {
        const res = await fetch("/api/flash-sale/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, userId: buyer.userId }),
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
          message: err.message,
          elapsed: 0,
        };
      }
    });

    const results = await Promise.all(promises);
    setConcurrencyLogs(results);
    setIsSimulating(false);
    queryClient.invalidateQueries({ queryKey: ["inventory", itemId] });
  };

  const stock = inventoryData?.stock ?? 0;
  const orders = inventoryData?.orders || [];
  const isSoldOut = inventoryData?.isSoldOut || stock <= 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px" }}>
      {/* Control Panel */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(168, 85, 247, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldCheck size={20} color="var(--neon-violet)" />
          </div>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Distributed Mutex Lock Controller</h2>
            <p style={{ color: "var(--text-dim)", fontSize: "12.5px" }}>
              Atomic <code>SET NX EX</code> + Lua Script Release
            </p>
          </div>
        </div>

        {/* Live Inventory Status Card */}
        <div
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "20px",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>Item Under Sale:</span>
            <code style={{ color: "var(--neon-cyan)", fontWeight: "600" }}>{itemId}</code>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
            <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>Live Stock in Redis:</span>
            <span
              style={{
                fontSize: "26px",
                fontWeight: "800",
                color: stock > 0 ? "var(--neon-emerald)" : "var(--neon-rose)",
              }}
            >
              {stock} units
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>Confirmed Orders:</span>
            <span className="chip chip-hit">{orders.length} Orders Confirmed</span>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
          <button
            onClick={() => runConcurrencyStressTest(8)}
            className="btn-neon-primary"
            disabled={isSimulating}
            style={{ flex: 1, justifyContent: "center" }}
          >
            <Users size={16} />
            {isSimulating ? "Simulating Traffic..." : "Launch 8 Concurrent Buyers (Stress Test)"}
          </button>
          <button
            onClick={() => resetMutation.mutate(2)}
            className="btn-neon-secondary"
            disabled={resetMutation.isPending}
            title="Reset Stock to 2"
          >
            <RefreshCw size={15} />
            Reset to 2
          </button>
        </div>

        <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.5" }}>
          💡 When 8 concurrent requests arrive at the same millisecond, the Redis Mutex Lock ensures only 1 process holds the checkout token, preventing overselling and negative inventory bugs.
        </p>
      </div>

      {/* Real-Time Concurrency Log Viewer */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Lock size={18} color="var(--neon-cyan)" />
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Live Concurrency Race Results</h2>
          </div>
          {concurrencyLogs.length > 0 && (
            <span className="chip chip-violet">{concurrencyLogs.length} Requests Handled</span>
          )}
        </div>

        {concurrencyLogs.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "380px", overflowY: "auto" }}>
            {concurrencyLogs.map((log, idx) => (
              <div
                key={idx}
                style={{
                  background: log.success
                    ? "rgba(16, 185, 129, 0.08)"
                    : log.conflict
                    ? "rgba(251, 191, 36, 0.08)"
                    : "rgba(244, 63, 94, 0.08)",
                  border: `1px solid ${
                    log.success
                      ? "rgba(16,185,129,0.3)"
                      : log.conflict
                      ? "rgba(251,191,36,0.3)"
                      : "rgba(244,63,94,0.3)"
                  }`,
                  padding: "12px 16px",
                  borderRadius: "10px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                    <strong>Buyer #{log.buyerId}</strong>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>({log.user})</span>
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>{log.message}</div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    className={
                      log.success
                        ? "chip chip-hit"
                        : log.conflict
                        ? "chip chip-miss"
                        : "chip chip-rose"
                    }
                  >
                    {log.status === 200 ? "200 ORDER PLACED" : log.status === 409 ? "409 LOCK CONFLICT" : "400 SOLD OUT"}
                  </span>
                  <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                    {log.elapsed}ms
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "70px 0", color: "var(--text-muted)" }}>
            <ShoppingCart size={40} style={{ opacity: 0.3, marginBottom: "12px" }} />
            <p>Click <strong>"Launch 8 Concurrent Buyers"</strong> to simulate high-traffic race conditions!</p>
          </div>
        )}
      </div>
    </div>
  );
}
