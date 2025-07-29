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

    // Create resume_links table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS resume_links (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        vacancy_id TEXT,
        processed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        error TEXT
      )
    `;

    // Create index for resume_links
    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_links_processed ON resume_links(processed)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_links_vacancy_id ON resume_links(vacancy_id)
    `;

    // Create simplified table for raw HTML content storage
    await sql`
      CREATE TABLE IF NOT EXISTS resume_html_content (
        id SERIAL PRIMARY KEY,
        url TEXT NOT NULL,
        content TEXT NOT NULL,
        extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resume_link_id INTEGER REFERENCES resume_links(id)
      )
    `;

    // Create index for faster lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_html_content_url ON resume_html_content(url)
    `;

    console.log('✅ Database tables created/verified (chats, messages, resume_links, resume_html_content)');
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

// Save resume link
async function saveResumeLink(linkData) {
  try {
    const { url, title, vacancy_id } = linkData;
    
    const result = await sql`
      INSERT INTO resume_links (url, title, vacancy_id)
      VALUES (${url}, ${title}, ${vacancy_id})
      ON CONFLICT (url) DO UPDATE SET
        title = EXCLUDED.title,
        vacancy_id = EXCLUDED.vacancy_id
      RETURNING id
    `;
    
    console.log(`💾 Resume link saved: ${title}`);
    return result[0];
  } catch (error) {
    console.error('❌ Error saving resume link:', error);
    throw error;
  }
}

// Get unprocessed resume links
async function getUnprocessedResumeLinks(limit = 50) {
  try {
    const links = await sql`
      SELECT * FROM resume_links 
      WHERE processed = false AND error IS NULL
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    
    return links;
  } catch (error) {
    console.error('❌ Error getting unprocessed links:', error);
    throw error;
  }
}

// Mark resume link as processed
async function markResumeLinkProcessed(linkId, error = null) {
  try {
    await sql`
      UPDATE resume_links 
      SET 
        processed = true, 
        processed_at = NOW(),
        error = ${error}
      WHERE id = ${linkId}
    `;
    
    console.log(`✅ Resume link ${linkId} marked as processed`);
  } catch (error) {
    console.error('❌ Error marking link as processed:', error);
    throw error;
  }
}

// Save raw HTML content
async function saveHtmlContent(data) {
  try {
    const { url, content, resume_link_id } = data;
    
    console.log(`📝 Attempting to save HTML content for URL: ${url}`);
    console.log(`📏 Content size: ${content ? content.length : 0} characters`);
    console.log(`🔗 Resume link ID: ${resume_link_id || 'NULL'}`);
    
    const result = await sql`
      INSERT INTO resume_html_content (url, content, resume_link_id)
      VALUES (${url}, ${content}, ${resume_link_id})
      RETURNING id, extracted_at
    `;
    
    if (result && result.length > 0) {
      console.log(`✅ HTML content INSERTED SUCCESSFULLY!`);
      console.log(`   - Database ID: ${result[0].id}`);
      console.log(`   - URL: ${url}`);
      console.log(`   - Extracted at: ${result[0].extracted_at}`);
      console.log(`   - Rows affected: ${result.length}`);
      
      // Immediately verify the insert
      const verification = await sql`
        SELECT id, url, LENGTH(content) as content_length, extracted_at 
        FROM resume_html_content 
        WHERE id = ${result[0].id}
      `;
      
      if (verification && verification.length > 0) {
        console.log(`✅ VERIFICATION SUCCESSFUL:`);
        console.log(`   - Record found in database with ID: ${verification[0].id}`);
        console.log(`   - Content length in DB: ${verification[0].content_length}`);
      } else {
        console.error(`⚠️ VERIFICATION FAILED: Record not found after insert!`);
      }
    } else {
      console.warn(`⚠️ Insert completed but no rows returned`);
    }
    
    return result[0];
  } catch (error) {
    console.error('❌ Error saving HTML content:', error);
    console.error(`   - Failed URL: ${data.url}`);
    console.error(`   - Content size: ${data.content ? data.content.length : 0}`);
    console.error(`   - Error details:`, error.message);
    throw error;
  }
}

// Get all HTML content records
async function getAllHtmlContent() {
  try {
    const records = await sql`
      SELECT 
        id, 
        url, 
        LENGTH(content) as content_length, 
        extracted_at,
        resume_link_id
      FROM resume_html_content 
      ORDER BY extracted_at DESC
    `;
    
    console.log(`📊 Found ${records.length} HTML content records in database`);
    return records;
  } catch (error) {
    console.error('❌ Error getting HTML content:', error);
    throw error;
  }
}

// Get HTML content count
async function getHtmlContentCount() {
  try {
    const result = await sql`
      SELECT COUNT(*) as count FROM resume_html_content
    `;
    
    console.log(`📊 Total HTML content records in database: ${result[0].count}`);
    return result[0].count;
  } catch (error) {
    console.error('❌ Error counting HTML content:', error);
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
  getAllChats,
  saveResumeLink,
  getUnprocessedResumeLinks,
  markResumeLinkProcessed,
  saveHtmlContent,
  getAllHtmlContent,
  getHtmlContentCount
};