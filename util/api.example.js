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
app.use(express.json());

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
    
    // In a real implementation, you would fetch the HTML here
    // For now, we'll return instructions
    res.json({
      success: true,
      message: 'Extract endpoint ready',
      resume_id,
      source_url: url,
      next_steps: [
        '1. Fetch HTML from the URL using Chrome extension or server-side fetcher',
        '2. POST the HTML to /extract endpoint',
        '3. Process extracts asynchronously using /extracts/unprocessed'
      ]
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