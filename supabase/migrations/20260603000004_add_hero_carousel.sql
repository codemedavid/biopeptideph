-- Hero Carousel (admin-managed homepage slides)
-- Each slide is an image with OPTIONAL title/subtitle/CTA. The storefront shows
-- active slides ordered by sort_order; if none exist the homepage falls back to
-- the existing static hero. Idempotent: safe to run more than once.

CREATE TABLE IF NOT EXISTS hero_carousel_slides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url   text NOT NULL,
  title       text,
  subtitle    text,
  button_text text,
  button_link text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hero_carousel_sort_idx ON hero_carousel_slides(sort_order ASC);
CREATE INDEX IF NOT EXISTS hero_carousel_active_idx ON hero_carousel_slides(is_active);

-- Admin operates via the anon key (dashboard is password-gated client-side), so
-- both read and write must be permitted — consistent with the rest of the schema.
ALTER TABLE hero_carousel_slides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hero_carousel public read" ON hero_carousel_slides;
CREATE POLICY "hero_carousel public read" ON hero_carousel_slides FOR SELECT USING (true);
DROP POLICY IF EXISTS "hero_carousel open write" ON hero_carousel_slides;
CREATE POLICY "hero_carousel open write" ON hero_carousel_slides FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime so admin changes reflect on the homepage instantly.
-- Wrapped so the migration never fails if the publication is absent/already set.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE hero_carousel_slides;
EXCEPTION WHEN others THEN NULL;
END $$;
