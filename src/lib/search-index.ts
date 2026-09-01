// =============================================================
// lib/search-index.ts — Native Redis Inverted Search Index Engine
// =============================================================
//
// HOW A REDIS INVERTED INDEX WORKS UNDER THE HOOD:
//   Search engines like Lucene, Elasticsearch, and RediSearch work
//   by breaking documents into "tokens" (words) and creating an
//   INVERTED INDEX using Redis Sets and Sorted Sets.
//
// DATA STRUCTURES CREATED IN REDIS:
//   1. Document Store  : "idx:doc:{id}"       -> Full JSON document
//   2. Inverted Index  : "idx:token:{word}"   -> Set of product IDs containing that word (SET)
//   3. Category Index  : "idx:cat:{category}" -> Set of product IDs in that category (SET)
//   4. Price Index     : "idx:price"          -> Sorted Set with price as score (ZSET)
//   5. Autocomplete    : "idx:autocomplete"   -> Prefix Sorted Set for instant typeahead (ZSET)
//   6. All Products    : "idx:all_products"   -> Master Set of all indexed IDs (SET)
//
// SEARCH EXECUTION IN <1ms:
//   When a user searches "mechanical keyboard":
//     redis.sinter("idx:token:mechanical", "idx:token:keyboard")
//   Redis performs Set Intersection in RAM in <1ms!
//   Database is NEVER touched, not even on the first query!
// =============================================================

import redis from "@/lib/redis";
import { Product, searchProductsInDB } from "@/lib/db";

// English stop-words to ignore during indexing
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
  "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
  "to", "was", "were", "will", "with",
]);

/**
 * Tokenizes text into a clean array of normalized keyword tokens.
 * Example: "Cherry MX Brown switches, full RGB!"
 *       -> ["cherry", "mx", "brown", "switches", "full", "rgb"]
 */
