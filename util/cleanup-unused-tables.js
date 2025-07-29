require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function cleanupUnusedTables() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const sql = neon(process.env.DATABASE_URL);
  console.log('🗄️ Connected to database');
  
  try {
    // List of tables to drop
    const tablesToDrop = [
      'resume_contacts',
      'resume_education', 
      'resume_experience',
      'resumes',
      'resume_extracts'
    ];
    
    console.log('🧹 Starting cleanup of unused resume tables...\n');
    
    // Drop tables in reverse order to handle foreign key constraints
    for (const table of tablesToDrop) {
      try {
        console.log(`📦 Dropping table: ${table}...`);
        await sql`DROP TABLE IF EXISTS ${sql(table)} CASCADE`;
        console.log(`✅ Dropped table: ${table}`);
      } catch (error) {
        console.error(`❌ Error dropping table ${table}:`, error.message);
      }
    }
    
    console.log('\n🎯 Keeping tables:');
    console.log('  - resume_links (for tracking which resumes to process)');
    console.log('  - resume_html_content (for storing raw HTML)');
    
    // Verify remaining tables
    const remainingTables = await sql`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename LIKE 'resume%'
      ORDER BY tablename
    `;
    
    console.log('\n📋 Remaining resume-related tables:');
    remainingTables.forEach(t => console.log(`  - ${t.tablename}`));
    
    // Get counts for remaining tables
    console.log('\n📊 Table statistics:');
    
    try {
      const linkCount = await sql`SELECT COUNT(*) as count FROM resume_links`;
      console.log(`  - resume_links: ${linkCount[0].count} records`);
    } catch (e) {
      console.log(`  - resume_links: table exists`);
    }
    
    try {
      const htmlCount = await sql`SELECT COUNT(*) as count FROM resume_html_content`;
      console.log(`  - resume_html_content: ${htmlCount[0].count} records`);
    } catch (e) {
      console.log(`  - resume_html_content: table exists`);
    }
    
    console.log('\n✅ Cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

// Run cleanup
cleanupUnusedTables()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });