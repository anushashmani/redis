"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Sparkles, RefreshCw, SlidersHorizontal, Tag, DollarSign, Package } from "lucide-react";

export default function SearchSection() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [category, setCategory] = useState("");
  const [maxPrice, setMaxPrice] = useState("1000");

  // Debounce search term for autocomplete
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(searchTerm.trim());
    }, 150);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // ---------------------------------------------------------
  // React Query: Typeahead Autocomplete (GET /api/search-index/autocomplete)
  // ---------------------------------------------------------
  const { data: autocompleteData } = useQuery({
    queryKey: ["autocomplete", debouncedTerm],
    queryFn: async () => {
      if (!debouncedTerm) return { suggestions: [] };
      const res = await fetch(`/api/search-index/autocomplete?q=${encodeURIComponent(debouncedTerm)}`);
      return res.json();
    },
    enabled: debouncedTerm.length > 0,
    staleTime: 1000 * 30, // 30s
  });

  // ---------------------------------------------------------
  // React Query: Full Inverted Index Search (GET /api/search-index)
  // ---------------------------------------------------------
  const {
    data: searchData,
    isFetching: isSearching,
    refetch: executeSearch,
  } = useQuery({
    queryKey: ["search-index", searchTerm, category, maxPrice],
    queryFn: async () => {
      const start = performance.now();
      const params = new URLSearchParams();
      if (searchTerm) params.set("q", searchTerm);
      if (category) params.set("category", category);
      if (maxPrice) params.set("maxPrice", maxPrice);

      const res = await fetch(`/api/search-index?${params.toString()}`);
      const json = await res.json();
      const elapsed = Number((performance.now() - start).toFixed(1));

      return {
        results: json.results || [],
        total: json.total || 0,
        serverTimeMs: json.executionTimeMs || 0,
        clientTimeMs: elapsed,
      };
    },
    staleTime: 1000 * 10,
  });

  // ---------------------------------------------------------
  // React Query: Rebuild Inverted Index (POST /api/search-index/reindex)
  // ---------------------------------------------------------
  const reindexMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/search-index/reindex", { method: "POST" });
      return res.json();
    },
    onSuccess: (data) => {
      alert(`✅ ${data.message} (${data.totalIndexed} items indexed in Redis)`);
      queryClient.invalidateQueries({ queryKey: ["search-index"] });
      queryClient.invalidateQueries({ queryKey: ["autocomplete"] });
      executeSearch();
    },
  });

  const suggestions = autocompleteData?.suggestions || [];
  const results = searchData?.results || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Search Header & Query Bar */}
      <div className="glass-card" style={{ padding: "28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <Search size={22} color="var(--neon-cyan)" />
              <h2 style={{ fontSize: "18px", fontWeight: "800" }}>
                Google &amp; Amazon Enterprise Hybrid Search Engine
              </h2>
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: "13.5px" }}>
              Inverted Token Index + 5-Tier Weighted Relevance Typeahead running 100% in Redis RAM.
            </p>
          </div>

          <button
            onClick={() => reindexMutation.mutate()}
            className="btn-neon-secondary"
            disabled={reindexMutation.isPending}
          >
            <RefreshCw size={14} className={reindexMutation.isPending ? "pulse-dot" : ""} />
            {reindexMutation.isPending ? "Indexing Catalog..." : "Rebuild Inverted Index"}
          </button>
        </div>

        {/* Input Bar with Instant Dropdown */}
        <div style={{ position: "relative", marginBottom: "18px" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={18}
              color="var(--neon-cyan)"
              style={{ position: "absolute", left: "16px", top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              type="text"
              placeholder='Try typing e.g. "k", "key", "phone", "brown switch", "displays", "station"...'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  executeSearch();
                }
              }}
              style={{
                width: "100%",
                background: "rgba(0,0,0,0.45)",
                border: "1px solid rgba(0, 242, 254, 0.4)",
                color: "var(--text-white)",
                padding: "14px 18px 14px 46px",
                borderRadius: "14px",
                fontSize: "15px",
                boxShadow: "0 0 24px rgba(0,242,254,0.12)",
                outline: "none",
              }}
            />
          </div>

          {/* Typeahead Suggestions Dropdown */}
          {suggestions.length > 0 && searchTerm.trim().length > 0 && (
            <div
              className="glass-card"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                marginTop: "8px",
                zIndex: 50,
                background: "rgba(6, 10, 22, 0.98)",
                border: "1px solid rgba(0, 242, 254, 0.3)",
                overflow: "hidden",
                borderRadius: "14px",
                boxShadow: "0 18px 48px rgba(0,0,0,0.8)",
              }}
            >
              <div style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "700" }}>
                Instant Typeahead Suggestions (Ranked by Relevance)
              </div>
              {suggestions.map((item: any, idx: number) => (
                <div
                  key={idx}
                  onClick={() => {
                    setSearchTerm(item.text);
                    executeSearch();
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
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0, 242, 254, 0.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Search size={14} color="var(--neon-cyan)" />
                    <span style={{ fontWeight: "600", fontSize: "14px" }}>{item.text}</span>
                    {item.category && <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>in {item.category}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {item.matchType && (
                      <span
                        className={
                          item.matchType === "name_prefix"
                            ? "chip chip-hit"
                            : item.matchType === "word_prefix"
                            ? "chip chip-violet"
                            : "chip chip-miss"
                        }
                        style={{ fontSize: "10.5px" }}
                      >
                        {item.matchType.replace("_", " ")}
                      </span>
                    )}
                    {item.price && (
                      <span style={{ color: "var(--neon-cyan)", fontWeight: "700", fontSize: "14px" }}>
                        ${item.price}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters Controls */}
        <div style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Tag size={15} color="var(--text-dim)" />
            <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>Category:</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{
                background: "rgba(0,0,0,0.4)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-white)",
                padding: "8px 14px",
                borderRadius: "8px",
                fontSize: "13px",
              }}
            >
              <option value="">All Categories</option>
              <option value="Peripherals">Peripherals</option>
              <option value="Displays">Displays</option>
              <option value="Audio">Audio</option>
              <option value="Accessories">Accessories</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <DollarSign size={15} color="var(--text-dim)" />
            <span style={{ fontSize: "13px", color: "var(--text-dim)" }}>Max Price: ${maxPrice}</span>
            <input
              type="range"
              min="50"
              max="1000"
              step="50"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              style={{ cursor: "pointer" }}
            />
          </div>

          <button onClick={() => executeSearch()} className="btn-neon-primary" style={{ marginLeft: "auto" }}>
            <Sparkles size={14} />
            Search Inverted Index
          </button>
        </div>
      </div>

      {/* Results Header / Stats */}
      {searchData && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px" }}>
          <span style={{ color: "var(--text-dim)", fontSize: "14px" }}>
            Found <strong style={{ color: "var(--text-white)" }}>{searchData.total}</strong> product(s) in{" "}
            <strong style={{ color: "var(--neon-emerald)" }}>{searchData.serverTimeMs}ms</strong> (Redis Set Intersections)
          </span>
          <span className="chip chip-hit">0 SQL DB Queries</span>
        </div>
      )}

      {/* Product Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
        {results.map((p: any) => (
          <div key={p.id} className="glass-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
              <h3 style={{ fontWeight: "700", fontSize: "16px" }}>{p.name}</h3>
              <span style={{ color: "var(--neon-cyan)", fontWeight: "800", fontSize: "16px" }}>${p.price}</span>
            </div>
            <p style={{ color: "var(--text-dim)", fontSize: "13px", marginBottom: "16px", minHeight: "40px", lineHeight: "1.5" }}>
              {p.description}
            </p>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="chip chip-violet">{p.category}</span>
              <span className={p.inStock ? "chip chip-hit" : "chip chip-rose"}>
                {p.inStock ? "In Stock" : "Out of Stock"}
              </span>
            </div>
          </div>
        ))}
        {results.length === 0 && !isSearching && (
          <div className="glass-card" style={{ gridColumn: "1 / -1", padding: "60px 0", textAlign: "center", color: "var(--text-muted)" }}>
            <Package size={36} style={{ opacity: 0.3, marginBottom: "12px" }} />
            <p>No products match your search query or filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
