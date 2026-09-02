// =============================================================
// lib/db.ts — Live Supabase Database Layer with Mock Fallback
// =============================================================
// This module queries live PostgreSQL via Supabase when configured,
// and gracefully falls back to the in-memory catalogue with simulated
// latency when offline.
//
// You can directly measure the speed difference between:
//   • Live Supabase DB Query (MISS) : ~100ms - 500ms
//   • Upstash Redis Cache (HIT)     : ~10ms - 30ms (10x - 50x faster!)
// =============================================================

import { supabase, isSupabaseConfigured } from "@/lib/supabase";

// ---------- Type ----------
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  inStock: boolean;
  created_at?: string;
}

// ---------- In-Memory Fallback Catalogue ----------
const fallbackProducts: Record<string, Product> = {
  "1": {
    id: "1",
    name: "Mechanical Keyboard",
    price: 149.99,
    description: "Cherry MX Brown switches, full RGB, hot-swappable.",
    category: "Peripherals",
    inStock: true,
  },
  "2": {
    id: "2",
    name: "Ultrawide Monitor 34″",
    price: 499.99,
    description: "3440×1440 IPS, 144 Hz, USB-C with 90 W PD.",
    category: "Displays",
    inStock: true,
  },
  "3": {
    id: "3",
    name: "Ergonomic Mouse",
    price: 79.99,
    description: "Vertical design, 4000 DPI sensor, Bluetooth + 2.4 GHz.",
    category: "Peripherals",
    inStock: false,
  },
  "4": {
    id: "4",
    name: "USB-C Docking Station",
    price: 199.99,
    description: "Triple-display, 100 W passthrough charging, 10 Gbps data.",
    category: "Accessories",
    inStock: true,
  },
  "5": {
    id: "5",
    name: "Noise-Cancelling Headphones",
    price: 349.99,
    description: "40 h battery, multipoint Bluetooth, LDAC hi-res audio.",
    category: "Audio",
    inStock: true,
  },
  "6": {
    id: "6",
    name: "Wireless Gaming Mouse",
    price: 129.99,
    description: "Ultra-lightweight 60g, 26000 DPI optical sensor, RGB.",
    category: "Peripherals",
    inStock: true,
  },
  "7": {
    id: "7",
    name: "4K Gaming Monitor 27″",
    price: 649.99,
    description: "3840×2160 Fast IPS, 160 Hz, 1ms G-Sync Compatible.",
    category: "Displays",
    inStock: true,
  },
  "8": {
    id: "8",
    name: "Studio Condenser Microphone",
    price: 159.99,
    description: "Cardioid pickup, 24-bit/192kHz USB audio interface, shock mount.",
    category: "Audio",
    inStock: true,
  },
};

// ---------- Live Supabase / Fallback Fetch by ID ----------
/**
 * Fetches a product by ID from Supabase PostgreSQL (or fallback DB).
 */
export async function fetchProductFromDB(id: string): Promise<Product | null> {
  const start = performance.now();

  // 1. Try Live Supabase Query
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (!error && data) {
        const time = (performance.now() - start).toFixed(1);
        console.log(`🐘 [Supabase Live DB] Fetched product "${id}" in ${time}ms`);
        return {
          id: String(data.id),
          name: data.name,
          price: Number(data.price),
          description: data.description,
          category: data.category,
          inStock: Boolean(data.inStock),
          created_at: data.created_at,
        };
      }
      if (error && error.code === "PGRST116") {
        // Not found in Supabase
        return null;
      }
      console.warn("⚠️ Supabase query warning (falling back to local):", error?.message);
    } catch (err) {
      console.error("⚠️ Supabase connection error (falling back to local):", err);
    }
  }

  // 2. Fallback: In-memory catalogue with simulated network delay (500ms)
  await new Promise((resolve) => setTimeout(resolve, 500));
  const fallback = fallbackProducts[id] ?? null;
  console.log(`💾 [Mock DB Fallback] Fetched product "${id}" (500ms delay)`);
  return fallback;
}

