-- =============================================================
-- Supabase SQL Schema — Products Table & Sample Seed Data
-- =============================================================
-- Run this in your Supabase Project -> SQL Editor -> Run

-- 1. Create Products Table
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  "inStock" BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS) & Public Read/Write Access
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access"
  ON public.products FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert/update access"
  ON public.products FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Seed Sample Catalogue
INSERT INTO public.products (id, name, price, description, category, "inStock") VALUES
  ('1', 'Mechanical Keyboard', 149.99, 'Cherry MX Brown switches, full RGB, hot-swappable.', 'Peripherals', true),
  ('2', 'Ultrawide Monitor 34″', 499.99, '3440×1440 IPS, 144 Hz, USB-C with 90 W PD.', 'Displays', true),
  ('3', 'Ergonomic Mouse', 79.99, 'Vertical design, 4000 DPI sensor, Bluetooth + 2.4 GHz.', 'Peripherals', false),
  ('4', 'USB-C Docking Station', 199.99, 'Triple-display, 100 W passthrough charging, 10 Gbps data.', 'Accessories', true),
  ('5', 'Noise-Cancelling Headphones', 349.99, '40 h battery, multipoint Bluetooth, LDAC hi-res audio.', 'Audio', true),
  ('6', 'Wireless Gaming Mouse', 129.99, 'Ultra-lightweight 60g, 26000 DPI optical sensor, RGB.', 'Peripherals', true),
  ('7', '4K Gaming Monitor 27″', 649.99, '3840×2160 Fast IPS, 160 Hz, 1ms G-Sync Compatible.', 'Displays', true),
  ('8', 'Studio Condenser Microphone', 159.99, 'Cardioid pickup, 24-bit/192kHz USB audio interface, shock mount.', 'Audio', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price = EXCLUDED.price,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  "inStock" = EXCLUDED."inStock";
