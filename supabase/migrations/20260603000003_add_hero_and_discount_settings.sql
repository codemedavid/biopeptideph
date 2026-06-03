-- Phase 4 (#5, #7): Hero CMS + Global Discount settings
-- Seeds editable site_settings keys (admin manages them from the dashboard).
-- Idempotent: ON CONFLICT DO NOTHING preserves any existing values.

INSERT INTO site_settings (id, value, type, description) VALUES
  -- Hero section (#5)
  ('home_hero_image_url', '', 'image',  'Homepage hero background image URL'),
  ('home_hero_cta_text',  '', 'string', 'Homepage hero primary CTA button text (falls back to Explore GB / Explore Products)'),
  ('home_hero_cta_link',  '', 'string', 'Homepage hero primary CTA link (optional; blank scrolls to products)'),

  -- Global discount (#7)
  ('global_discount_active', 'false',      'boolean', 'Sitewide discount on/off'),
  ('global_discount_type',   'percentage', 'string',  'Sitewide discount type: percentage | fixed'),
  ('global_discount_value',  '0',          'number',  'Sitewide discount amount (percent or fixed currency units)'),
  ('global_discount_start',  '',           'string',  'Sitewide discount start (ISO datetime, optional)'),
  ('global_discount_end',    '',           'string',  'Sitewide discount end (ISO datetime, optional)')
ON CONFLICT (id) DO NOTHING;
