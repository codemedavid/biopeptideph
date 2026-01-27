-- Seeding Script for Peptide Store (Clinical Futurism Theme)
-- Updated with 40+ products, 3x pricing, and refined categories
-- Run this in the Supabase SQL Editor

-- 1. SCHEMA SETUP (Ensure tables exist)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL REFERENCES categories(id),
  base_price DECIMAL(10,2) NOT NULL,
  discount_price DECIMAL(10,2),
  discount_start_date TIMESTAMPTZ,
  discount_end_date TIMESTAMPTZ,
  discount_active BOOLEAN DEFAULT false,
  purity_percentage DECIMAL(5,2) DEFAULT 99.00,
  molecular_weight TEXT,
  cas_number TEXT,
  sequence TEXT,
  storage_conditions TEXT DEFAULT 'Store at -20°C',
  stock_quantity INTEGER DEFAULT 0,
  available BOOLEAN DEFAULT true,
  featured BOOLEAN DEFAULT false,
  image_url TEXT,
  safety_sheet_url TEXT,
  inclusions TEXT[], 
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity_mg DECIMAL(10,2) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  stock_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure inclusions column exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'inclusions') THEN
        ALTER TABLE products ADD COLUMN inclusions TEXT[];
    END IF;
END $$;


-- 2. SEED DATA
DO $$
DECLARE
    -- Category IDs
    cat_all TEXT := 'all';
    cat_weight TEXT := 'weight-loss';
    cat_repair TEXT := 'recovery';
    cat_cosmetic TEXT := 'beauty';
    cat_wellness TEXT := 'anti-aging';
    
    -- Inclusions
    v_inclusions text[] := ARRAY['Syringe for Reconstitution', '6pcs Insulin Syringes', '10pcs Alcohol Pads', 'Transparent vial case'];

