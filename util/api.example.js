require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { 
  initDatabase, 
  createTables, 
  saveChat, 
  saveMessages, 
  getRecentMessages, 
  getChatStats, 
  getAllChats,
  saveResumeLink,
  getUnprocessedResumeLinks,
  markResumeLinkProcessed,
  saveHtmlContent,
  getAllHtmlContent,
  getHtmlContentCount
} = require('./database');

// Resume parser no longer needed - we're just storing raw HTML

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Main inbox endpoint for receiving chat snapshots
app.post('/inbox', async (req, res) => {
  try {
    const { source, timestamp, data } = req.body;
    
    console.log('\n=== CHAT SNAPSHOT RECEIVED ===');
    console.log('Source:', source);
    console.log('Timestamp:', new Date(timestamp).toISOString());
    console.log('URL:', data.url);
    console.log('Message Count:', data.messages.length);
    
    if (data.messages.length > 0) {
      console.log('\nRecent Messages:');
      data.messages.slice(-3).forEach((msg, i) => {
        const sender = msg.me ? 'ME' : 'THEM';
        const time = typeof msg.ts === 'string' ? msg.ts : new Date(msg.ts).toLocaleTimeString();
        console.log(`  [${sender}] ${time}: ${msg.text.substring(0, 100)}${msg.text.length > 100 ? '...' : ''}`);
      });
    }
    
    // Extract chat ID from URL
    const chatIdMatch = data.url.match(/\/chat\/(\d+)/);
    const chatId = chatIdMatch ? chatIdMatch[1] : `unknown_${timestamp}`;
    
    // Save chat information
    const chatData = {
      chatId,
      name: data.chatName || `Chat ${chatId}`,
      url: data.url
    };
    
    await saveChat(chatData);
    
    // Save messages if any
    let savedMessageIds = [];
    if (data.messages && data.messages.length > 0) {
      savedMessageIds = await saveMessages(chatId, data.messages);
    }
    
    console.log(`💾 Saved ${savedMessageIds.length} messages to database`);
    console.log('================================\n');
    
    res.json({ 
      success: true, 
      received: timestamp,
      processed: Date.now(),
      chatId,
      savedMessages: savedMessageIds.length
    });
    
  } catch (error) {
    console.error('❌ Error processing chat snapshot:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      received: req.body.timestamp,
      processed: Date.now()
    });
  }
});

