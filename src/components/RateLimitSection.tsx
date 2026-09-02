"use client";

import React, { useState } from "react";
import { ShieldAlert, Send, Zap, Clock, CheckCircle2, XCircle } from "lucide-react";

export default function RateLimitSection() {
  const [quota, setQuota] = useState<number | null>(null);
  const [retryAfter, setRetryAfter] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [isSending, setIsSending] = useState(false);

  const sendSingleOtp = async () => {
    setIsSending(true);
    const start = performance.now();
    try {
      const res = await fetch("/api/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      });
      const elapsed = Number((performance.now() - start).toFixed(0));
      const remainingHeader = res.headers.get("X-RateLimit-Remaining");
      const json = await res.json();

      const rem = remainingHeader !== null ? parseInt(remainingHeader, 10) : 0;
      setQuota(rem);
      setRetryAfter(json.retryAfter || null);

      const entry = {
        time: new Date().toLocaleTimeString(),
        status: res.status,
        remaining: rem,
        message: json.message || json.error,
        retryAfter: json.retryAfter,
        elapsed,
      };

      setLogs((prev) => [entry, ...prev.slice(0, 9)]);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const spamRequests = async () => {
    setIsSending(true);
    for (let i = 0; i < 6; i++) {
      await sendSingleOtp();
      await new Promise((r) => setTimeout(r, 120));
    }
    setIsSending(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px" }}>
      {/* Control Gauge Card */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(244, 63, 94, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldAlert size={20} color="var(--neon-rose)" />
          </div>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Sliding-Window Rate Limiter</h2>
            <p style={{ color: "var(--text-dim)", fontSize: "12.5px" }}>
              <code>@upstash/ratelimit</code> (5 requests / 60 seconds per IP)
            </p>
          </div>
        </div>

        {/* 5-Segment Quota Visual Meter */}
        <div
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "14px",
            padding: "20px",
            marginBottom: "20px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "12px" }}>
            <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>Remaining IP Quota:</span>
            <span
              style={{
                fontSize: "24px",
                fontWeight: "800",
                color: quota === null || quota > 0 ? "var(--neon-emerald)" : "var(--neon-rose)",
              }}
            >
              {quota !== null ? `${quota} / 5` : "5 / 5"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "6px", height: "14px", marginBottom: "12px" }}>
            {[1, 2, 3, 4, 5].map((idx) => {
              const isFilled = quota === null || idx <= quota;
              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    borderRadius: "4px",
                    background: isFilled
                      ? "linear-gradient(135deg, #10b981 0%, #00f2fe 100%)"
                      : "rgba(244, 63, 94, 0.25)",
                    border: isFilled ? "none" : "1px solid rgba(244, 63, 94, 0.4)",
                    transition: "all 0.3s ease",
                  }}
                />
              );
            })}
          </div>

          {retryAfter && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#fb7185" }}>
              <Clock size={14} />
              <span>Cooldown Active: Retry in <strong>{retryAfter}</strong></span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={sendSingleOtp}
            className="btn-neon-primary"
            disabled={isSending}
            style={{ flex: 1, justifyContent: "center" }}
          >
            <Send size={15} />
            Send Single OTP (1 Req)
          </button>
          <button
            onClick={spamRequests}
            className="btn-neon-danger"
            disabled={isSending}
          >
            <Zap size={15} />
            Spam 6 Requests (Test 429)
          </button>
        </div>
      </div>

      {/* Execution Logs */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Rate Limit Inspection Logs</h2>
          {logs.length > 0 && <span className="chip chip-violet">{logs.length} Logged</span>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "360px", overflowY: "auto" }}>
          {logs.map((log, idx) => (
            <div
              key={idx}
              style={{
                background: log.status === 200 ? "rgba(16, 185, 129, 0.08)" : "rgba(244, 63, 94, 0.08)",
                border: `1px solid ${log.status === 200 ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)"}`,
                padding: "12px 16px",
                borderRadius: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
                  {log.status === 200 ? (
                    <CheckCircle2 size={16} color="var(--neon-emerald)" />
                  ) : (
                    <XCircle size={16} color="var(--neon-rose)" />
                  )}
                  <strong>{log.status === 200 ? "200 ALLOWED" : "429 BLOCKED"}</strong>
                </div>
                <div style={{ fontSize: "12.5px", color: "var(--text-dim)" }}>{log.message}</div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className={log.status === 200 ? "chip chip-hit" : "chip chip-rose"}>
                  {log.status === 200 ? `${log.remaining} left` : "Quota Exceeded"}
                </span>
                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                  {log.elapsed}ms
                </span>
              </div>
            </div>
          ))}

          {logs.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
              <ShieldAlert size={36} style={{ opacity: 0.3, marginBottom: "12px" }} />
              <p>Click <strong>"Send Single OTP"</strong> or <strong>"Spam 6 Requests"</strong> to test live rate limiting!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
