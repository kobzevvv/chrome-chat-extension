#!/usr/bin/env node
require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function dropLegacyTables() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🗑️  Dropping Legacy Resume Tables
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This will permanently delete the following tables:
- resume_contacts
- resume_education  
- resume_experience
- resumes
- resume_extracts
- resumes_full_html_archive (if exists)

Press Ctrl+C to cancel, or wait 5 seconds to continue...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  // Give user time to cancel
  await new Promise(resolve => setTimeout(resolve, 5000));

  const tables = [
    'resume_contacts',
    'resume_education',
    'resume_experience',
    'resumes',
    'resume_extracts',
    'resumes_full_html_archive'
  ];

  console.log('\n🔨 Starting table cleanup...\n');

  for (const table of tables) {
    try {
      // Need to use separate queries for each table
      if (table === 'resume_contacts') {
        await sql`DROP TABLE IF EXISTS resume_contacts CASCADE`;
      } else if (table === 'resume_education') {
        await sql`DROP TABLE IF EXISTS resume_education CASCADE`;
      } else if (table === 'resume_experience') {
        await sql`DROP TABLE IF EXISTS resume_experience CASCADE`;
      } else if (table === 'resumes') {
        await sql`DROP TABLE IF EXISTS resumes CASCADE`;
      } else if (table === 'resume_extracts') {
        await sql`DROP TABLE IF EXISTS resume_extracts CASCADE`;
      } else if (table === 'resumes_full_html_archive') {
        await sql`DROP TABLE IF EXISTS resumes_full_html_archive CASCADE`;
      }
      console.log(`✅ Dropped table: ${table}`);
    } catch (error) {
      console.error(`❌ Error dropping ${table}:`, error.message);
    }
  }

  // Also drop any orphaned indexes
  console.log('\n🔍 Checking for orphaned indexes...\n');
  
  const indexesToDrop = [
    'idx_resumes_candidate_name',
    'idx_resumes_fetched_at',
    'idx_resume_experience_resume_id',
    'idx_resume_education_resume_id',
    'idx_resume_contacts_resume_id',
    'idx_resume_extracts_resume_id',
    'idx_resume_extracts_processed',
    'idx_resume_extracts_extracted_at'
  ];

  // Drop indexes one by one
  try {
    await sql`DROP INDEX IF EXISTS idx_resumes_candidate_name`;
    console.log(`✅ Dropped index: idx_resumes_candidate_name`);
  } catch (error) {
    console.log(`ℹ️  Index idx_resumes_candidate_name already removed`);
  }
  
  try {
    await sql`DROP INDEX IF EXISTS idx_resumes_fetched_at`;
    console.log(`✅ Dropped index: idx_resumes_fetched_at`);
  } catch (error) {
    console.log(`ℹ️  Index idx_resumes_fetched_at already removed`);
  }
  
  try {
    await sql`DROP INDEX IF EXISTS idx_resume_experience_resume_id`;
    console.log(`✅ Dropped index: idx_resume_experience_resume_id`);
  } catch (error) {
    console.log(`ℹ️  Index idx_resume_experience_resume_id already removed`);
  }
  
  try {
    await sql`DROP INDEX IF EXISTS idx_resume_education_resume_id`;
    console.log(`✅ Dropped index: idx_resume_education_resume_id`);
  } catch (error) {
    console.log(`ℹ️  Index idx_resume_education_resume_id already removed`);
  }
  
  try {
    await sql`DROP INDEX IF EXISTS idx_resume_contacts_resume_id`;
    console.log(`✅ Dropped index: idx_resume_contacts_resume_id`);
  } catch (error) {
    console.log(`ℹ️  Index idx_resume_contacts_resume_id already removed`);
  }
  
  try {
    await sql`DROP INDEX IF EXISTS idx_resume_extracts_resume_id`;
    console.log(`✅ Dropped index: idx_resume_extracts_resume_id`);
  } catch (error) {
    console.log(`ℹ️  Index idx_resume_extracts_resume_id already removed`);
  }
  
  try {
    await sql`DROP INDEX IF EXISTS idx_resume_extracts_processed`;
    console.log(`✅ Dropped index: idx_resume_extracts_processed`);
  } catch (error) {
    console.log(`ℹ️  Index idx_resume_extracts_processed already removed`);
  }
  
  try {
    await sql`DROP INDEX IF EXISTS idx_resume_extracts_extracted_at`;
    console.log(`✅ Dropped index: idx_resume_extracts_extracted_at`);
  } catch (error) {
    console.log(`ℹ️  Index idx_resume_extracts_extracted_at already removed`);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Legacy table cleanup completed!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remaining tables in use:
- chats (chat management)
- messages (chat messages)
- resume_links (vacancy resume URLs)
- resume_html_content (cleaned HTML storage)

The system now uses the simplified approach.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

// Run the cleanup
dropLegacyTables()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });