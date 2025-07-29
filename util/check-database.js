require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const sql = neon(process.env.DATABASE_URL);
  console.log('🗄️ Connected to database\n');
  
  try {
    // Check resume_html_content table
    console.log('📊 Checking resume_html_content table...');
    
    const count = await sql`SELECT COUNT(*) as count FROM resume_html_content`;
    console.log(`\n✅ Total records: ${count[0].count}`);
    
    if (count[0].count > 0) {
      // Get latest records
      const latest = await sql`
        SELECT 
          id, 
          url, 
          LENGTH(content) as content_size, 
          extracted_at,
          resume_link_id
        FROM resume_html_content 
        ORDER BY extracted_at DESC 
        LIMIT 5
      `;
      
      console.log('\n📋 Latest 5 records:');
      latest.forEach((record, i) => {
        console.log(`\n${i + 1}. Record ID: ${record.id}`);
        console.log(`   URL: ${record.url}`);
        console.log(`   Content size: ${record.content_size} characters`);
        console.log(`   Extracted at: ${record.extracted_at}`);
        console.log(`   Resume link ID: ${record.resume_link_id || 'NULL'}`);
      });
      
      // Get size statistics
      const stats = await sql`
        SELECT 
          MIN(LENGTH(content)) as min_size,
          MAX(LENGTH(content)) as max_size,
          AVG(LENGTH(content))::INTEGER as avg_size
        FROM resume_html_content
      `;
      
      console.log('\n📏 Content size statistics:');
      console.log(`   Min size: ${stats[0].min_size} characters`);
      console.log(`   Max size: ${stats[0].max_size} characters`);
      console.log(`   Avg size: ${stats[0].avg_size} characters`);
    }
    
    // Check resume_links table
    console.log('\n\n📊 Checking resume_links table...');
    
    const linkCount = await sql`SELECT COUNT(*) as count FROM resume_links`;
    console.log(`\n✅ Total links: ${linkCount[0].count}`);
    
    const processedCount = await sql`
      SELECT COUNT(*) as count FROM resume_links WHERE processed = true
    `;
    console.log(`✅ Processed links: ${processedCount[0].count}`);
    
    const unprocessedCount = await sql`
      SELECT COUNT(*) as count FROM resume_links WHERE processed = false
    `;
    console.log(`⏳ Unprocessed links: ${unprocessedCount[0].count}`);
    
    const errorCount = await sql`
      SELECT COUNT(*) as count FROM resume_links WHERE error IS NOT NULL
    `;
    console.log(`❌ Links with errors: ${errorCount[0].count}`);
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
    throw error;
  }
}

// Run check
checkDatabase()
  .then(() => {
    console.log('\n\n✅ Database check completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });