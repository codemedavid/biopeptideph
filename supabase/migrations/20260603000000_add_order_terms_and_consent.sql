-- Phase 1 (#8): Terms & Conditions before checkout
-- Adds consent columns to orders and seeds editable T&C content in site_settings.
-- Idempotent: safe to run more than once.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Editable Terms & Conditions content (admin edits this via the dashboard).
INSERT INTO site_settings (id, value, type, description)
VALUES (
  'terms_and_conditions_content',
  E'By placing a preorder you agree to the following:\n\n'
  || E'1. Group Buy / Preorder — Items are ordered in batches. Delivery timelines depend on the group buy schedule and supplier lead times.\n'
  || E'2. Payment — Orders are confirmed only after full payment and a valid proof of payment are received.\n'
  || E'3. No Cancellations — Once a group buy closes and the bulk order is placed with the supplier, orders cannot be cancelled or refunded.\n'
  || E'4. Shipping — Shipping fees are shouldered by the customer. We are not liable for courier delays.\n'
  || E'5. Products — All products are research-use peptides. The customer is responsible for lawful and safe handling.\n',
  'text',
  'Terms & Conditions shown and required before checkout'
)
ON CONFLICT (id) DO NOTHING;
