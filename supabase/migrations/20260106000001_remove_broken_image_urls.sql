-- Migration to remove broken R2 bucket image URLs
-- Created: 2026-01-06

DO $$
BEGIN
  -- Update products that have the broken R2 domain in their image_url
  UPDATE products 
  SET image_url = NULL 
  WHERE image_url LIKE '%pub-88099e2a05cb4c8ea54d3ca3495f2648.r2.dev%';
  
  -- Log the result (optional, but good for debugging if run manually in SQL editor)
  RAISE NOTICE 'Cleaned up broken image URLs';
END $$;