// Save multiple chats from chat list
app.post('/chats/bulk', async (req, res) => {
  try {
    const { chats } = req.body;
    
    if (!chats || !Array.isArray(chats)) {
      return res.status(400).json({
        success: false,
        error: 'chats array is required'
      });
    }
    
    const savedChats = [];
    
    for (const chat of chats) {
      if (chat.chatId && chat.name) {
        const chatData = {
          chatId: chat.chatId,
          name: chat.name,
          url: chat.url || `https://hh.ru/chat/${chat.chatId}`
        };
        
        await saveChat(chatData);
        savedChats.push(chatData);
      }
    }
    
    console.log(`💾 Saved ${savedChats.length} chats from bulk import`);
    
    res.json({
      success: true,
      saved: savedChats.length,
      chats: savedChats
    });
    
  } catch (error) {
    console.error('❌ Error saving bulk chats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all chats
app.get('/chats', async (req, res) => {
  try {
    const chats = await getAllChats();
    res.json({
      success: true,
      chats,
      count: chats.length
    });
  } catch (error) {
    console.error('❌ Error getting chats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get messages for a specific chat
app.get('/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    
    const messages = await getRecentMessages(chatId, limit);
    const stats = await getChatStats(chatId);
    
    res.json({
      success: true,
      chatId,
      messages,
      stats,
      count: messages.length
    });
  } catch (error) {
    console.error('❌ Error getting messages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get chat statistics
app.get('/chats/:chatId/stats', async (req, res) => {
  try {
    const { chatId } = req.params;
    const stats = await getChatStats(chatId);
    
    res.json({
      success: true,
      chatId,
      stats
    });
  } catch (error) {
    console.error('❌ Error getting chat stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Resume endpoints

// Parse and save resume from HTML
app.post('/resume/parse', async (req, res) => {
  try {
    const { html, sourceUrl, options = {} } = req.body;
    
    if (!html || !sourceUrl) {
      return res.status(400).json({
        success: false,
        error: 'html and sourceUrl are required'
      });
    }
    
    console.log(`📄 Parsing resume from: ${sourceUrl}`);
    
    // Parse the resume
    const resumeData = parseResume(html, sourceUrl, options);
    
    // Save to database
    const result = await saveResume(resumeData);
    
    res.json({
      success: true,
      resume_id: result.resume_id,
      candidate_name: resumeData.candidate_name,
      contacts_found: {
        emails: resumeData.emails?.length || 0,
        phones: resumeData.phones_raw?.length || 0,
        telegrams: resumeData.telegrams?.length || 0
      },
      contacts_masked: resumeData.contacts_masked,
      parsed_at: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error parsing/saving resume:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get all resumes
app.get('/resumes', async (req, res) => {
  try {
    const resumes = await getAllResumes();
    res.json({
      success: true,
      resumes,
      count: resumes.length
    });
  } catch (error) {
    console.error('❌ Error getting resumes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific resume by ID
app.get('/resumes/:resumeId', async (req, res) => {
  try {
    const { resumeId } = req.params;
    const resume = await getResume(resumeId);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }
    
    res.json({
      success: true,
      resume
    });
  } catch (error) {
    console.error('❌ Error getting resume:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Extract endpoints (ELT approach)

// Save raw HTML extract
app.post('/extract', async (req, res) => {
  try {
    const { resume_id, source_url, html_content, metadata = {} } = req.body;
    
    if (!resume_id || !source_url || !html_content) {
      return res.status(400).json({
        success: false,
        error: 'resume_id, source_url, and html_content are required'
      });
    }
    
    console.log(`📥 Saving extract for resume: ${resume_id}`);
    
    const extract = await saveExtract({
      resume_id,
      source_url,
      html_content,
      metadata
    });
    
    res.json({
      success: true,
      extract_id: extract.id,
      extracted_at: extract.extracted_at,
      resume_id
    });
    
  } catch (error) {
    console.error('❌ Error saving extract:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Extract from URL (used by terminal/webhook)
app.post('/extract-url', async (req, res) => {
  try {
    let { url } = req.body;
    
    // Default to test URL if not provided
    if (!url) {
      url = 'https://ufa.hh.ru/resume/eb6a98c0000f30b1ee0097a6044d4958673372';
      console.log(`📌 Using default test URL: ${url}`);
    }
    
    // Extract resume ID from URL
    const resumeIdMatch = url.match(/\/resume\/([a-f0-9]+)/);
    if (!resumeIdMatch) {
      return res.status(400).json({
        success: false,
        error: 'Invalid resume URL format'
      });
    }
    
    const resume_id = resumeIdMatch[1];
    
    // Create test HTML content that simulates a resume page
    const testHtmlContent = `
      <html>
        <head><title>Test Resume - ${resume_id}</title></head>
        <body>
          <div class="resume-header">
            <h1>Test Candidate Name</h1>
            <div class="resume-contacts">
              <span>+7 (999) 123-45-67</span>
              <span>test.email@example.com</span>
              <span>@test_telegram</span>
            </div>
          </div>
          <div class="resume-body">
            <h2>Experience</h2>
            <div class="experience-item">
              <h3>Senior Developer</h3>
              <p>Test Company • 2020 - Present</p>
              <p>Working on test projects</p>
            </div>
            <h2>Education</h2>
            <div class="education-item">
              <h3>Computer Science</h3>
              <p>Test University • 2016 - 2020</p>
            </div>
          </div>
        </body>
      </html>
    `;
    
    // Save the extract to database
    const extractData = {
      resume_id,
      source_url: url,
      html_content: testHtmlContent,
      metadata: {
        test_data: true,
        created_via: 'extract-url endpoint',
        timestamp: new Date().toISOString()
      }
    };
    
    const result = await saveExtract(extractData);
    
    console.log(`✅ Test extract saved for resume ${resume_id}`);
    
    res.json({
      success: true,
      message: 'Test HTML extract saved successfully',
      resume_id,
      source_url: url,
      extract_id: result.id,
      extracted_at: result.extracted_at,
      html_length: testHtmlContent.length,
      is_test_data: true
    });
    
  } catch (error) {
    console.error('❌ Error extracting from URL:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get unprocessed extracts
app.get('/extracts/unprocessed', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const extracts = await getUnprocessedExtracts(limit);
    
    res.json({
      success: true,
      extracts,
      count: extracts.length
    });
  } catch (error) {
    console.error('❌ Error getting unprocessed extracts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mark extract as processed
app.post('/extracts/:extractId/processed', async (req, res) => {
  try {
    const { extractId } = req.params;
    await markExtractProcessed(extractId);
    
    res.json({
      success: true,
      extract_id: extractId,
      processed_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error marking extract as processed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Vacancy resume links endpoint
app.post('/vacancy/resume-links', async (req, res) => {
  try {
    const { vacancyId, links } = req.body;
    
    if (!vacancyId || !links || !Array.isArray(links)) {
      return res.status(400).json({
        success: false,
        error: 'vacancyId and links array are required'
      });
    }
    
    console.log(`📋 Saving ${links.length} resume links for vacancy ${vacancyId}`);
    
    // Check for DATABASE_URL
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    // Get database connection
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    
    // Create table if not exists
    await sql`
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
      )
    `;
    
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const link of links) {
      try {
        const result = await sql`
          INSERT INTO resume_links (url, vacancy_id, page_number, title) 
          VALUES (${link.url}, ${vacancyId}, ${link.page}, ${link.title}) 
          ON CONFLICT (url) DO NOTHING
          RETURNING id
        `;
        if (result && result.length > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (insertError) {
        console.error(`Error inserting link: ${link.url}`, insertError.message);
        errors++;
      }
    }
    
    console.log(`✅ Inserted: ${inserted}, Skipped (duplicates): ${skipped}, Errors: ${errors}`);
    
    res.json({
      success: true,
      vacancyId,
      total: links.length,
      inserted,
      skipped,
      errors,
      message: `Saved ${inserted} new links, ${skipped} already existed, ${errors} errors`
    });
    
  } catch (error) {
    console.error('❌ Error saving resume links:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get unprocessed resume links
app.get('/resume-links/unprocessed', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    // Check for DATABASE_URL
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    // Get database connection
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    
    // Get unprocessed links
    const links = await sql`
      SELECT id, url, vacancy_id, title
      FROM resume_links
      WHERE processed = false
      ORDER BY id
      LIMIT ${limit}
    `;
    
    console.log(`📋 Found ${links.length} unprocessed resume links`);
    
    res.json({
      success: true,
      links: links,
      count: links.length,
      limit: limit
    });
    
  } catch (error) {
    console.error('❌ Error getting unprocessed links:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Mark resume link as processed
app.post('/resume-links/:id/processed', async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = req.body;
    
    // Check for DATABASE_URL
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    
    // Get database connection
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    
    // Update link status
    const result = await sql`
      UPDATE resume_links
      SET 
        processed = true,
        processed_at = CURRENT_TIMESTAMP,
        error = ${error || null}
      WHERE id = ${id}
      RETURNING id
    `;
    
    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Resume link not found'
      });
    }
    
    console.log(`✅ Marked resume link ${id} as processed`);
    
    res.json({
      success: true,
      id: id,
      message: 'Resume link marked as processed'
    });
    
  } catch (error) {
    console.error('❌ Error marking link as processed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save raw HTML content (simplified approach)
app.post('/resume/html-content', async (req, res) => {
  try {
    const { url, content } = req.body;
    
    if (!url || !content) {
      console.warn('❌ Missing required fields: url or content');
      return res.status(400).json({
        success: false,
        error: 'url and content are required'
      });
    }
    
    console.log(`📄 API: Received request to save HTML content for: ${url}`);
    console.log(`📏 API: Content size: ${content.length} characters`);
    
    // Extract resume ID from URL if available
    let resume_link_id = null;
    if (req.body.resume_link_id) {
      resume_link_id = req.body.resume_link_id;
      console.log(`🔗 API: Associated with resume_link_id: ${resume_link_id}`);
    }
    
    // Save to database
    console.log(`💾 API: Calling saveHtmlContent function...`);
    const result = await saveHtmlContent({
      url,
      content,
      resume_link_id
    });
    
    if (result && result.id) {
      console.log(`✅ API: Successfully saved HTML content with ID: ${result.id}`);
      res.json({
        success: true,
        id: result.id,
        url,
        extracted_at: result.extracted_at,
        message: 'HTML content saved successfully'
      });
    } else {
      console.error(`❌ API: saveHtmlContent returned invalid result:`, result);
      res.status(500).json({
        success: false,
        error: 'Failed to save HTML content - no ID returned'
      });
    }
    
  } catch (error) {
    console.error('❌ API: Error saving HTML content:', error);
    console.error('   Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all HTML content records (for debugging)
app.get('/resume/html-content', async (req, res) => {
  try {
    console.log('📋 Fetching all HTML content records...');
    
    const records = await getAllHtmlContent();
    const count = await getHtmlContentCount();
    
    console.log(`📊 Found ${records.length} HTML content records`);
    console.log(`📊 Total count from DB: ${count}`);
    
    res.json({
      success: true,
      count: count,
      records: records,
      recordsReturned: records.length
    });
  } catch (error) {
    console.error('❌ Error fetching HTML content records:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get HTML content stats
app.get('/resume/html-content/stats', async (req, res) => {
  try {
    console.log('📊 Getting HTML content statistics...');
    
    const count = await getHtmlContentCount();
    const records = await getAllHtmlContent();
    
    const stats = {
      totalRecords: count,
      recordsFound: records.length,
      latestRecord: records.length > 0 ? records[0] : null,
      oldestRecord: records.length > 0 ? records[records.length - 1] : null
    };
    
    console.log('📊 Stats:', stats);
    
    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('❌ Error getting HTML content stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'running', 
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database connection
    initDatabase();
    
    // Create tables if they don't exist
    await createTables();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 HH Chat API server running on http://localhost:${PORT}`);
      console.log(`📨 Chat snapshots will be received at http://localhost:${PORT}/inbox`);
      console.log(`📊 View all chats at http://localhost:${PORT}/chats`);
      console.log(`📄 Resume parsing at http://localhost:${PORT}/resume/parse`);
      console.log(`📑 View all resumes at http://localhost:${PORT}/resumes`);
      console.log(`📥 Extract HTML at http://localhost:${PORT}/extract`);
      console.log(`🔗 Extract from URL at http://localhost:${PORT}/extract-url`);
      console.log(`📋 Get unprocessed extracts at http://localhost:${PORT}/extracts/unprocessed`);
      console.log(`🔗 Save vacancy resume links at http://localhost:${PORT}/vacancy/resume-links`);
      console.log(`📋 Get unprocessed links at http://localhost:${PORT}/resume-links/unprocessed`);
      console.log(`✅ Mark link as processed at http://localhost:${PORT}/resume-links/:id/processed`);
      console.log(`💾 Save HTML content at http://localhost:${PORT}/resume/html-content`);
      console.log(`❤️  Health check available at http://localhost:${PORT}/health`);
      console.log(`\n💡 Don't forget to set your DATABASE_URL environment variable!`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  process.exit(0);
});