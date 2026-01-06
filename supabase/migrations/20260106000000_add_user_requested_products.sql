-- Migration to add user requested products with 3x pricing and inclusions
-- Created: 2026-01-06

DO $$
DECLARE
  v_inclusions text[] := ARRAY['Syringe for Reconstitution', '6pcs Insulin Syringes', '10pcs Alcohol Pads', 'Transparent vial case'];
BEGIN
  -- Safe check for inclusions column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'inclusions') THEN
      ALTER TABLE products ADD COLUMN inclusions TEXT[];
  END IF;

  -- Helper function or block not strictly needed if we just do individualized checks for safety and clarity.
  -- We use a temporary table to hold our data to make the logic cleaner and batch process.

  CREATE TEMP TABLE new_products (
    p_name text,
    p_price numeric,
    p_category text
  );

  INSERT INTO new_products (p_name, p_price, p_category) VALUES
  ('Semaglutide 5mg', 5697.00, 'research'),
  ('Semaglutide 10mg', 7500.00, 'research'),
  ('Tirzepatide 15mg', 6000.00, 'research'), -- "Tirze" corrected to Tirzepatide
  ('Tirzepatide 30mg', 10500.00, 'research'),
  ('Retatrutide 10mg', 7500.00, 'research'),
  ('Retatrutide 20mg', 10500.00, 'research'),
  ('AOD-9604 5mg', 7500.00, 'research'),
  ('AHK-Cu 100mg', 7500.00, 'cosmetic'),
  ('BPC-157 5mg + TB500 5mg', 7500.00, 'research'),
  ('BPC-157 10mg', 6000.00, 'research'),
  ('CJC-1295 w/o dac + Ipamorelin 10mg', 7500.00, 'research'),
  ('Cagrilintide 5mg', 8400.00, 'research'), -- "Cargilintide" corrected to Cagrilintide
  ('Cagrilintide 10mg', 9900.00, 'research'),
  ('DSIP 5mg', 6000.00, 'research'),
  ('Epithalon 50mg', 9900.00, 'wellness'),
  ('GHK-CU 100mg', 5400.00, 'cosmetic'),
  ('Glutathione 1500mg', 6900.00, 'wellness'),
  ('GLOW 70mg', 8400.00, 'wellness'),
  ('Ipamorelin 10mg', 6000.00, 'research'), -- "Ipamoreline" corrected
  ('KLOW 80mg', 7500.00, 'wellness'),
  ('Kisspeptin 10mg', 9000.00, 'research'),
  ('KPV 10mg', 6000.00, 'research'),
  ('NAD+ 100mg', 5400.00, 'wellness'),
  ('NAD+ 500mg', 8400.00, 'wellness'),
  ('Mots-C 10mg', 7500.00, 'research'),
  ('Mots-C 40mg', 9000.00, 'research'),
  ('PT-141 10mg', 6000.00, 'research'),
  ('Selank 5mg', 5400.00, 'wellness'),
  ('Selank 10mg', 6900.00, 'wellness'),
  ('Semax 10mg', 6900.00, 'wellness'),
  ('Snap 8 10mg', 4500.00, 'cosmetic'),
  ('SS-31 10mg', 8400.00, 'research'),
  ('SS-31 50mg', 11400.00, 'research'),
  ('Tesamorelin 5mg', 7500.00, 'research'), -- "Tesamoreline" corrected
  ('TB500 5mg', 6000.00, 'research'),
  ('Thymosin Alpha 5mg', 8400.00, 'research'), -- "Thmosin" corrected
  ('5 Amino - 1mq 5mg', 6000.00, 'research'),
  ('5 Amino - 1mq 10mg', 7500.00, 'research'),
  ('Lemon Bottle 10ml', 4500.00, 'cosmetic'),
  ('Lipo - C with B12 10ml', 3600.00, 'cosmetic'),
  ('FAT BLASTER LIPO-C', 9900.00, 'cosmetic');

  -- Ensure categories exist (just in case)
  INSERT INTO categories (id, name, icon, sort_order, active) VALUES
  ('research', 'Research Peptides', 'FlaskConical', 1, true),
  ('cosmetic', 'Cosmetic & Skincare', 'Sparkles', 2, true),
  ('wellness', 'Wellness & Support', 'Leaf', 3, true)
  ON CONFLICT (id) DO NOTHING;

  -- Iterate and UPSERT
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN SELECT * FROM new_products LOOP
      IF EXISTS (SELECT 1 FROM products WHERE name = r.p_name) THEN
        -- Update existing
        UPDATE products 
        SET 
          base_price = r.p_price,
          inclusions = v_inclusions,
          category = r.p_category,
          updated_at = NOW()
        WHERE name = r.p_name;
      ELSE
        -- Insert new
        INSERT INTO products (
          name, 
          description, 
          category, 
          base_price, 
          inclusions, 
          available, 
          stock_quantity,
          image_url,
          featured
        ) VALUES (
          r.p_name,
          r.p_name || ' - High quality ' || r.p_category || ' product.', -- Generic description based on name
          r.p_category,
          r.p_price,
          v_inclusions,
          true,
          100, -- Default stock
          NULL, -- No image yet
          false
        );
      END IF;
    END LOOP;
  END;

  DROP TABLE new_products;
END $$;
