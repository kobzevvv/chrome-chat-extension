const { neon } = require('@neondatabase/serverless');

// Database connection
let sql;

// Initialize database connection
function initDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required. Please set it to your Neon database connection string.');
  }
  
  sql = neon(process.env.DATABASE_URL);
  console.log('🗄️ Database connection initialized');
}

// Create tables if they don't exist
async function createTables() {
  try {
    // Create chats table
    await sql`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        chat_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(500) NOT NULL,
        url VARCHAR(1000),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create messages table
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        chat_id VARCHAR(255) NOT NULL,
        message_text TEXT NOT NULL,
        is_from_me BOOLEAN NOT NULL DEFAULT false,
        timestamp TIMESTAMP,
        message_index INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE
      )
    `;

    // Create indexes for better performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)
    `;

    console.log('✅ Database tables created/verified');
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  }
}

// Save or update chat information
async function saveChat(chatData) {
  try {
    const { chatId, name, url } = chatData;
    
    await sql`
      INSERT INTO chats (chat_id, name, url)
      VALUES (${chatId}, ${name}, ${url})
      ON CONFLICT (chat_id) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        url = EXCLUDED.url,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    console.log(`💾 Chat saved: ${chatId} - ${name}`);
  } catch (error) {
    console.error('❌ Error saving chat:', error);
    throw error;
  }
}

// Save message to database
async function saveMessage(messageData) {
  try {
    const { chatId, text, isFromMe, timestamp, messageIndex } = messageData;
    
    const result = await sql`
      INSERT INTO messages (chat_id, message_text, is_from_me, timestamp, message_index)
      VALUES (${chatId}, ${text}, ${isFromMe}, ${timestamp}, ${messageIndex})
      RETURNING id
    `;
    
    console.log(`💬 Message saved: Chat ${chatId}, ID ${result[0].id}`);
    return result[0].id;
  } catch (error) {
    console.error('❌ Error saving message:', error);
    throw error;
  }
}

// Save multiple messages from a chat snapshot
async function saveMessages(chatId, messages) {
  try {
    const results = [];
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const messageData = {
        chatId,
        text: message.text,
        isFromMe: message.me || false,
        timestamp: new Date(message.ts),
        messageIndex: i
      };
      
      const messageId = await saveMessage(messageData);
      results.push(messageId);
    }
    
    console.log(`💾 Saved ${results.length} messages for chat ${chatId}`);
    return results;
  } catch (error) {
    console.error('❌ Error saving messages:', error);
    throw error;
  }
}

// Get recent messages for a chat
async function getRecentMessages(chatId, limit = 50) {
  try {
    const messages = await sql`
      SELECT * FROM messages 
      WHERE chat_id = ${chatId}
      ORDER BY timestamp DESC, message_index DESC
      LIMIT ${limit}
    `;
    
    return messages.reverse(); // Return in chronological order
  } catch (error) {
    console.error('❌ Error getting messages:', error);
    throw error;
  }
}

// Get chat statistics
async function getChatStats(chatId) {
  try {
    const stats = await sql`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN is_from_me THEN 1 END) as my_messages,
        COUNT(CASE WHEN NOT is_from_me THEN 1 END) as their_messages,
        MIN(timestamp) as first_message,
        MAX(timestamp) as last_message
      FROM messages 
      WHERE chat_id = ${chatId}
    `;
    
    return stats[0];
  } catch (error) {
    console.error('❌ Error getting chat stats:', error);
    throw error;
  }
}

// Get all chats with message counts
async function getAllChats() {
  try {
    const chats = await sql`
      SELECT 
        c.*,
        COALESCE(m.message_count, 0) as message_count,
        m.last_message_time
      FROM chats c
      LEFT JOIN (
        SELECT 
          chat_id,
          COUNT(*) as message_count,
          MAX(timestamp) as last_message_time
        FROM messages
        GROUP BY chat_id
      ) m ON c.chat_id = m.chat_id
      ORDER BY m.last_message_time DESC NULLS LAST, c.updated_at DESC
    `;
    
    return chats;
  } catch (error) {
    console.error('❌ Error getting chats:', error);
    throw error;
  }
}

module.exports = {
  initDatabase,
  createTables,
  saveChat,
  saveMessage,
  saveMessages,
  getRecentMessages,
  getChatStats,
  getAllChats
};