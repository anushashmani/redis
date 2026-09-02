// =============================================================
// app/api/supabase/seed/route.ts — Live Supabase Database Seeder
// =============================================================

import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const initialProducts = [
  {
    id: "1",
    name: "Mechanical Keyboard",
    price: 149.99,
    description: "Cherry MX Brown switches, full RGB, hot-swappable.",
    category: "Peripherals",
    inStock: true,
  },
  {
    id: "2",
    name: "Ultrawide Monitor 34″",
    price: 499.99,
    description: "3440×1440 IPS, 144 Hz, USB-C with 90 W PD.",
    category: "Displays",
    inStock: true,
  },
  {
    id: "3",
    name: "Ergonomic Mouse",
    price: 79.99,
    description: "Vertical design, 4000 DPI sensor, Bluetooth + 2.4 GHz.",
    category: "Peripherals",
    inStock: false,
  },
  {
    id: "4",
    name: "USB-C Docking Station",
    price: 199.99,
    description: "Triple-display, 100 W passthrough charging, 10 Gbps data.",
    category: "Accessories",
    inStock: true,
  },
  {
    id: "5",
    name: "Noise-Cancelling Headphones",
    price: 349.99,
    description: "40 h battery, multipoint Bluetooth, LDAC hi-res audio.",
    category: "Audio",
    inStock: true,
  },
  {
    id: "6",
    name: "Wireless Gaming Mouse",
    price: 129.99,
    description: "Ultra-lightweight 60g, 26000 DPI optical sensor, RGB.",
    category: "Peripherals",
    inStock: true,
  },
  {
    id: "7",
    name: "4K Gaming Monitor 27″",
    price: 649.99,
    description: "3840×2160 Fast IPS, 160 Hz, 1ms G-Sync Compatible.",
    category: "Displays",
    inStock: true,
  },
  {
    id: "8",
    name: "Studio Condenser Microphone",
    price: 159.99,
    description: "Cardioid pickup, 24-bit/192kHz USB audio interface, shock mount.",
    category: "Audio",
    inStock: true,
  },
];

export async function POST() {
  if (!isSupabaseConfigured || !supabase) {
    return NextResponse.json(
      {
        error: "Supabase credentials are not configured in .env.local",
        help: "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local",
      },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabase
      .from("products")
      .upsert(initialProducts, { onConflict: "id" })
      .select();

    if (error) {
      console.error("🔥 Supabase seeding error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: "Supabase 'products' table seeded successfully!",
      totalSeeded: data.length,
      products: data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
