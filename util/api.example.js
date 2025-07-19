const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Main inbox endpoint for receiving chat snapshots
app.post('/inbox', (req, res) => {
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
  
  console.log('================================\n');
  
  // TODO: Add your automation logic here
  // Examples:
  // - Store in database
  // - Trigger AI responses via OpenAI/Claude API
  // - Send to n8n workflow
  // - Forward to other services
  
  res.json({ 
    success: true, 
    received: timestamp,
    processed: Date.now()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'running', 
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 HH Chat API server running on http://localhost:${PORT}`);
  console.log(`📨 Chat snapshots will be received at http://localhost:${PORT}/inbox`);
  console.log(`❤️  Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down server...');
  process.exit(0);
});