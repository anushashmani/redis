// =============================================================
// app/api/search/route.ts — Redis-Cached Search & Analytics
// =============================================================
//
// WHY CACHE SEARCH RESULTS IN REDIS?
//   Search queries are frequently repeated across users (e.g.
//   "keyboard", "headphones", "monitor"). Full-text search and
//   multi-filter DB queries are computationally expensive.
//
//   By caching the result in Redis with a normalized cache key:
//     • First search  → 500ms (database scan & filter) [MISS]
//     • Repeat search → ~15ms (instant Redis JSON lookup) [HIT]
//
// BONUS PATTERN DEMONSTRATED — Redis Sorted Sets (ZSET):
//   We also use `redis.zincrby()` to track search popularity.
//   Every search increments a score in a sorted set, letting us
//   return trending/top searches with zero extra infrastructure!
//
// USAGE:
//   GET /api/search?q=keyboard
//   GET /api/search?q=mouse&category=peripherals
//   GET /api/search?minPrice=100&maxPrice=500
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { searchProductsInDB, SearchFilters } from "@/lib/db";

// Search results TTL: 5 minutes (300 seconds).
// Search caches typically have a shorter TTL than individual
// product entity caches because catalogue and stock changes
// happen dynamically.
const SEARCH_CACHE_TTL = 300;

/**
 * Helper: Builds a deterministic, normalized cache key from query parameters.
 * Sorting and lowercasing ensures that:
 *   ?q=KEYBOARD&category=Peripherals
 *   ?category=peripherals&q=keyboard
 * both resolve to the EXACT SAME Redis key!
 */
function buildSearchCacheKey(filters: SearchFilters): string {
  const parts: string[] = ["search:v1"];

  if (filters.query) {
    parts.push(`q=${encodeURIComponent(filters.query.toLowerCase().trim())}`);
  }
  if (filters.category) {
    parts.push(`cat=${encodeURIComponent(filters.category.toLowerCase().trim())}`);
  }
  if (filters.minPrice !== undefined) {
    parts.push(`min=${filters.minPrice}`);
  }
  if (filters.maxPrice !== undefined) {
    parts.push(`max=${filters.maxPrice}`);
  }

  // If no filters are provided, it's a catalogue-wide search
  return parts.length === 1 ? "search:v1:all" : parts.join(":");
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // 1. Extract query parameters
  const query = searchParams.get("q") || undefined;
  const category = searchParams.get("category") || undefined;
  const minPriceParam = searchParams.get("minPrice");
  const maxPriceParam = searchParams.get("maxPrice");

  const minPrice = minPriceParam ? parseFloat(minPriceParam) : undefined;
  const maxPrice = maxPriceParam ? parseFloat(maxPriceParam) : undefined;

  const filters: SearchFilters = { query, category, minPrice, maxPrice };

  // 2. Generate normalized cache key
  const cacheKey = buildSearchCacheKey(filters);

  try {
    // ----------------------------------------------------------
    // STEP 1 — Check Redis Cache for existing search results
    // ----------------------------------------------------------
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      console.log(`✅ Search Cache HIT  for key "${cacheKey}"`);

      // Track trending search term even on cache hit if a query keyword was provided
      if (query && query.trim().length > 1) {
        trackSearchAnalytics(query.trim().toLowerCase());
      }

      // Fetch top 5 trending searches to return as helper metadata
      const trending = await getTrendingSearches();

      return NextResponse.json(
        {
          source: "cache",
          cacheKey,
          data: cachedData,
          trendingSearches: trending,
        },
        {
          status: 200,
          headers: {
            "X-Cache": "HIT",
            "Cache-Control": `public, max-age=${SEARCH_CACHE_TTL}`,
          },
        }
      );
    }

    // ----------------------------------------------------------
    // STEP 2 — Cache MISS → Execute query in the database
    // ----------------------------------------------------------
    console.log(`❌ Search Cache MISS for key "${cacheKey}" — querying database…`);
    const dbResult = await searchProductsInDB(filters);

    // ----------------------------------------------------------
    // STEP 3 — Store results in Redis with TTL
    // ----------------------------------------------------------
    try {
      await redis.set(cacheKey, JSON.stringify(dbResult), {
        ex: SEARCH_CACHE_TTL,
      });
      console.log(`📦 Stored search results for "${cacheKey}" in Redis (TTL = ${SEARCH_CACHE_TTL}s)`);
    } catch (cacheWriteError) {
      console.error("⚠️  Failed to cache search results in Redis:", cacheWriteError);
    }

    // Track search query analytics in a Redis Sorted Set (ZSET)
    if (query && query.trim().length > 1) {
      trackSearchAnalytics(query.trim().toLowerCase());
    }

    const trending = await getTrendingSearches();

    return NextResponse.json(
      {
        source: "database",
        cacheKey,
        data: dbResult,
        trendingSearches: trending,
      },
      {
        status: 200,
        headers: {
          "X-Cache": "MISS",
        },
      }
    );
  } catch (error) {
    // ----------------------------------------------------------
    // STEP 4 — Graceful Degradation (Fallback to DB)
    // ----------------------------------------------------------
    console.error("🔥 Redis search error — falling back directly to DB:", error);

    try {
      const dbResult = await searchProductsInDB(filters);
      return NextResponse.json(
        {
          source: "database (Redis fallback)",
          cacheKey,
          data: dbResult,
          trendingSearches: [],
        },
        {
          status: 200,
          headers: { "X-Cache": "BYPASS" },
        }
      );
    } catch (dbError) {
      console.error("💀 Database search failed:", dbError);
      return NextResponse.json(
        { error: "Internal search error" },
        { status: 500 }
      );
    }
  }
}

/**
 * Increments the search query count in a Redis Sorted Set.
 * Key: "analytics:trending_searches"
 * Score: frequency of search
 */
async function trackSearchAnalytics(searchTerm: string) {
  try {
    // zincrby increments member score by 1 (or creates member with score 1)
    await redis.zincrby("analytics:trending_searches", 1, searchTerm);
  } catch (err) {
    // Non-blocking background analytics failure
    console.warn("⚠️  Failed to update search analytics:", err);
  }
}

/**
 * Retrieves top 5 most searched terms ordered by highest score descending.
 */
async function getTrendingSearches(): Promise<{ term: string; score: number }[]> {
  try {
    // zrange with { rev: true, withScores: true } returns highest scores first
    const raw = await redis.zrange("analytics:trending_searches", 0, 4, {
      rev: true,
      withScores: true,
    });

    // Upstash returns [item1, score1, item2, score2, ...]
    const trending: { term: string; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      trending.push({
        term: String(raw[i]),
        score: Number(raw[i + 1]),
      });
    }
    return trending;
  } catch {
    return [];
  }
}
