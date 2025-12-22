-- Rollback Migration: Remove Multi-Pricing Support
-- Run this in Supabase SQL Editor to undo the multi-pricing migration

-- 1. Drop index first
DROP INDEX IF EXISTS idx_orders_pricing_mode;

-- 2. Remove columns from products table
ALTER TABLE products DROP COLUMN IF EXISTS national_price;
ALTER TABLE products DROP COLUMN IF EXISTS international_price;

-- 3. Remove columns from orders table
ALTER TABLE orders DROP COLUMN IF EXISTS pricing_mode;
ALTER TABLE orders DROP COLUMN IF EXISTS currency;

-- 4. Remove columns from product_variations table
ALTER TABLE product_variations DROP COLUMN IF EXISTS national_price;
ALTER TABLE product_variations DROP COLUMN IF EXISTS international_price;

-- Verify the changes
SELECT 'Rollback complete. Verify columns are removed:' as info;

SELECT 'Products columns (should NOT have national_price/international_price):' as check_products;
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('national_price', 'international_price');

SELECT 'Orders columns (should NOT have pricing_mode/currency):' as check_orders;
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('pricing_mode', 'currency');
