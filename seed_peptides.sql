-- Seeding Script for Peptide Store (Clinical Futurism Theme)
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

-- 2. SEED DATA
DO $$
DECLARE
    -- Category IDs
    cat_weight TEXT := 'weight-management';
    cat_repair TEXT := 'recovery-repair';
    cat_growth TEXT := 'growth-performance';
    cat_essentials TEXT := 'essentials-supplies';
    
    -- Product IDs
    id_tirzepatide UUID;
    id_semaglutide UUID;
    id_bpc157 UUID;
    id_tb500 UUID;
    id_bacwater UUID;
    id_syringes UUID;
    id_cjc1295 UUID;
    id_ipamorelin UUID;

BEGIN
    -- CLEANUP (Safe delete)
    DELETE FROM recommendation_rules;
    DELETE FROM product_variations;
    DELETE FROM products;
    DELETE FROM categories;

    -- INSERT CATEGORIES
    INSERT INTO categories (id, name, icon, sort_order, active) VALUES
    (cat_weight, 'Weight Management', 'Scale', 1, true),
    (cat_repair, 'Recovery & Repair', 'Heart', 2, true),
    (cat_growth, 'Growth & Performance', 'Zap', 3, true),
    (cat_essentials, 'Essentials & Supplies', 'Package', 4, true);

    -- INSERT PRODUCTS
    
    -- Tirzepatide
    INSERT INTO products (name, description, category, base_price, purity_percentage, molecular_weight, storage_conditions, featured, available, stock_quantity, image_url)
    VALUES (
        'Tirzepatide', 
        'A dual GIP and GLP-1 receptor agonist. Known for its distinct ability to support metabolic health and weight management by mimicking natural hormones.', 
        cat_weight, 
        2800.00, 
        99.00, 
        '4813.45 g/mol', 
        'Store at -20°C', 
        true, 
        true, 
        100,
        NULL
    ) RETURNING id INTO id_tirzepatide;

    -- Semaglutide
    INSERT INTO products (name, description, category, base_price, purity_percentage, molecular_weight, storage_conditions, featured, available, stock_quantity, image_url)
    VALUES (
        'Semaglutide', 
        'A GLP-1 receptor agonist commonly researched for its effects on insulin secretion and appetite regulation.', 
        cat_weight, 
        2200.00, 
        99.00, 
        '4113.58 g/mol', 
        'Store at -20°C', 
        true, 
        true, 
        100,
        NULL
    ) RETURNING id INTO id_semaglutide;

    -- BPC-157
    INSERT INTO products (name, description, category, base_price, purity_percentage, molecular_weight, storage_conditions, featured, available, stock_quantity, image_url)
    VALUES (
        'BPC-157', 
        'Body Protection Compound-157 is a pentadecapeptide composed of 15 amino acids, researched for its cytoprotective and reparative properties in tissues.', 
        cat_repair, 
        1500.00, 
        99.50, 
        '1419.5 g/mol', 
        'Store at -20°C', 
        true, 
        true, 
        150,
        NULL
    ) RETURNING id INTO id_bpc157;

    -- TB-500
    INSERT INTO products (name, description, category, base_price, purity_percentage, molecular_weight, storage_conditions, featured, available, stock_quantity)
    VALUES (
        'TB-500', 
        'Synthetic fraction of the protein thymosin beta-4, present in virtually all human and animal cells. Studied for its role in healing and cell migration.', 
        cat_repair, 
        1600.00, 
        99.00, 
        '4963.5 g/mol', 
        'Store at -20°C', 
        false, 
        true, 
        120
    ) RETURNING id INTO id_tb500;

    -- CJC-1295
    INSERT INTO products (name, description, category, base_price, purity_percentage, molecular_weight, storage_conditions, featured, available, stock_quantity)
    VALUES (
        'CJC-1295 (No DAC)', 
        'Tetrasubstituted 30-amino acid peptide hormone, primarily functioning as a growth hormone releasing hormone (GHRH) analog.', 
        cat_growth, 
        1400.00, 
        99.00, 
        '3367.97 g/mol', 
        'Store at -20°C', 
        false, 
        true, 
        80
    ) RETURNING id INTO id_cjc1295;

     -- Ipamorelin
    INSERT INTO products (name, description, category, base_price, purity_percentage, molecular_weight, storage_conditions, featured, available, stock_quantity)
    VALUES (
        'Ipamorelin', 
        'A pentapeptide and a ghrelin mimetic. It mimics the growth hormone releasing effects of ghrelin without the hunger side effects.', 
        cat_growth, 
        1400.00, 
        99.00, 
        '711.85 g/mol', 
        'Store at -20°C', 
        false, 
        true, 
        90
    ) RETURNING id INTO id_ipamorelin;


    -- Essentials
    INSERT INTO products (name, description, category, base_price, purity_percentage, molecular_weight, storage_conditions, featured, available, stock_quantity)
    VALUES (
        'Bacteriostatic Water', 
        'Sterile water containing 0.9% benzyl alcohol, used for dissolving or diluting medications or peptides.', 
        cat_essentials, 
        350.00, 
        100.00, 
        '18.015 g/mol', 
        'Room Temperature', 
        false, 
        true, 
        500
    ) RETURNING id INTO id_bacwater;

    INSERT INTO products (name, description, category, base_price, purity_percentage, molecular_weight, storage_conditions, featured, available, stock_quantity)
    VALUES (
        'Insulin Syringes (10-pack)', 
        'High-quality, sterile insulin syringes for precise research applications. 1ml, 29G.', 
        cat_essentials, 
        150.00, 
        100.00, 
        NULL, 
        'Room Temperature', 
        false, 
        true, 
        1000
    ) RETURNING id INTO id_syringes;


    -- INSERT VARIATIONS
    INSERT INTO product_variations (product_id, name, quantity_mg, price, stock_quantity) VALUES
    (id_tirzepatide, '5mg Vial', 5.0, 2800.00, 100),
    (id_tirzepatide, '10mg Vial', 10.0, 4500.00, 50),
    (id_tirzepatide, '15mg Vial', 15.0, 5800.00, 30);

    INSERT INTO product_variations (product_id, name, quantity_mg, price, stock_quantity) VALUES
    (id_semaglutide, '2mg Vial', 2.0, 2200.00, 100),
    (id_semaglutide, '5mg Vial', 5.0, 3800.00, 50);

    INSERT INTO product_variations (product_id, name, quantity_mg, price, stock_quantity) VALUES
    (id_bpc157, '5mg Vial', 5.0, 1500.00, 150),
    (id_bpc157, '10mg Vial', 10.0, 2500.00, 50);

END $$;
