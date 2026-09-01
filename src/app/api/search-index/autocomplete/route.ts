// =============================================================
// app/api/search-index/autocomplete/route.ts — Live Typeahead Suggestions
// =============================================================
//
// USAGE:
//   GET /api/search-index/autocomplete?q=key
//   GET /api/search-index/autocomplete?q=mon
// =============================================================

import { NextRequest, NextResponse } from "next/server";
import { getAutocompleteSuggestions } from "@/lib/search-index";

export async function GET(request: NextRequest) {
  const prefix = request.nextUrl.searchParams.get("q") || "";

  try {
    const suggestions = await getAutocompleteSuggestions(prefix, 5);

    return NextResponse.json(
      {
        prefix,
        count: suggestions.length,
        suggestions,
      },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=60" },
      }
    );
  } catch (error) {
    console.error("🔥 Autocomplete query failed:", error);
    return NextResponse.json(
      { error: "Autocomplete query failed." },
      { status: 500 }
    );
  }
}
