"use client";

import React from "react";
import { Zap, Database, Activity, ShieldCheck, Sparkles } from "lucide-react";

interface HeaderProps {
  requestCount: number;
  lastLatency: number;
}

export default function Header({ requestCount, lastLatency }: HeaderProps) {
  return (
    <header
      className="glass-card"
      style={{
        padding: "24px 32px",
        marginBottom: "28px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "20px",
        background: "linear-gradient(135deg, rgba(13,20,38,0.9) 0%, rgba(6,10,22,0.98) 100%)",
        border: "1px solid rgba(255,255,255,0.09)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "14px",
            background: "linear-gradient(135deg, #00f2fe 0%, #38bdf8 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 24px rgba(0, 242, 254, 0.4)",
          }}
        >
          <Zap size={26} color="#040711" strokeWidth={2.5} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.03em" }}>
              Upstash Redis + Next.js Control Room
            </h1>
            <span className="chip chip-hit" style={{ fontSize: "10.5px" }}>
              <Sparkles size={12} /> Enterprise Ready
            </span>
          </div>
          <p style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>
            Production reference implementation with TanStack React Query, Live Supabase PostgreSQL &amp; Mutex Locks.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <div className="chip chip-hit">
          <span className="live-indicator"></span>
          Upstash Redis Connected
        </div>
        <div className="chip chip-violet">
          <Database size={13} />
          Supabase PostgreSQL
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border-subtle)",
            padding: "6px 14px",
            borderRadius: "10px",
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Activity size={14} color="var(--neon-cyan)" />
          <span style={{ color: "var(--text-dim)" }}>Latency:</span>
          <strong style={{ color: lastLatency < 50 ? "var(--neon-emerald)" : "var(--neon-amber)" }}>
            {lastLatency}ms
          </strong>
          <span style={{ color: "var(--text-muted)" }}>({requestCount} reqs)</span>
        </div>
      </div>
    </header>
  );
}
