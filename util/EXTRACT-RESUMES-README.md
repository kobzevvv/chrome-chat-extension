# Resume HTML Extraction Tool

This tool extracts resume HTML content from URLs stored in the `resume_links` table and saves cleaned HTML to the `resume_html_content` table.

## Features

- **Variable extraction count** - Extract any number of resumes (default: 50)
- **HTML cleaning** - Removes scripts, styles, comments, and other irrelevant content
- **Size reduction tracking** - Shows how much space was saved
- **Batch processing** - Processes resumes in batches to avoid overload
- **Resume deduplication** - Skips already extracted resumes
- **Error handling** - Continues on errors and marks failed extractions

## Usage

```bash
# Extract default 50 resumes
npm run extract:resumes

# Extract specific number of resumes
npm run extract:resumes 100

# Or run directly
node util/extract-resumes.js 200
```

## HTML Cleaning Process

The script removes:
1. `<script>` tags and content
2. `<style>` tags and content
3. HTML comments `<!-- -->`
4. `<meta>`, `<link>`, `<noscript>` tags
5. Event handlers (`onclick`, `onload`, etc.)
6. Inline styles (`style=""`)
7. Tracking attributes (`data-gtm-*`, `data-analytics-*`)
8. Excessive whitespace

## Database Schema

```sql
CREATE TABLE resume_html_content (
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
)
```

## Process Flow

1. **Check resume_links table** for unprocessed URLs
2. **Extract resume ID** from each URL
3. **Check if already extracted** in resume_html_content
4. **Fetch HTML** from HH.ru (tries print version)
5. **Clean HTML** to remove waste
6. **Save to database** with size metrics
7. **Mark as processed** in resume_links table

## Performance

- Processes in batches of 10 resumes
- 1 second delay between requests
- Shows progress for each resume
- Provides summary statistics at the end

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 Resume HTML Extractor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Will extract: 100 resumes
Batch size: 10

📋 Found 100 unprocessed resume links

🔄 Processing batch 1/10
📥 [1/100] Fetching: eb6a98c0000f30b1ee0097a6044d4958673372
✅ [1/100] Saved: eb6a98c0000f30b1ee0097a6044d4958673372 (reduced 78%)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Extraction Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total processed: 100
✅ Successful: 85
❌ Failed: 5
⏭️  Already extracted: 10
```

## Monitoring

Check extraction results:
```sql
-- View recent extractions
SELECT 
  resume_id,
  html_original_size,
  html_cleaned_size,
  reduction_percent,
  extracted_at
FROM resume_html_content
ORDER BY extracted_at DESC
LIMIT 10;

-- Average size reduction
SELECT 
  AVG(reduction_percent) as avg_reduction,
  SUM(html_original_size) as total_original,
  SUM(html_cleaned_size) as total_cleaned
FROM resume_html_content;

-- Failed extractions
SELECT 
  url,
  error,
  processed_at
FROM resume_links
WHERE processed = true AND error IS NOT NULL;
```

## Next Steps

After extraction, you can:
1. Parse the cleaned HTML using `resume-parser.js`
2. Store structured data in the `resumes` table
3. Compare performance vs. full HTML storage