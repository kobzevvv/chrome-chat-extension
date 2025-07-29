# Extract Vacancy Resumes GitHub Action

This GitHub Action extracts all resume links from HH.ru vacancy response pages and stores them in a PostgreSQL database (Neon).

## Usage

1. Go to Actions tab in your GitHub repository
2. Select "Extract Vacancy Resumes" workflow
3. Click "Run workflow"
4. Enter the HH.ru vacancy responses URL (e.g., `https://ufa.hh.ru/employer/vacancyresponses?collection=phone_interview&vacancyId=123286350`)
5. Click "Run workflow"

## What it does

1. Takes a vacancy responses URL as input
2. Iterates through all pages (page=1, page=2, etc.) until no more pages are found
3. Extracts all resume links from each page
4. Stores the links in a PostgreSQL table `resume_links_to_extract` with:
   - `url`: Full resume URL
   - `vacancy_id`: Extracted vacancy ID
   - `page_number`: Page number where the resume was found
   - `extracted_at`: Timestamp of extraction
   - `processed`: Boolean flag (default false)
   - `processed_at`: Timestamp when processed
   - `error`: Any error during processing

## Prerequisites

You need to set up the following GitHub secret:
- `NEON_DATABASE_URL`: Your Neon PostgreSQL connection string

## Local Testing

You can test the extraction script locally:

```bash
# Set environment variable
export NEON_DATABASE_URL="your-neon-database-url"

# Run the script
node util/extract-vacancy-resumes.js "https://ufa.hh.ru/employer/vacancyresponses?collection=phone_interview&vacancyId=123286350"
```

## Database Schema

The script automatically creates the `resume_links_to_extract` table if it doesn't exist.