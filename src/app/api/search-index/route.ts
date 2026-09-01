// =============================================================
// app/api/search-index/route.ts — Redis Search Index Query Endpoint
// =============================================================
//
// HOW THIS DIFFERS FROM REGULAR CACHING:
//   • Regular Caching: Queries DB on MISS (~500ms), saves exact string.
//   • Redis Search Index: The search engine runs 100% INSIDE Redis.
//     Database is NEVER touched, not even on the first query!
//
// USAGE:
//   GET /api/search-index?q=mechanical+brown
//   GET /api/search-index?q=keyboard&category=peripherals
//   GET /api/search-index?minPrice=100&maxPrice=300
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { searchInRedisIndex } from "@/lib/search-index";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const query = searchParams.get("q") || undefined;
  const category = searchParams.get("category") || undefined;
  const minPriceParam = searchParams.get("minPrice");
  const maxPriceParam = searchParams.get("maxPrice");

  const minPrice = minPriceParam ? parseFloat(minPriceParam) : undefined;
  const maxPrice = maxPriceParam ? parseFloat(maxPriceParam) : undefined;

  try {
    const result = await searchInRedisIndex({
      query,
      category,
      minPrice,
      maxPrice,
    });

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "X-Engine": "Redis-Inverted-Index",
        "X-Execution-Time": `${result.executionTimeMs}ms`,
      },
    });
  } catch (error) {
    console.error("🔥 Redis Search Index query failed:", error);
    return NextResponse.json(
      { error: "Search index query failed." },
      { status: 500 }
    );
  }
}
