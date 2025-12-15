-- Add homepage settings

INSERT INTO site_settings (id, value, type, description)
VALUES 
  ('home_hero_badge', 'Peptides & Essentials', 'string', 'Badge text on homepage hero'),
  ('home_hero_title_prefix', 'Premium', 'string', 'First part of hero title'),
  ('home_hero_title_highlight', 'Peptides', 'string', 'Highlighted part of hero title'),
  ('home_hero_title_suffix', '& Essentials', 'string', 'Last part of hero title'),
  ('home_hero_subtext', '— Trusted Quality for Your Journey.', 'string', 'Subtext next to hero title'),
  ('home_hero_tagline', 'Quality-tested products. Reliable performance. Trusted by our community.', 'string', 'Tagline below hero title'),
  ('home_hero_description', 'Explore our carefully curated selection of high-quality peptides, peptide pens, cartridges, pen needles, and insulin syringes. Each product is personally tested and trusted for purity, safety, and performance — so you can pin with confidence.', 'string', 'Main description text on homepage')
ON CONFLICT (id) DO NOTHING;
