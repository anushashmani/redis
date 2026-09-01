// =============================================================
// app/api/search-index/reindex/route.ts — Re-index Entire Catalog
// =============================================================

import { NextResponse } from "next/server";
import { reindexCatalog } from "@/lib/search-index";

export async function POST() {
  try {
    const result = await reindexCatalog();

    return NextResponse.json(
      {
        message: "Redis Search Index successfully created and populated!",
        ...result,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("🔥 Reindexing failed:", error);
    return NextResponse.json(
      { error: "Failed to reindex catalog in Redis." },
      { status: 500 }
    );
  }
}
