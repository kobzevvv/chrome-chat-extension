-- Database Queries for Resume Link Extraction System
-- Using physical tables only (no views)

-- ============================================
-- 1. RESUME_LINKS TABLE
-- ============================================

-- Create resume_links table
CREATE TABLE IF NOT EXISTS resume_links (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  vacancy_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  title TEXT,
  extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP,
  error TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_resume_links_vacancy_id ON resume_links(vacancy_id);
CREATE INDEX IF NOT EXISTS idx_resume_links_processed ON resume_links(processed);
CREATE INDEX IF NOT EXISTS idx_resume_links_extracted_at ON resume_links(extracted_at);

-- Insert new resume links (with duplicate handling)
INSERT INTO resume_links (url, vacancy_id, page_number, title) 
VALUES ($1, $2, $3, $4) 
ON CONFLICT (url) DO NOTHING;

-- Get all links for a specific vacancy
SELECT * FROM resume_links 
WHERE vacancy_id = $1 
ORDER BY page_number, extracted_at;

-- Get unprocessed links
SELECT * FROM resume_links 
WHERE processed = FALSE 
ORDER BY extracted_at ASC 
LIMIT $1;

-- Mark link as processed
UPDATE resume_links 
SET processed = TRUE, processed_at = NOW() 
WHERE id = $1;

-- Mark link as failed
UPDATE resume_links 
SET processed = TRUE, processed_at = NOW(), error = $2 
WHERE id = $1;

-- Get statistics by vacancy
SELECT 
  vacancy_id,
  COUNT(*) as total_links,
  COUNT(CASE WHEN processed THEN 1 END) as processed_links,
  COUNT(CASE WHEN error IS NOT NULL THEN 1 END) as failed_links,
  MIN(extracted_at) as first_extracted,
  MAX(extracted_at) as last_extracted
FROM resume_links 
GROUP BY vacancy_id
ORDER BY last_extracted DESC;

-- ============================================
-- 2. RESUME_HTML_CONTENT TABLE
-- ============================================

-- Create resume_html_content table
CREATE TABLE IF NOT EXISTS resume_html_content (
  id BIGSERIAL PRIMARY KEY,
  resume_id TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  html_content TEXT NOT NULL,
  html_cleaned_version VARCHAR(10) DEFAULT '1.0',
  html_original_size INT,
  html_cleaned_size INT,
  reduction_percent INT,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_resume_html_content_resume_id ON resume_html_content(resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_html_content_extracted_at ON resume_html_content(extracted_at);

-- Insert new resume HTML content
INSERT INTO resume_html_content (
  resume_id, 
  source_url, 
  html_content, 
  html_original_size, 
  html_cleaned_size, 
  reduction_percent
) VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (resume_id) DO UPDATE SET
  html_content = EXCLUDED.html_content,
  html_original_size = EXCLUDED.html_original_size,
  html_cleaned_size = EXCLUDED.html_cleaned_size,
  reduction_percent = EXCLUDED.reduction_percent,
  extracted_at = NOW();

-- Check if resume already exists
SELECT id FROM resume_html_content 
WHERE resume_id = $1;

-- Get resume HTML by ID
SELECT * FROM resume_html_content 
WHERE resume_id = $1;

-- Get recent extractions
SELECT 
  resume_id,
  source_url,
  html_original_size,
  html_cleaned_size,
  reduction_percent,
  extracted_at
FROM resume_html_content 
ORDER BY extracted_at DESC 
LIMIT $1;

-- ============================================
-- 3. COMBINED QUERIES
-- ============================================

-- Get resume links with their HTML content status
SELECT 
  rl.id,
  rl.url,
  rl.vacancy_id,
  rl.title,
  rl.extracted_at as link_extracted_at,
  rl.processed,
  rl.error,
  CASE 
    WHEN rhc.id IS NOT NULL THEN 'extracted'
    ELSE 'pending'
  END as html_status,
  rhc.extracted_at as html_extracted_at
FROM resume_links rl
LEFT JOIN resume_html_content rhc 
  ON rl.url = rhc.source_url
WHERE rl.vacancy_id = $1
ORDER BY rl.page_number, rl.extracted_at;

-- Get extraction progress by vacancy
SELECT 
  rl.vacancy_id,
  COUNT(DISTINCT rl.id) as total_links,
  COUNT(DISTINCT rhc.id) as extracted_resumes,
  ROUND(COUNT(DISTINCT rhc.id)::numeric / COUNT(DISTINCT rl.id) * 100, 2) as progress_percent
FROM resume_links rl
LEFT JOIN resume_html_content rhc 
  ON rl.url = rhc.source_url
GROUP BY rl.vacancy_id
ORDER BY rl.vacancy_id;

-- Get next batch of unprocessed links
SELECT 
  rl.id,
  rl.url,
  rl.vacancy_id,
  rl.title
FROM resume_links rl
LEFT JOIN resume_html_content rhc 
  ON rl.url = rhc.source_url
WHERE rl.processed = FALSE 
  AND rl.error IS NULL
  AND rhc.id IS NULL
ORDER BY rl.extracted_at ASC
LIMIT $1;

-- ============================================
-- 4. MAINTENANCE QUERIES
-- ============================================

-- Clean up old failed extractions (older than 30 days)
DELETE FROM resume_links 
WHERE processed = TRUE 
  AND error IS NOT NULL 
  AND processed_at < NOW() - INTERVAL '30 days';

-- Reset failed extractions for retry
UPDATE resume_links 
SET processed = FALSE, error = NULL, processed_at = NULL 
WHERE processed = TRUE 
  AND error IS NOT NULL 
  AND vacancy_id = $1;

-- Get database size info
SELECT 
  'resume_links' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('resume_links')) as total_size
UNION ALL
SELECT 
  'resume_html_content' as table_name,
  COUNT(*) as row_count,
  pg_size_pretty(pg_total_relation_size('resume_html_content')) as total_size;