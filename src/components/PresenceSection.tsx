"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, Users, UserCheck, UserX, Eye, Activity } from "lucide-react";

export default function PresenceSection() {
  const queryClient = useQueryClient();
  const [isHeartbeatOn, setIsHeartbeatOn] = useState(false);
  const [userId] = useState(() => "user_" + Math.floor(Math.random() * 9000 + 1000));
  const intervalRef = useRef<any>(null);

  // ---------------------------------------------------------
  // React Query: Real-Time Presence Polling (GET /api/presence)
  // Only polls when user has activated live heartbeat!
  // ---------------------------------------------------------
  const { data: presenceData } = useQuery({
    queryKey: ["presence"],
    queryFn: async () => {
      const res = await fetch("/api/presence");
      return res.json();
    },
    refetchInterval: isHeartbeatOn ? 4000 : false,
  });


  // ---------------------------------------------------------
  // React Query: Send Heartbeat Ping (POST /api/presence/heartbeat)
  // ---------------------------------------------------------
  const heartbeatMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/presence/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, resourceId: "product:1", metadata: { name: userId } }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["presence"] });
    },
  });

  // ---------------------------------------------------------
  // React Query: Disconnect / Sign-off (DELETE /api/presence/heartbeat)
  // ---------------------------------------------------------
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/presence/heartbeat", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      return res.json();
    },
    onSuccess: () => {
      setIsHeartbeatOn(false);
      queryClient.invalidateQueries({ queryKey: ["presence"] });
    },
  });

  // Heartbeat loop
  useEffect(() => {
    if (isHeartbeatOn) {
      heartbeatMutation.mutate();
      intervalRef.current = setInterval(() => {
        heartbeatMutation.mutate();
      }, 4000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isHeartbeatOn]);

  const onlineCount = presenceData?.onlineCount || 0;
  const users = presenceData?.users || [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "24px" }}>
      {/* Control Card */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Radio size={20} color="var(--neon-emerald)" />
          </div>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Live Presence &amp; Heartbeat Monitor</h2>
            <p style={{ color: "var(--text-dim)", fontSize: "12.5px" }}>
              Sorted Sets (<code>ZSET</code>) with millisecond epoch scores &amp; automatic idle pruning (&gt;60s).
            </p>
          </div>
        </div>

        {/* User Card */}
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
            <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>My Client ID:</span>
            <code style={{ color: "var(--neon-cyan)", fontWeight: "700" }}>{userId}</code>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>Keepalive Ping:</span>
            <span className={isHeartbeatOn ? "chip chip-hit" : "chip chip-rose"}>
              {isHeartbeatOn ? (
                <>
                  <span className="live-indicator"></span> Pinging Every 4s
                </>
              ) : (
                "Disconnected"
              )}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => setIsHeartbeatOn(!isHeartbeatOn)}
            className={isHeartbeatOn ? "btn-neon-danger" : "btn-neon-primary"}
            style={{ flex: 1, justifyContent: "center" }}
          >
            <Activity size={16} />
            {isHeartbeatOn ? "Stop Heartbeat Ping" : "Start Live Heartbeat"}
          </button>
          <button
            onClick={() => disconnectMutation.mutate()}
            className="btn-neon-secondary"
            disabled={disconnectMutation.isPending}
          >
            <UserX size={16} />
            Sign Off (DELETE)
          </button>
        </div>
      </div>

      {/* Online Users List */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Users size={18} color="var(--neon-emerald)" />
            <h2 style={{ fontSize: "17px", fontWeight: "700" }}>Active Online Users</h2>
          </div>
          <span className="chip chip-hit">{onlineCount} Active</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "360px", overflowY: "auto" }}>
          {users.map((user: string, idx: number) => (
            <div
              key={idx}
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border-subtle)",
                padding: "12px 16px",
                borderRadius: "10px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span className="live-indicator"></span>
                <code style={{ fontSize: "13.5px" }}>{user}</code>
              </div>
              {user === userId && <span className="chip chip-violet">You</span>}
            </div>
          ))}

          {users.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
              <Eye size={36} style={{ opacity: 0.3, marginBottom: "12px" }} />
              <p>No active users right now. Click <strong>"Start Live Heartbeat"</strong> to go live!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