BEGIN
    -- CLEANUP (Safe delete)
    DELETE FROM recommendation_rules;
    DELETE FROM product_variations;
    DELETE FROM products;
    DELETE FROM categories;

    -- INSERT CATEGORIES
    -- Added 'all' category as requested
    INSERT INTO categories (id, name, icon, sort_order, active) VALUES
    (cat_all, 'All', 'Grid', 0, true),
    (cat_weight, 'Weight Loss', 'Scale', 1, true),
    (cat_repair, 'Recovery', 'Activity', 2, true),
    (cat_cosmetic, 'Beauty', 'Sparkles', 3, true),
    (cat_wellness, 'Anti-Aging', 'Leaf', 4, true);

    -- INSERT PRODUCTS
    
    -- === WEIGHT MANAGEMENT === (GLP-1s, Fat Loss)
    INSERT INTO products (name, description, category, base_price, inclusions, available, stock_quantity, featured) VALUES
    ('Semaglutide 5mg', 'Semaglutide 5mg - Premium weight management research peptide.', cat_weight, 5697.00, v_inclusions, true, 100, true),
    ('Semaglutide 10mg', 'Semaglutide 10mg - Premium weight management research peptide.', cat_weight, 7500.00, v_inclusions, true, 100, false),
    ('Tirzepatide 15mg', 'Tirzepatide 15mg - Advanced dual-agonist research peptide.', cat_weight, 6000.00, v_inclusions, true, 100, true),
    ('Tirzepatide 30mg', 'Tirzepatide 30mg - Advanced dual-agonist research peptide.', cat_weight, 10500.00, v_inclusions, true, 100, true),
    ('Retatrutide 10mg', 'Retatrutide 10mg - Next-generation triple-agonist research peptide.', cat_weight, 7500.00, v_inclusions, true, 100, false),
    ('Retatrutide 20mg', 'Retatrutide 20mg - Next-generation triple-agonist research peptide.', cat_weight, 10500.00, v_inclusions, true, 100, false),
    ('Cagrilintide 5mg', 'Cagrilintide 5mg - Amylin analog research peptide.', cat_weight, 8400.00, v_inclusions, true, 100, false),
    ('Cagrilintide 10mg', 'Cagrilintide 10mg - Amylin analog research peptide.', cat_weight, 9900.00, v_inclusions, true, 100, false),
    ('AOD-9604 5mg', 'AOD-9604 5mg - Lipolytic fragment research peptide.', cat_weight, 7500.00, v_inclusions, true, 100, false),
    ('Tesamorelin 5mg', 'Tesamorelin 5mg - GHRH analog research peptide.', cat_weight, 7500.00, v_inclusions, true, 100, false),
    ('5 Amino - 1mq 5mg', '5 Amino-1MQ 5mg - NNMT inhibitor research compound.', cat_weight, 6000.00, v_inclusions, true, 100, false),
    ('5 Amino - 1mq 10mg', '5 Amino-1MQ 10mg - NNMT inhibitor research compound.', cat_weight, 7500.00, v_inclusions, true, 100, false);

    -- === RECOVERY & REPAIR === (BPC, TB500)
    INSERT INTO products (name, description, category, base_price, inclusions, available, stock_quantity) VALUES
    ('BPC-157 5mg + TB500 5mg', 'BPC-157 + TB500 Blend - Synergistic recovery research blend.', cat_repair, 7500.00, v_inclusions, true, 100),
    ('BPC-157 10mg', 'BPC-157 10mg - Body Protection Compound research peptide.', cat_repair, 6000.00, v_inclusions, true, 100),
    ('TB500 5mg', 'TB500 5mg - Thymosin Beta-4 research peptide.', cat_repair, 6000.00, v_inclusions, true, 100),
    ('KPV 10mg', 'KPV 10mg - Anti-inflammatory research peptide.', cat_repair, 6000.00, v_inclusions, true, 100);

    -- === COSMETIC & SKINCARE ===
    INSERT INTO products (name, description, category, base_price, inclusions, available, stock_quantity) VALUES
    ('GHK-CU 100mg', 'GHK-Cu 100mg - Copper peptide for cosmetic research.', cat_cosmetic, 5400.00, v_inclusions, true, 100),
    ('AHK-Cu 100mg', 'AHK-Cu 100mg - Advanced copper peptide for hair/skin research.', cat_cosmetic, 7500.00, v_inclusions, true, 100),
    ('Snap 8 10mg', 'Snap 8 10mg - Octapeptide anti-wrinkle research solution.', cat_cosmetic, 4500.00, v_inclusions, true, 100),
    ('Lemon Bottle 10ml', 'Lemon Bottle 10ml - Premium lipolytic solution.', cat_cosmetic, 4500.00, v_inclusions, true, 100),
    ('Lipo - C with B12 10ml', 'Lipo-C with B12 10ml - Lipotropic injection solution.', cat_cosmetic, 3600.00, v_inclusions, true, 100),
    ('FAT BLASTER LIPO-C', 'FAT BLASTER LIPO-C - Advanced formula lipolytic solution.', cat_cosmetic, 9900.00, v_inclusions, true, 100);

    -- === WELLNESS & ANTI-AGING ===
    INSERT INTO products (name, description, category, base_price, inclusions, available, stock_quantity) VALUES
    ('Epithalon 50mg', 'Epithalon 50mg - Telomere activation research peptide.', cat_wellness, 9900.00, v_inclusions, true, 100),
    ('Glutathione 1500mg', 'Glutathione 1500mg - Master antioxidant research compound.', cat_wellness, 6900.00, v_inclusions, true, 100),
    ('NAD+ 100mg', 'NAD+ 100mg - Cellular energy coenzyme.', cat_wellness, 5400.00, v_inclusions, true, 100),
    ('NAD+ 500mg', 'NAD+ 500mg - Cellular energy coenzyme.', cat_wellness, 8400.00, v_inclusions, true, 100),
    ('Mots-C 10mg', 'Mots-C 10mg - Mitochondrial derived peptide.', cat_wellness, 7500.00, v_inclusions, true, 100),
    ('Mots-C 40mg', 'Mots-C 40mg - Mitochondrial derived peptide.', cat_wellness, 9000.00, v_inclusions, true, 100),
    ('SS-31 10mg', 'SS-31 10mg - Mitochondrial targeted antioxidant.', cat_wellness, 8400.00, v_inclusions, true, 100),
    ('SS-31 50mg', 'SS-31 50mg - Mitochondrial targeted antioxidant.', cat_wellness, 11400.00, v_inclusions, true, 100),
    ('Thymosin Alpha 5mg', 'Thymosin Alpha 1 5mg - Immune modulating research peptide.', cat_wellness, 8400.00, v_inclusions, true, 100),
    ('DSIP 5mg', 'DSIP 5mg - Sleep regulation research peptide.', cat_wellness, 6000.00, v_inclusions, true, 100),
    ('Selank 5mg', 'Selank 5mg - Nootropic anxiolytic peptide.', cat_wellness, 5400.00, v_inclusions, true, 100),
    ('Selank 10mg', 'Selank 10mg - Nootropic anxiolytic peptide.', cat_wellness, 6900.00, v_inclusions, true, 100),
    ('Semax 10mg', 'Semax 10mg - Cognitive enhancement peptide.', cat_wellness, 6900.00, v_inclusions, true, 100),
    ('PT-141 10mg', 'PT-141 10mg - Melanocortin agonist research peptide.', cat_wellness, 6000.00, v_inclusions, true, 100),
    ('Kisspeptin 10mg', 'Kisspeptin 10mg - Reproductive hormone regulator.', cat_wellness, 9000.00, v_inclusions, true, 100),
    ('CJC-1295 w/o dac + Ipamorelin 10mg', 'CJC-1295 + Ipamorelin Blend - GHRH/GHRP blend.', cat_wellness, 7500.00, v_inclusions, true, 100),
    ('Ipamorelin 10mg', 'Ipamorelin 10mg - Selective GH secretion secretagogue.', cat_wellness, 6000.00, v_inclusions, true, 100),
    ('GLOW 70mg', 'GLOW 70mg - Advanced radiance complex.', cat_wellness, 8400.00, v_inclusions, true, 100),
    ('KLOW 80mg', 'KLOW 80mg - Advanced vitality complex.', cat_wellness, 7500.00, v_inclusions, true, 100);

END $$;
