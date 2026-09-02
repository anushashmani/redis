"use client";

import React, { useState } from "react";
import Header from "@/components/Header";
import BenchmarkSection from "@/components/BenchmarkSection";
import SearchSection from "@/components/SearchSection";
import FlashSaleSection from "@/components/FlashSaleSection";
import PresenceSection from "@/components/PresenceSection";
import RateLimitSection from "@/components/RateLimitSection";
import SessionSection from "@/components/SessionSection";
import { Zap, Search, ShieldCheck, Radio, ShieldAlert, KeyRound } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<
    "benchmark" | "search" | "flashsale" | "presence" | "ratelimit" | "session"
  >("benchmark");

  const [requestCount, setRequestCount] = useState(0);
  const [lastLatency, setLastLatency] = useState(0);

  const handleMetricsUpdate = (latency: number) => {
    setRequestCount((c) => c + 1);
    setLastLatency(latency);
  };

  const tabs = [
    { id: "benchmark", label: "Cache vs Live DB", icon: Zap, color: "var(--neon-cyan)" },
    { id: "search", label: "Google/Amazon Search", icon: Search, color: "var(--neon-blue)" },
    { id: "flashsale", label: "Flash Sale & Locks", icon: ShieldCheck, color: "var(--neon-violet)" },
    { id: "presence", label: "Live Presence", icon: Radio, color: "var(--neon-emerald)" },
    { id: "ratelimit", label: "Rate Limiting", icon: ShieldAlert, color: "var(--neon-rose)" },
    { id: "session", label: "Sessions & Inspector", icon: KeyRound, color: "var(--neon-amber)" },
  ] as const;

  return (
    <main style={{ padding: "32px 24px", maxWidth: "1320px", margin: "0 auto" }}>
      {/* Top Header */}
      <Header requestCount={requestCount} lastLatency={lastLatency} />

      {/* Modern Navigation Pill Tabs */}
      <nav
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "28px",
          overflowX: "auto",
          paddingBottom: "6px",
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={isActive ? "btn-neon-primary" : "btn-neon-secondary"}
              style={{
                whiteSpace: "nowrap",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "11px 18px",
                borderRadius: "12px",
              }}
            >
              <Icon size={16} color={isActive ? "#040711" : tab.color} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Active Tab View */}
      <div>
        {activeTab === "benchmark" && <BenchmarkSection onMetricsUpdate={handleMetricsUpdate} />}
        {activeTab === "search" && <SearchSection />}
        {activeTab === "flashsale" && <FlashSaleSection />}
        {activeTab === "presence" && <PresenceSection />}
        {activeTab === "ratelimit" && <RateLimitSection />}
        {activeTab === "session" && <SessionSection />}
      </div>
    </main>
  );
}