// ---------- Search Filter Options ----------
export interface SearchFilters {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Searches the product catalogue via Supabase or fallback database.
 */
export async function searchProductsInDB(
  filters: SearchFilters = {}
): Promise<{ results: Product[]; total: number }> {
  const start = performance.now();

  // 1. Try Live Supabase Search
  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase.from("products").select("*", { count: "exact" });

      if (filters.query) {
        const q = filters.query.trim();
        query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%,category.ilike.%${q}%`);
      }
      if (filters.category) {
        query = query.ilike("category", filters.category.trim());
      }
      if (filters.minPrice !== undefined) {
        query = query.gte("price", filters.minPrice);
      }
      if (filters.maxPrice !== undefined) {
        query = query.lte("price", filters.maxPrice);
      }

      const { data, error, count } = await query;

      if (!error && data) {
        const time = (performance.now() - start).toFixed(1);
        console.log(`🐘 [Supabase Live DB] Search matched ${data.length} items in ${time}ms`);
        return {
          results: data.map((d: any) => ({
            id: String(d.id),
            name: d.name,
            price: Number(d.price),
            description: d.description,
            category: d.category,
            inStock: Boolean(d.inStock),
            created_at: d.created_at,
          })),
          total: count ?? data.length,
        };
      }
    } catch (err) {
      console.error("⚠️ Supabase search error (falling back to local):", err);
    }
  }

  // 2. Fallback: In-memory search
  await new Promise((resolve) => setTimeout(resolve, 500));

  const queryText = filters.query?.toLowerCase().trim();
  const categoryFilter = filters.category?.toLowerCase().trim();
  const allItems = Object.values(fallbackProducts);

  const matched = allItems.filter((item) => {
    if (queryText) {
      const matchName = item.name.toLowerCase().includes(queryText);
      const matchDesc = item.description.toLowerCase().includes(queryText);
      const matchCat = item.category.toLowerCase().includes(queryText);
      if (!matchName && !matchDesc && !matchCat) return false;
    }
    if (categoryFilter && item.category.toLowerCase() !== categoryFilter) return false;
    if (filters.minPrice !== undefined && item.price < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && item.price > filters.maxPrice) return false;
    return true;
  });

  return { results: matched, total: matched.length };
}

// ---------- Update Product in DB ----------
/**
 * Updates an existing product in Supabase (or fallback DB).
 */
export async function updateProductInDB(
  id: string,
  updates: Partial<Omit<Product, "id">>
): Promise<Product | null> {
  const start = performance.now();

  // 1. Try Live Supabase Update
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from("products")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (!error && data) {
        const time = (performance.now() - start).toFixed(1);
        console.log(`🐘 [Supabase Live DB] Updated product "${id}" in ${time}ms:`, data);
        return {
          id: String(data.id),
          name: data.name,
          price: Number(data.price),
          description: data.description,
          category: data.category,
          inStock: Boolean(data.inStock),
          created_at: data.created_at,
        };
      }
    } catch (err) {
      console.error("⚠️ Supabase update error (falling back to local):", err);
    }
  }

  // 2. Fallback Update
  await new Promise((resolve) => setTimeout(resolve, 300));
  const existing = fallbackProducts[id];
  if (!existing) return null;

  const updatedProduct: Product = { ...existing, ...updates, id };
  fallbackProducts[id] = updatedProduct;
  return updatedProduct;
}

// ---------- Create Product in DB ----------
/**
 * Creates a new product in Supabase (or fallback DB).
 */
export async function createProductInDB(
  productData: Omit<Product, "id"> & { id?: string }
): Promise<Product> {
  const id = productData.id || String(Object.keys(fallbackProducts).length + 1);

  if (isSupabaseConfigured && supabase) {
    try {
      const payload = { ...productData, id };
      const { data, error } = await supabase
        .from("products")
        .insert(payload)
        .select()
        .single();

      if (!error && data) {
        return {
          id: String(data.id),
          name: data.name,
          price: Number(data.price),
          description: data.description,
          category: data.category,
          inStock: Boolean(data.inStock),
          created_at: data.created_at,
        };
      }
    } catch (err) {
      console.error("⚠️ Supabase create error:", err);
    }
  }

  // Fallback Create
  await new Promise((resolve) => setTimeout(resolve, 300));
  const newProduct: Product = { ...productData, id };
  fallbackProducts[id] = newProduct;
  return newProduct;
}