export function tokenize(text: string): string[] {
  if (!text) return [];

  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // remove punctuation
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Indexes a single product into the Redis Inverted Search Index.
 */
export async function indexProduct(product: Product): Promise<void> {
  const pipeline = redis.pipeline();
  const id = String(product.id);

  // 1. Store full document JSON
  pipeline.set(`idx:doc:${id}`, JSON.stringify(product));

  // 2. Add to Master product list
  pipeline.sadd("idx:all_products", id);

  // 3. Extract and index words from Name, Description, and Category
  const nameTokens = tokenize(product.name);
  const descTokens = tokenize(product.description);
  const catTokens = tokenize(product.category);

  const allTokens = Array.from(new Set([...nameTokens, ...descTokens, ...catTokens]));

  for (const token of allTokens) {
    pipeline.sadd(`idx:token:${token}`, id);
  }

  // 4. Index Category
  pipeline.sadd(`idx:cat:${product.category.toLowerCase().trim()}`, id);

  // 5. Index Price in Sorted Set (ZSET) for numeric range queries
  pipeline.zadd("idx:price", { score: product.price, member: id });

  // 6. Build Autocomplete prefixes in Sorted Set (ZSET)
  // Indexes prefixes for the full name AND each individual word
  // e.g. For "Mechanical Keyboard" -> indexes "m...", "mech..." AND "k...", "key...", "keyboard"
  const nameWords = product.name.toLowerCase().split(/\s+/).filter(Boolean);
  nameWords.push(product.name.toLowerCase().trim()); // also include full phrase

  for (const word of nameWords) {
    for (let i = 1; i <= word.length; i++) {
      const prefix = word.slice(0, i);
      // Score 0 allows alphabetical lexicographical sorting in ZSET
      pipeline.zadd("idx:autocomplete", {
        score: 0,
        member: `${prefix}:${product.name}:${id}`,
      });
    }
  }

  await pipeline.exec();
  console.log(`🔍 Indexed product #${id} ("${product.name}") with ${allTokens.length} search tokens.`);
}


/**
 * Re-indexes all products from the database into Redis Search Index.
 */
export async function reindexCatalog(): Promise<{ totalIndexed: number }> {
  // Clear old index
  const keys = await redis.keys("idx:*");
  if (keys.length > 0) {
    const delPipeline = redis.pipeline();
    for (const key of keys) {
      delPipeline.del(key);
    }
    await delPipeline.exec();
  }

  // Fetch all items from DB
  const { results: allProducts } = await searchProductsInDB({});

  for (const product of allProducts) {
    await indexProduct(product);
  }

  console.log(`✅ Reindexed ${allProducts.length} products into Redis Search Index.`);
  return { totalIndexed: allProducts.length };
}

export interface IndexSearchOptions {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
}

export interface SearchIndexResult {
  source: "redis_search_index";
  total: number;
  executionTimeMs: number;
  matchedTokens: string[];
  results: Product[];
}

/**
 * Executes a full-text search directly inside Redis using Set Intersections.
 * Database is NEVER queried!
 */
export async function searchInRedisIndex(
  options: IndexSearchOptions = {}
): Promise<SearchIndexResult> {
  const start = performance.now();
  const queryTokens = tokenize(options.query || "");
  const category = options.category?.toLowerCase().trim();
  const minPrice = options.minPrice ?? 0;
  const maxPrice = options.maxPrice ?? Infinity;
  const limit = options.limit ?? 20;

  // ----------------------------------------------------------
  // STEP 1 — Identify candidate Set keys to intersect
  // ----------------------------------------------------------
  const setsToIntersect: string[] = [];

  // Add token sets (e.g. "idx:token:mechanical", "idx:token:keyboard")
  for (const token of queryTokens) {
    setsToIntersect.push(`idx:token:${token}`);
  }

  // Add category set if provided (e.g. "idx:cat:peripherals")
  if (category) {
    setsToIntersect.push(`idx:cat:${category}`);
  }

  let matchedIds: string[] = [];

  if (setsToIntersect.length === 0) {
    // No query terms or category -> fetch all indexed products
    const all = await redis.smembers("idx:all_products");
    matchedIds = Array.isArray(all) ? all.map(String) : [];
  } else if (setsToIntersect.length === 1) {
    // Single filter
    const members = await redis.smembers(setsToIntersect[0]);
    matchedIds = Array.isArray(members) ? members.map(String) : [];
  } else {
    // ----------------------------------------------------------
    // STEP 2 — Multi-Token Set Intersection (SINTER)
    // ----------------------------------------------------------
    // Redis computes the intersection in RAM in <1ms!
    try {
      const firstKey = setsToIntersect[0];
      const restKeys = setsToIntersect.slice(1);
      const intersected = restKeys.length > 0
        ? await redis.sinter(firstKey, ...restKeys)
        : await redis.smembers(firstKey);
      matchedIds = Array.isArray(intersected) ? intersected.map(String) : [];
    } catch {
      matchedIds = [];
    }

    // Fallback: If exact intersection is empty, perform Union (SUNION) for fuzzy match
    if (matchedIds.length === 0 && queryTokens.length > 1) {
      try {
        const unionKeys = queryTokens.map((t) => `idx:token:${t}`);
        const unioned = unionKeys.length > 1
          ? await redis.sunion(unionKeys[0], ...unionKeys.slice(1))
          : await redis.smembers(unionKeys[0]);
        matchedIds = Array.isArray(unioned) ? unioned.map(String) : [];
      } catch {
        matchedIds = [];
      }
    }
  }


  // ----------------------------------------------------------
  // STEP 3 — Apply Price Range Filtering via Sorted Set (ZSET)
  // ----------------------------------------------------------
  if (minPrice > 0 || maxPrice < Infinity) {
    // zrange with byScore filter
    const priceMatched = await redis.zrange("idx:price", minPrice, maxPrice === Infinity ? "+inf" : maxPrice, {
      byScore: true,
    });
    const priceSet = new Set(Array.isArray(priceMatched) ? priceMatched.map(String) : []);
    matchedIds = matchedIds.filter((id) => priceSet.has(id));
  }

  // Limit results
  const finalIds = matchedIds.slice(0, limit);

  // ----------------------------------------------------------
  // STEP 4 — Batch Fetch Matching Documents (MGET / Pipeline)
  // ----------------------------------------------------------
  const products: Product[] = [];

  if (finalIds.length > 0) {
    const pipeline = redis.pipeline();
    for (const id of finalIds) {
      pipeline.get(`idx:doc:${id}`);
    }
    const docs = await pipeline.exec();

    for (const doc of docs) {
      if (doc) {
        try {
          const parsed = typeof doc === "string" ? JSON.parse(doc) : doc;
          products.push(parsed as Product);
        } catch {
          // ignore parsing error
        }
      }
    }
  }

  const elapsed = Number((performance.now() - start).toFixed(2));
  console.log(`⚡ Redis Search Index: "${options.query || "*"}" matched ${products.length} product(s) in ${elapsed}ms (0 DB hits)`);

  return {
    source: "redis_search_index",
    total: products.length,
    executionTimeMs: elapsed,
    matchedTokens: queryTokens,
    results: products,
  };
}

/**
 * GOOGLE & AMAZON ENTERPRISE HYBRID AUTOCOMPLETE ENGINE
 * 
 * ALGORITHM RULES (Industry Standard):
 *   1. Short Queries (1-2 Chars, e.g. "a", "m", "ke"):
 *      • STRICT WORD-BOUNDARY PREFIX ONLY (No random middle-letter spam).
 *      • e.g. "a" -> matches words starting with 'A' (Audio, Accessories, Apple).
 *      • e.g. "m" -> matches "Mechanical Keyboard", "Monitor", "Mouse", "Microphone".
 * 
 *   2. Longer Queries (3+ Chars, e.g. "phone", "board", "game", "cherry"):
 *      • HIGH-RECALL HYBRID: Word-prefixes, Substring infixes, Categories & Description tokens.
 *      • e.g. "phone" -> matches "Noise-Cancelling Headphones" & "Studio Condenser Microphone".
 *      • e.g. "board" -> matches "Mechanical Keyboard".
 * 
 *   3. WEIGHTED RELEVANCE RANKING:
 *      • 100 pts: Full product name starts with query.
 *      • 80 pts : Any word in product name starts with query.
 *      • 60 pts : Category starts with query.
 *      • 50 pts : (3+ chars only) Infix / Substring anywhere in product name.
 *      • 30 pts : (3+ chars only) Keyword found in product description.
 */
export async function getAutocompleteSuggestions(
  query: string,
  limit = 5
): Promise<{ text: string; productId: string; category?: string; price?: number; matchType?: string }[]> {
  if (!query || query.trim().length === 0) return [];

  const cleanQuery = query.toLowerCase().trim();
  const isShortQuery = cleanQuery.length < 3; // 1 or 2 characters

  // 1. Fetch all product IDs from the Redis master index
  const allIds = await redis.smembers("idx:all_products");
  if (!Array.isArray(allIds) || allIds.length === 0) return [];

  // 2. Batch fetch all product documents from Redis in a single pipeline
  const pipeline = redis.pipeline();
  for (const id of allIds) {
    pipeline.get(`idx:doc:${id}`);
  }
  const docs = await pipeline.exec();

  const candidates: {
    product: Product;
    score: number;
    matchType: string;
  }[] = [];

  for (const doc of docs) {
    if (!doc) continue;
    try {
      const p = (typeof doc === "string" ? JSON.parse(doc) : doc) as Product;
      const name = p.name.toLowerCase();
      const cat = p.category.toLowerCase();
      const desc = p.description.toLowerCase();
      const nameWords = name.split(/\s+/).filter(Boolean);
      const catWords = cat.split(/\s+/).filter(Boolean);

      let matchScore = 0;
      let matchType = "";

      // ---------------------------------------------------------
      // TIER 1: Exact Name Prefix (Score 100)
      // e.g. "Microphone" for query "mic"
      // ---------------------------------------------------------
      if (name.startsWith(cleanQuery)) {
        matchScore = 100;
        matchType = "name_prefix";
      }
      // ---------------------------------------------------------
      // TIER 2: Word-Boundary Prefix in Name (Score 80)
      // e.g. "Mechanical Keyboard" for query "key" or "mech"
      // ---------------------------------------------------------
      else if (nameWords.some((w) => w.startsWith(cleanQuery))) {
        matchScore = 80;
        matchType = "word_prefix";
      }
      // ---------------------------------------------------------
      // TIER 3: Category Word-Boundary Prefix (Score 60)
      // e.g. "Peripherals" for "periph" or "Displays" for "disp"
      // ---------------------------------------------------------
      else if (catWords.some((w) => w.startsWith(cleanQuery)) || cat.startsWith(cleanQuery)) {
        matchScore = 60;
        matchType = "category_match";
      }
      // ---------------------------------------------------------
      // TIER 4 (3+ Chars Only): Substring Infix in Product Name (Score 50)
      // e.g. "Noise-Cancelling Headphones" for query "phone"
      // ---------------------------------------------------------
      else if (!isShortQuery && name.includes(cleanQuery)) {
        matchScore = 50;
        matchType = "name_substring";
      }
      // ---------------------------------------------------------
      // TIER 5 (3+ Chars Only): Description Token Match (Score 30)
      // e.g. "Mechanical Keyboard" for query "cherry" or "switch"
      // ---------------------------------------------------------
      else if (!isShortQuery && desc.includes(cleanQuery)) {
        matchScore = 30;
        matchType = "description_match";
      }

      if (matchScore > 0) {
        candidates.push({ product: p, score: matchScore, matchType });
      }
    } catch {
      // ignore JSON parse error
    }
  }

  // Sort by highest relevance score descending
  candidates.sort((a, b) => b.score - a.score);

  // Return top ranked suggestions
  return candidates.slice(0, limit).map((c) => ({
    text: c.product.name,
    productId: c.product.id,
    category: c.product.category,
    price: c.product.price,
    matchType: c.matchType,
  }));
}

