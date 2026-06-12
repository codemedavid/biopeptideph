-- Make the group-buy "number" a free-text label.
--
-- Originally gb_number was an integer (auto-suggested sequential round number).
-- Admins now want to label rounds freely — "5", "Mini GB", "Holiday Round", etc.
-- So gb_number becomes text, and the orders snapshot column follows.
-- Idempotent-ish: guarded so re-running on an already-text column is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_buys' AND column_name = 'gb_number'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE group_buys ALTER COLUMN gb_number TYPE text USING gb_number::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'group_buy_number'
      AND data_type <> 'text'
  ) THEN
    ALTER TABLE orders ALTER COLUMN group_buy_number TYPE text USING group_buy_number::text;
  END IF;
END $$;

-- Free-text labels may legitimately repeat, so drop the uniqueness requirement.
DROP INDEX IF EXISTS group_buys_gb_number_idx;
CREATE INDEX IF NOT EXISTS group_buys_gb_number_idx ON group_buys(gb_number);
