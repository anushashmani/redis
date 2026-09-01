// =============================================================
// lib/db.ts — Mock Database Layer
// =============================================================
// This file simulates a "real" database. In production you'd
// replace this with Prisma, Drizzle, or raw SQL queries.
//
// The 500ms delay mimics network + query time so you can
// clearly see the speed difference between a cache HIT
// (instant from Redis) vs a cache MISS (slow DB fetch).
// =============================================================

// ---------- Type ----------
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  category: string;
  inStock: boolean;
}

// ---------- Sample catalogue ----------
const products: Record<string, Product> = {
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

// ---------- Simulated DB fetch by ID ----------
/**
 * Fetches a product by ID from the "database".
 * Adds an artificial 500 ms delay so you can feel the difference
 * between a cached response and a fresh DB lookup.
 */
export async function fetchProductFromDB(
  id: string
): Promise<Product | null> {
  // ⏳ Simulate real database latency
  await new Promise((resolve) => setTimeout(resolve, 500));

  return products[id] ?? null;
}

// ---------- Search Filter Options ----------
export interface SearchFilters {
  query?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
}

/**
 * Searches the product catalogue with simulated database latency (500ms).
 * Supports full-text matching on name/description and category/price filtering.
 */
export async function searchProductsInDB(
  filters: SearchFilters = {}
): Promise<{ results: Product[]; total: number }> {
  // ⏳ Simulate database query execution time (index scans, full-text matching, joins)
  await new Promise((resolve) => setTimeout(resolve, 500));

  const queryText = filters.query?.toLowerCase().trim();
  const categoryFilter = filters.category?.toLowerCase().trim();

  const allItems = Object.values(products);

  const matched = allItems.filter((item) => {
    // 1. Text Query filter (name or description)
    if (queryText) {
      const matchName = item.name.toLowerCase().includes(queryText);
      const matchDesc = item.description.toLowerCase().includes(queryText);
      const matchCat = item.category.toLowerCase().includes(queryText);
      if (!matchName && !matchDesc && !matchCat) {
        return false;
      }
    }

    // 2. Category filter
    if (categoryFilter && item.category.toLowerCase() !== categoryFilter) {
      return false;
    }

    // 3. Minimum price filter
    if (filters.minPrice !== undefined && item.price < filters.minPrice) {
      return false;
    }

    // 4. Maximum price filter
    if (filters.maxPrice !== undefined && item.price > filters.maxPrice) {
      return false;
    }

    return true;
  });

  return {
    results: matched,
    total: matched.length,
  };
}

// ---------- Update Product in DB ----------
/**
 * Updates an existing product in the mock database with simulated latency.
 */
export async function updateProductInDB(
  id: string,
  updates: Partial<Omit<Product, "id">>
): Promise<Product | null> {
  // ⏳ Simulate database write latency (disk I/O, transaction commit, indexes)
  await new Promise((resolve) => setTimeout(resolve, 300));


  const existing = products[id];
  if (!existing) {
    return null;
  }

  const updatedProduct: Product = {
    ...existing,
    ...updates,
    id, // ensure ID is never modified
  };

  products[id] = updatedProduct;
  return updatedProduct;
}

// ---------- Create Product in DB ----------
/**
 * Creates a new product in the mock database.
 */
export async function createProductInDB(
  productData: Omit<Product, "id"> & { id?: string }
): Promise<Product> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  const id = productData.id || String(Object.keys(products).length + 1);
  const newProduct: Product = {
    ...productData,
    id,
  };

  products[id] = newProduct;
  return newProduct;
}


