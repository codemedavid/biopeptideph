-- Create a new migration file to update the site branding
-- This updates the site_settings table if it exists

INSERT INTO site_settings (id, value)
VALUES 
  ('site_name', 'BIOPEPTIDESPH'),
  ('site_description', 'The Science of Renewal'),
  ('home_hero_badge', 'The Science of Renewal'),
  ('home_hero_title_prefix', 'Premium'),
  ('home_hero_title_highlight', 'Peptides'),
  ('home_hero_title_suffix', '& Essentials'),
  ('home_hero_tagline', 'Quality-tested products. Reliable performance. Trusted by our community.')
ON CONFLICT (id) DO UPDATE 
SET value = EXCLUDED.value;
