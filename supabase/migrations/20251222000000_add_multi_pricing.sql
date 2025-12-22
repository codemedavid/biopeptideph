-- Migration: Add Multi-Pricing Support (National vs International)
-- Run this in Supabase SQL Editor

-- 1. Add new price columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS national_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS international_price DECIMAL(10,2);

-- 2. Copy existing base_price to national_price for existing products
UPDATE products SET national_price = base_price WHERE national_price IS NULL;

-- 3. Add pricing mode and currency columns to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pricing_mode TEXT DEFAULT 'national';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'PHP';

-- 4. Create index for faster order filtering by pricing mode
CREATE INDEX IF NOT EXISTS idx_orders_pricing_mode ON orders(pricing_mode);

-- 5. Add similar columns to product_variations table
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS national_price DECIMAL(10,2);
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS international_price DECIMAL(10,2);

-- 6. Copy existing variation prices to national_price
UPDATE product_variations SET national_price = price WHERE national_price IS NULL;

-- Verify the changes
SELECT 'Products table columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('national_price', 'international_price', 'base_price');

SELECT 'Orders table columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('pricing_mode', 'currency');
