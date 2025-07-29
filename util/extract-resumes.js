#!/usr/bin/env node
require('dotenv').config();
const axios = require('axios');
const { sql } = require('./database');
const { log } = require('./resume-utils');

// Configuration
const DEFAULT_COUNT = 50;
const BATCH_SIZE = 10;
const DELAY_BETWEEN_REQUESTS = 1000; // 1 second delay

// Parse command line arguments
const args = process.argv.slice(2);
const count = parseInt(args[0]) || DEFAULT_COUNT;

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 Resume HTML Extractor
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: node extract-resumes.js [count]
Example: node extract-resumes.js 100

Will extract: ${count} resumes
Batch size: ${BATCH_SIZE}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

/**
 * Clean HTML content - remove obvious waste
 */
function cleanHTML(html) {
  const originalSize = html.length;
  
  // Step 1: Remove script tags
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Step 2: Remove style tags
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Step 3: Remove comments
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  
  // Step 4: Remove meta, link, noscript tags
  html = html.replace(/<(meta|link|noscript)\b[^>]*>/gi, '');
  
  // Step 5: Remove event handlers and style attributes
  html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s*style\s*=\s*["'][^"']*["']/gi, '');
  
  // Step 6: Remove tracking attributes
  html = html.replace(/\s*data-gtm-\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s*data-analytics-\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Step 7: Normalize whitespace
  html = html.replace(/\s+/g, ' ');
  html = html.replace(/>\s+</g, '><');
  
  const cleanedSize = html.length;
  const reduction = Math.round((1 - cleanedSize / originalSize) * 100);
  
  return {
    cleaned: html.trim(),
    originalSize,
    cleanedSize,
    reduction
  };
}

/**
 * Fetch resume HTML from URL
 */
async function fetchResumeHTML(url) {
  try {
    // Try to get print version
    const printUrl = url.includes('?') ? `${url}&print=true` : `${url}?print=true`;
    
    const response = await axios.get(printUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      },
      timeout: 30000
    });
    
    return response.data;
  } catch (error) {
    log('error', `Failed to fetch ${url}: ${error.message}`);
    throw error;
  }
}

/**
 * Extract resume ID from URL
 */
function extractResumeId(url) {
  const match = url.match(/\/resume\/([a-f0-9]+)/);
  return match ? match[1] : null;
}

/**
 * Main extraction function
 */
async function extractResumes() {
  try {
    // Create resume_html_content table if not exists
    await sql`
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
      )
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_html_content_resume_id ON resume_html_content(resume_id)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_html_content_extracted_at ON resume_html_content(extracted_at)
    `;
    
    console.log('✅ Database table resume_html_content created/verified');
    
    // Get unprocessed resume links
    const resumeLinks = await sql`
      SELECT DISTINCT url, vacancy_id
      FROM resume_links 
      WHERE processed = false
      ORDER BY id
      LIMIT ${count}
    `;
    
    if (resumeLinks.length === 0) {
      console.log('ℹ️  No unprocessed resume links found');
      return;
    }
    
    console.log(`\n📋 Found ${resumeLinks.length} unprocessed resume links`);
    
    let processed = 0;
    let successful = 0;
    let failed = 0;
    
    // Process in batches
    for (let i = 0; i < resumeLinks.length; i += BATCH_SIZE) {
      const batch = resumeLinks.slice(i, i + BATCH_SIZE);
      console.log(`\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(resumeLinks.length / BATCH_SIZE)}`);
      
      for (const link of batch) {
        processed++;
        const resumeId = extractResumeId(link.url);
        
        if (!resumeId) {
          console.log(`❌ [${processed}/${resumeLinks.length}] Invalid URL: ${link.url}`);
          failed++;
          continue;
        }
        
        try {
          // Check if already extracted
          const existing = await sql`
            SELECT id FROM resume_html_content WHERE resume_id = ${resumeId}
          `;
          
          if (existing.length > 0) {
            console.log(`⏭️  [${processed}/${resumeLinks.length}] Already extracted: ${resumeId}`);
            
            // Mark as processed in resume_links
            await sql`
              UPDATE resume_links 
              SET processed = true, processed_at = NOW()
              WHERE url = ${link.url}
            `;
            continue;
          }
          
          // Fetch HTML
          console.log(`📥 [${processed}/${resumeLinks.length}] Fetching: ${resumeId}`);
          const htmlContent = await fetchResumeHTML(link.url);
          
          // Clean HTML
          const { cleaned, originalSize, cleanedSize, reduction } = cleanHTML(htmlContent);
          
          // Save to database
          await sql`
            INSERT INTO resume_html_content (
              resume_id, 
              source_url, 
              html_content, 
              html_original_size,
              html_cleaned_size,
              reduction_percent,
              metadata
            )
            VALUES (
              ${resumeId}, 
              ${link.url}, 
              ${cleaned},
              ${originalSize},
              ${cleanedSize},
              ${reduction},
              ${{
                vacancy_id: link.vacancy_id,
                extracted_from: 'resume_links',
                cleaning_version: '1.0'
              }}
            )
            ON CONFLICT (resume_id) DO NOTHING
          `;
          
          // Mark as processed
          await sql`
            UPDATE resume_links 
            SET processed = true, processed_at = NOW()
            WHERE url = ${link.url}
          `;
          
          successful++;
          console.log(`✅ [${processed}/${resumeLinks.length}] Saved: ${resumeId} (reduced ${reduction}%)`);
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
          
        } catch (error) {
          failed++;
          console.log(`❌ [${processed}/${resumeLinks.length}] Error: ${resumeId} - ${error.message}`);
          
          // Mark as processed with error
          await sql`
            UPDATE resume_links 
            SET processed = true, 
                processed_at = NOW(),
                error = ${error.message}
            WHERE url = ${link.url}
          `;
        }
      }
    }
    
    // Summary
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Extraction Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total processed: ${processed}
✅ Successful: ${successful}
❌ Failed: ${failed}
⏭️  Already extracted: ${processed - successful - failed}

Check the resume_html_content table for results.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
    
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the extraction
extractResumes()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });