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
  saveResume,
  getResume,
  getAllResumes,
  saveExtract,
  getUnprocessedExtracts,
  markExtractProcessed
} = require('./database');

const { parseResume } = require('./resume-parser');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for large HTML payloads

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

// Resume extraction endpoint
app.post('/extract-resumes/:count', async (req, res) => {
  try {
    const count = parseInt(req.params.count);
    
    if (!count || count < 1 || count > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Invalid count. Must be between 1 and 1000.'
      });
    }
    
    console.log(`📄 Starting extraction of ${count} resumes...`);
    
    // Execute extraction script in background
    const { spawn } = require('child_process');
    const extraction = spawn('node', ['util/extract-resumes.js', count.toString()], {
      cwd: process.cwd(),
      env: process.env
    });
    
    let output = '';
    let errorOutput = '';
    
    extraction.stdout.on('data', (data) => {
      output += data.toString();
      console.log(data.toString());
    });
    
    extraction.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error(data.toString());
    });
    
    extraction.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Extraction completed successfully`);
      } else {
        console.error(`❌ Extraction failed with code ${code}`);
      }
    });
    
    // Don't wait for completion, return immediately
    res.json({
      success: true,
      message: `Started extraction of ${count} resumes. Check terminal for progress.`,
      processId: extraction.pid
    });
    
  } catch (error) {
    console.error('❌ Error starting extraction:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save cleaned resume HTML from extension
app.post('/save-resume-html', async (req, res) => {
  try {
    const { resume_id, source_url, html_content } = req.body;
    
    if (!resume_id || !source_url || !html_content) {
      return res.status(400).json({
        success: false,
        error: 'resume_id, source_url, and html_content are required'
      });
    }
    
    console.log(`📥 Saving resume HTML for ${resume_id} from extension`);
    
    // Clean the HTML
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
    
    const { cleaned, originalSize, cleanedSize, reduction } = cleanHTML(html_content);
    
    // Get database connection
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    
    // Create table if not exists
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
        ${resume_id}, 
        ${source_url}, 
        ${cleaned},
        ${originalSize},
        ${cleanedSize},
        ${reduction},
        ${{
          source: 'chrome_extension',
          cleaning_version: '1.0'
        }}
      )
      ON CONFLICT (resume_id) 
      DO UPDATE SET
        html_content = EXCLUDED.html_content,
        html_original_size = EXCLUDED.html_original_size,
        html_cleaned_size = EXCLUDED.html_cleaned_size,
        reduction_percent = EXCLUDED.reduction_percent,
        extracted_at = NOW()
    `;
    
    // Mark as processed in resume_links if exists
    await sql`
      UPDATE resume_links 
      SET processed = true, processed_at = NOW()
      WHERE url = ${source_url}
    `;
    
    console.log(`✅ Saved resume ${resume_id} (reduced ${reduction}%)`);
    
    res.json({
      success: true,
      resume_id,
      original_size: originalSize,
      cleaned_size: cleanedSize,
      reduction_percent: reduction,
      message: `Resume HTML saved successfully (reduced by ${reduction}%)`
    });
    
  } catch (error) {
    console.error('❌ Error saving resume HTML:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get unprocessed resume links for browser extraction
app.get('/resume-links/unprocessed/:count', async (req, res) => {
  try {
    const count = parseInt(req.params.count) || 50;
    
    console.log(`📋 Fetching ${count} unprocessed resume links`);
    
    // Get database connection
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    
    // Get unprocessed resume links
    const links = await sql`
      SELECT DISTINCT ON (url) url, vacancy_id, id
      FROM resume_links
      WHERE processed = false
      ORDER BY url, id
      LIMIT ${count}
    `;
    
    console.log(`✅ Found ${links.length} unprocessed resume links`);
    
    res.json({
      success: true,
      links,
      count: links.length
    });
    
  } catch (error) {
    console.error('❌ Error getting unprocessed links:', error);
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
    for (const link of links) {
      try {
        const result = await sql`
          INSERT INTO resume_links (url, vacancy_id, page_number, title) 
          VALUES (${link.url}, ${vacancyId}, ${link.page}, ${link.title}) 
          ON CONFLICT (url) DO NOTHING
        `;
        if (result.length > 0) {
          inserted++;
        }
      } catch (insertError) {
        console.error(`Error inserting link: ${link.url}`, insertError.message);
      }
    }
    
    console.log(`✅ Successfully inserted ${inserted} resume links`);
    
    res.json({
      success: true,
      vacancyId,
      total: links.length,
      inserted,
      duplicates: links.length - inserted,
      message: `Successfully saved ${inserted} resume links`
    });
    
  } catch (error) {
    console.error('❌ Error saving resume links:', error);
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
      console.log(`🔗 Resume links management at http://localhost:${PORT}/vacancy/resume-links`);
      console.log(`📄 Resume extraction at http://localhost:${PORT}/extract-resumes/:count`);
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