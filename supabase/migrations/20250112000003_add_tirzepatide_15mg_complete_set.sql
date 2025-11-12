-- Migration: Add Tirzepatide Complete Set as a sample product
-- This product will showcase the complete set inclusions feature

-- Insert the new product with inclusions
INSERT INTO products (
  name, 
  description, 
  category, 
  base_price, 
  purity_percentage, 
  molecular_weight, 
  cas_number, 
  sequence, 
  storage_conditions,
  featured, 
  available, 
  stock_quantity,
  image_url,
  inclusions
) VALUES (
  'Tirzepatide Complete Set',
  'Premium complete set of Tirzepatide for research purposes. This glucose-dependent insulinotropic polypeptide (GIP) and glucagon-like peptide-1 (GLP-1) receptor agonist comes with everything you need to start your research. Our complete set includes the peptide vial plus all necessary supplies and comprehensive guidance.',
  'research',
  1850.00,
  99.5,
  '4813.5 g/mol',
  '2023788-19-2',
  'Multi-unnatural AA GIP/GLP-1 dual agonist',
  'Store at -20°C, protect from light',
  true,
  true,
  25,
  'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&q=80',
  ARRAY[
    '🧬 Peptide and bacteriostatic water',
    '🧬 Syringe for reconstitution',
    '🧬 6pcs Insulin Syringe',
    '🧬 Plastic container and box',
    '🧬 10pcs alcohol pads'
  ]
);

-- Add size variations for the complete set
INSERT INTO product_variations (product_id, name, quantity_mg, price, stock_quantity)
SELECT id, '5mg Complete Set', 5.0, 850.00, 30 FROM products WHERE name = 'Tirzepatide Complete Set'
UNION ALL
SELECT id, '10mg Complete Set', 10.0, 1450.00, 25 FROM products WHERE name = 'Tirzepatide Complete Set'
UNION ALL
SELECT id, '15mg Complete Set', 15.0, 1850.00, 25 FROM products WHERE name = 'Tirzepatide Complete Set'
UNION ALL
SELECT id, '20mg Complete Set', 20.0, 2350.00, 20 FROM products WHERE name = 'Tirzepatide Complete Set'
UNION ALL
SELECT id, '30mg Complete Set', 30.0, 3200.00, 15 FROM products WHERE name = 'Tirzepatide Complete Set';

-- Note: This is a sample product to demonstrate the complete set inclusions feature
-- You can edit this product in the Admin Panel to customize the inclusions list

