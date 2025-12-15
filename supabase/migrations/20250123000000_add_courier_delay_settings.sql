-- Add courier delay settings if they don't exist

INSERT INTO site_settings (id, value, type, description)
VALUES 
  ('jnt_delay_active', 'false', 'boolean', 'Toggle J&T delay notice on checkout'),
  ('lalamove_delay_active', 'false', 'boolean', 'Toggle Lalamove delay notice on checkout'),
  ('jnt_delay_message', 'J&T orders may take a while due to high volume.', 'string', 'Message shown when J&T delay is active'),
  ('lalamove_delay_message', 'Lalamove pickup is scheduled. Please wait for confirmation.', 'string', 'Message shown when Lalamove delay is active')
ON CONFLICT (id) DO NOTHING;
