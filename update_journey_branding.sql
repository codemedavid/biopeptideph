-- Update the 'values' section title and content in journey_sections table
UPDATE journey_sections
SET 
  title = REPLACE(title, 'Peptology', 'Biopeptidesph'),
  content = REPLACE(content, 'Peptology', 'Biopeptidesph')
WHERE section_identifier = 'values';

-- Also checking other sections just in case
UPDATE journey_sections
SET 
  title = REPLACE(title, 'Peptology', 'Biopeptidesph'),
  content = REPLACE(content, 'Peptology', 'Biopeptidesph')
WHERE section_identifier != 'values' 
  AND (title LIKE '%Peptology%' OR content LIKE '%Peptology%');

-- Verify the changes
SELECT section_identifier, title, content 
FROM journey_sections 
WHERE title LIKE '%Biopeptidesph%' OR content LIKE '%Biopeptidesph%';
