# Database Reference for Data Transformation Repository

## Database Connection

### Required Environment Variables
```bash
DATABASE_URL=postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
# Alternative for some scripts:
NEON_DATABASE_URL=postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### Database Details
- **Type**: PostgreSQL (Neon serverless database)
- **Client Library**: `@neondatabase/serverless`
- **Connection Method**: Via `neon()` function from the library

### Connection Code Example
```javascript
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
```

## Table Structures

### Resume Tables

#### `resumes` - Main resume data table
```sql
CREATE TABLE IF NOT EXISTS resumes (
  resume_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  candidate_name TEXT,
  headline TEXT,
  location TEXT,
  relocation_readiness TEXT,
  age INT,
  birth_date DATE,
  status TEXT,
  employment_type TEXT[],
  schedule TEXT[],
  salary NUMERIC,
  skills TEXT[],
  -- Contacts (convenience columns: first/primary values)
  email_primary TEXT,
  phone_primary_e164 TEXT,
  telegram_primary TEXT,
  contacts_masked BOOLEAN NOT NULL DEFAULT false,
  -- Contact arrays for full data
  emails TEXT[],
  phones_raw TEXT[],
  phones_e164 TEXT[],
  telegrams TEXT[],
  raw_print_html TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resumes_candidate_name ON resumes(candidate_name);
CREATE INDEX idx_resumes_fetched_at ON resumes(fetched_at);
```

#### `resume_experience` - Work experience entries
```sql
CREATE TABLE IF NOT EXISTS resume_experience (
  id BIGSERIAL PRIMARY KEY,
  resume_id TEXT REFERENCES resumes(resume_id) ON DELETE CASCADE,
  company TEXT,
  position TEXT,
  date_from DATE,
  date_to DATE,
  is_current BOOLEAN,
  description TEXT
);

CREATE INDEX idx_resume_experience_resume_id ON resume_experience(resume_id);
```

#### `resume_contacts` - Normalized contacts
```sql
CREATE TABLE IF NOT EXISTS resume_contacts (
  id BIGSERIAL PRIMARY KEY,
  resume_id TEXT REFERENCES resumes(resume_id) ON DELETE CASCADE,
  contact_type TEXT CHECK (contact_type IN ('email','phone','telegram')),
  value_raw TEXT NOT NULL,
  value_normalized TEXT
);

CREATE INDEX idx_resume_contacts_resume_id ON resume_contacts(resume_id);
```

### ELT Tables (Extract, Load, Transform)

#### `resume_extracts` - Raw HTML storage for ELT pipeline
```sql
CREATE TABLE IF NOT EXISTS resume_extracts (
  id BIGSERIAL PRIMARY KEY,
  resume_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  html_content TEXT NOT NULL,
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_resume_extracts_resume_id ON resume_extracts(resume_id);
CREATE INDEX idx_resume_extracts_processed ON resume_extracts(processed);
CREATE INDEX idx_resume_extracts_extracted_at ON resume_extracts(extracted_at);
```

#### `resume_html_content` - Cleaned HTML storage
```sql
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
```

#### `resume_links` - Resume links to process
```sql
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
```

## Data Transformation Code

### Main Parser Function
**File**: `/util/resume-parser.js`
```javascript
parseResume(html, sourceUrl, options = {})
```
Main entry point that:
- Parses HTML using jsdom
- Extracts all resume fields
- Returns structured resume object

### HTML Cleaning Function
**File**: `/util/extract-resumes.js`
```javascript
cleanHTML(html)
```
Removes unnecessary elements:
- Scripts, styles, comments
- Meta tags, tracking attributes
- Event handlers
- Normalizes whitespace

### Utility Functions
**File**: `/util/resume-utils.js`

Key functions:
- `normalizeEmail(email)` - Email validation
- `normalizePhoneE164(rawPhone, defaultRegion)` - Phone to E.164 format
- `extractTelegram(text)` - Extract Telegram handles
- `parseRussianDate(dateStr)` - Convert Russian dates to ISO
- `extractResumeId(url)` - Extract resume ID from URL
- `isMasked(value)` - Detect masked contacts

### CSS Selectors
**File**: `/util/resume-utils.js`
```javascript
const RESUME_SELECTORS = {
  basicInfo: { /* selectors */ },
  personalDetails: { /* selectors */ },
  employmentPreferences: { /* selectors */ },
  skills: { /* selectors */ },
  experience: { /* selectors */ },
  education: { /* selectors */ },
  contacts: { /* selectors */ },
  printVersion: { /* selectors */ }
}
```

## Future Plans and TODOs

### From EXTRACT-README.md:
1. **Implement HTML fetching** - Chrome extension or server-side with Puppeteer
2. **Create transformation job** - Parse HTML and populate structured tables
3. **Set up Cloudflare Worker** - For webhook-triggered extraction

### ELT Workflow Design:
1. **Extract**: Raw HTML saved to `resume_extracts` table
2. **Load**: HTML stored as-is with metadata
3. **Transform**: Process extracts to create structured data

### API Endpoints Available:
- `POST /extract-url` - Initiate extraction from URL
- `POST /extract` - Save raw HTML extract
- `GET /extracts/unprocessed` - List unprocessed extracts
- `POST /extracts/:id/processed` - Mark extract as processed

## NPM Dependencies Needed

```json
{
  "@neondatabase/serverless": "^0.x.x",
  "jsdom": "^22.x.x",
  "libphonenumber-js": "^1.x.x"
}
```

## Key Files to Copy

1. `/util/resume-parser.js` - Main parsing logic
2. `/util/resume-utils.js` - Utility functions and selectors
3. `/util/extract-resumes.js` - HTML cleaning function
4. `/util/database.js` - Database schema definitions

## Notes

- All dates are stored in PostgreSQL TIMESTAMPTZ format
- Phone numbers are normalized to E.164 format
- Emails are validated and normalized to lowercase
- The system handles masked contacts (HH.ru premium feature)
- Russian date parsing is supported
- Multiple CSS selector fallbacks ensure reliability