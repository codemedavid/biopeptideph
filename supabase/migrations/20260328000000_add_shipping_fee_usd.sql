-- Add USD shipping fee column to shipping_locations
ALTER TABLE public.shipping_locations
  ADD COLUMN IF NOT EXISTS fee_usd numeric(10,2) NOT NULL DEFAULT 0;

-- Set default USD values (approximate conversions)
UPDATE public.shipping_locations SET fee_usd = 2 WHERE id = 'NCR';
UPDATE public.shipping_locations SET fee_usd = 2 WHERE id = 'LUZON';
UPDATE public.shipping_locations SET fee_usd = 3 WHERE id = 'VISAYAS_MINDANAO';
