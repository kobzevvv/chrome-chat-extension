# Resume Extraction CLI

A simple command-line tool for extracting and managing HH.ru resume data using an ELT (Extract, Load, Transform) approach.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the API server:**
   ```bash
   npm run api
   ```

3. **Extract a resume (uses default test URL):**
   ```bash
   npm run extract
   ```

## Available Commands

### Extract from URL
```bash
# Extract default test resume
npm run extract

# Extract specific resume
node util/extract-cli.js extract https://hh.ru/resume/eb6a98c0000f30b1ee0097a6044d4958673372

# Using curl directly
curl -X POST http://localhost:4000/extract-url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://ufa.hh.ru/resume/eb6a98c0000f30b1ee0097a6044d4958673372"}'
```
-- eb6a98c0000f30b1ee0097a6044d4958673372
### List Unprocessed Extracts
```bash
npm run extract:list
```

### Get Help
```bash
npm run extract:help
```

## ELT Workflow

1. **Extract**: Raw HTML is saved to `resume_extracts` table
2. **Load**: HTML is stored as-is with metadata
3. **Transform**: Process extracts later to create structured data

## API Endpoints

- `POST /extract-url` - Initiate extraction from URL
- `POST /extract` - Save raw HTML extract
- `GET /extracts/unprocessed` - List unprocessed extracts
- `POST /extracts/:id/processed` - Mark extract as processed

## Database Schema

```sql
CREATE TABLE resume_extracts (
  id BIGSERIAL PRIMARY KEY,
  resume_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  html_content TEXT NOT NULL,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);
```

## Next Steps

To complete the ELT pipeline:

1. **Implement HTML fetching** (Chrome extension or server-side with Puppeteer)
2. **Create transformation job** to parse HTML and populate structured tables
3. **Set up Cloudflare Worker** for webhook-triggered extraction

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string (required)
- `API_URL` - API server URL (default: http://localhost:4000)
- `PORT` - API server port (default: 4000)