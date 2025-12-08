-- Create shipping_locations table for HP GLOW / peptalk.ph
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.shipping_locations (
  id text PRIMARY KEY,
  name text NOT NULL,
  fee numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.shipping_locations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow public read access" ON public.shipping_locations
  FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert" ON public.shipping_locations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON public.shipping_locations
  FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated delete" ON public.shipping_locations
  FOR DELETE USING (true);

-- Create index
CREATE INDEX IF NOT EXISTS shipping_locations_order_idx ON public.shipping_locations (order_index ASC);

-- Insert default shipping locations
INSERT INTO public.shipping_locations (id, name, fee, is_active, order_index) VALUES
  ('NCR', 'NCR (Metro Manila)', 75, true, 1),
  ('LUZON', 'Luzon (Outside NCR)', 100, true, 2),
  ('VISAYAS_MINDANAO', 'Visayas & Mindanao', 130, true, 3)
ON CONFLICT (id) DO UPDATE SET
  fee = EXCLUDED.fee,
  name = EXCLUDED.name;

-- Grant permissions
GRANT SELECT ON public.shipping_locations TO anon;
GRANT SELECT ON public.shipping_locations TO authenticated;
GRANT ALL ON public.shipping_locations TO authenticated;
