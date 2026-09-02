"use client";

import React, { useState } from "react";
import { KeyRound, User, Clock, Search, LogOut, ShieldCheck } from "lucide-react";

export default function SessionSection() {
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [sessionId, setSessionId] = useState("");
  const [sessionTTL, setSessionTTL] = useState<number | null>(null);
  const [inspectKey, setInspectKey] = useState("product:1");
  const [inspectedData, setInspectedData] = useState<any>(null);
  const [isInspecting, setIsInspecting] = useState(false);

  const loginUser = async (email: string) => {
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
    setIsInspecting(true);
    try {
      const res = await fetch(`/api/cache/${encodeURIComponent(inspectKey)}`);
      const data = await res.json();
      setInspectedData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsInspecting(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px" }}>
      {/* Session Auth Card */}
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
            <KeyRound size={20} color="var(--neon-cyan)" />
          </div>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Stateless Session Store</h2>
            <p style={{ color: "var(--text-dim)", fontSize: "12.5px" }}>
              UUID Bearer Token with 30-min auto-expiry (1800s TTL)
            </p>
          </div>
        </div>

        {/* Login Triggers */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button onClick={() => loginUser("alice@example.com")} className="btn-neon-primary">
            <User size={15} />
            Login as Alice
          </button>
          <button onClick={() => loginUser("bob@example.com")} className="btn-neon-secondary">
            <User size={15} />
            Login as Bob
          </button>
          {sessionUser && (
            <button
              onClick={() => {
                setSessionId("");
                setSessionUser(null);
                setSessionTTL(null);
              }}
              className="btn-neon-danger"
            >
              <LogOut size={15} />
              Logout
            </button>
          )}
        </div>

        {/* User Card */}
        {sessionUser ? (
          <div
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "14px",
              padding: "20px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>Active User:</span>
              <strong style={{ fontSize: "15px" }}>{sessionUser.name}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>Email:</span>
              <code>{sessionUser.email}</code>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>Role:</span>
              <span className="chip chip-violet">{sessionUser.role}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>Remaining TTL:</span>
              <span className="chip chip-hit">
                <Clock size={13} /> {sessionTTL}s remaining
              </span>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
            Click <strong>"Login as Alice"</strong> or <strong>"Login as Bob"</strong> to generate a stateless session token!
          </div>
        )}
      </div>

      {/* Direct Key Inspector Card */}
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
            <Search size={20} color="var(--neon-violet)" />
          </div>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Direct Redis Key Inspector</h2>
            <p style={{ color: "var(--text-dim)", fontSize: "12.5px" }}>
              Inspect TTL, value, and memory structure of any Redis key
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
          <input
            type="text"
            value={inspectKey}
            onChange={(e) => setInspectKey(e.target.value)}
            placeholder="e.g. product:1, idx:price, presence:global, @upstash/ratelimit:..."
            style={{
              flex: 1,
              background: "rgba(0,0,0,0.4)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-white)",
              padding: "10px 14px",
              borderRadius: "10px",
              fontSize: "13.5px",
            }}
          />
          <button onClick={inspectRedisKey} className="btn-neon-primary" disabled={isInspecting}>
            Inspect Key
          </button>
        </div>

        {inspectedData ? (
          <pre
            style={{
              background: "rgba(0,0,0,0.5)",
              border: "1px solid var(--border-subtle)",
              padding: "16px",
              borderRadius: "10px",
              fontSize: "12.5px",
              color: "var(--neon-cyan)",
              overflowX: "auto",
              maxHeight: "260px",
            }}
          >
            {JSON.stringify(inspectedData, null, 2)}
          </pre>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>
            Enter a key like <code>product:1</code> or <code>idx:price</code> and click <strong>"Inspect Key"</strong>.
          </div>
        )}
      </div>
    </div>
  );
}
