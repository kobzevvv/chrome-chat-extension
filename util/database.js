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

// Initialize sql immediately if DATABASE_URL is available
if (process.env.DATABASE_URL) {
  sql = neon(process.env.DATABASE_URL);
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

    // Create resume tables
    await sql`
      CREATE TABLE IF NOT EXISTS resumes (
        resume_id TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        candidate_name TEXT,
        headline TEXT,
        location TEXT,
        relocation_readiness TEXT,
        age INT,
        birth_date DATE,
        status TEXT,
        employment_type TEXT[],
        schedule TEXT[],
        salary NUMERIC,
        skills TEXT[],
        -- Contacts (convenience columns: first/primary values)
        email_primary TEXT,
        phone_primary_e164 TEXT,
        telegram_primary TEXT,
        contacts_masked BOOLEAN NOT NULL DEFAULT false,
        -- Contact arrays for full data
        emails TEXT[],
        phones_raw TEXT[],
        phones_e164 TEXT[],
        telegrams TEXT[],
        raw_print_html TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS resume_experience (
        id BIGSERIAL PRIMARY KEY,
        resume_id TEXT REFERENCES resumes(resume_id) ON DELETE CASCADE,
        company TEXT,
        position TEXT,
        date_from DATE,
        date_to DATE,
        is_current BOOLEAN,
        description TEXT
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS resume_education (
        id BIGSERIAL PRIMARY KEY,
        resume_id TEXT REFERENCES resumes(resume_id) ON DELETE CASCADE,
        level TEXT,
        institution TEXT,
        faculty TEXT,
        specialty TEXT,
        graduation_year INT
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS resume_contacts (
        id BIGSERIAL PRIMARY KEY,
        resume_id TEXT REFERENCES resumes(resume_id) ON DELETE CASCADE,
        contact_type TEXT CHECK (contact_type IN ('email','phone','telegram')),
        value_raw TEXT NOT NULL,
        value_normalized TEXT
      )
    `;

    // Create indexes for resume tables
    await sql`
      CREATE INDEX IF NOT EXISTS idx_resumes_candidate_name ON resumes(candidate_name)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_resumes_fetched_at ON resumes(fetched_at)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_experience_resume_id ON resume_experience(resume_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_education_resume_id ON resume_education(resume_id)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_contacts_resume_id ON resume_contacts(resume_id)
    `;

    // Create simplified table for raw HTML extracts (ELT approach)
    await sql`
      CREATE TABLE IF NOT EXISTS resume_extracts (
        id BIGSERIAL PRIMARY KEY,
        resume_id TEXT NOT NULL,
        source_url TEXT NOT NULL,
        html_content TEXT NOT NULL,
        extracted_at TIMESTAMPTZ DEFAULT NOW(),
        processed BOOLEAN DEFAULT FALSE,
        processed_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `;

    // Create indexes for extract table
    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_extracts_resume_id ON resume_extracts(resume_id)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_extracts_processed ON resume_extracts(processed)
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_resume_extracts_extracted_at ON resume_extracts(extracted_at)
    `;

    console.log('✅ Database tables created/verified (chats, messages, resumes, extracts)');
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

// Save resume with UPSERT pattern
async function saveResume(resumeData) {
  try {
    const {
      resume_id,
      source_url,
      candidate_name,
      headline,
      location,
      relocation_readiness,
      age,
      birth_date,
      status,
      employment_type,
      schedule,
      salary,
      skills,
      email_primary,
      phone_primary_e164,
      telegram_primary,
      contacts_masked,
      emails,
      phones_raw,
      phones_e164,
      telegrams,
      raw_print_html,
      experience,
      education,
      contacts
    } = resumeData;

    // Use transaction for atomic operation
    await sql.begin(async (tx) => {
      // Upsert main resume record
      await tx`
        INSERT INTO resumes (
          resume_id, source_url, candidate_name, headline, location, relocation_readiness,
          age, birth_date, status, employment_type, schedule, salary, skills,
          email_primary, phone_primary_e164, telegram_primary, contacts_masked,
          emails, phones_raw, phones_e164, telegrams, raw_print_html, updated_at
        ) VALUES (
          ${resume_id}, ${source_url}, ${candidate_name}, ${headline}, ${location}, ${relocation_readiness},
          ${age}, ${birth_date}, ${status}, ${employment_type}, ${schedule}, ${salary}, ${skills},
          ${email_primary}, ${phone_primary_e164}, ${telegram_primary}, ${contacts_masked},
          ${emails}, ${phones_raw}, ${phones_e164}, ${telegrams}, ${raw_print_html}, NOW()
        )
        ON CONFLICT (resume_id) DO UPDATE SET
          source_url = EXCLUDED.source_url,
          candidate_name = EXCLUDED.candidate_name,
          headline = EXCLUDED.headline,
          location = EXCLUDED.location,
          relocation_readiness = EXCLUDED.relocation_readiness,
          age = EXCLUDED.age,
          birth_date = EXCLUDED.birth_date,
          status = EXCLUDED.status,
          employment_type = EXCLUDED.employment_type,
          schedule = EXCLUDED.schedule,
          salary = EXCLUDED.salary,
          skills = EXCLUDED.skills,
          email_primary = EXCLUDED.email_primary,
          phone_primary_e164 = EXCLUDED.phone_primary_e164,
          telegram_primary = EXCLUDED.telegram_primary,
          contacts_masked = EXCLUDED.contacts_masked,
          emails = EXCLUDED.emails,
          phones_raw = EXCLUDED.phones_raw,
          phones_e164 = EXCLUDED.phones_e164,
          telegrams = EXCLUDED.telegrams,
          raw_print_html = EXCLUDED.raw_print_html,
          updated_at = NOW()
      `;

      // Delete existing experience and education records
      await tx`DELETE FROM resume_experience WHERE resume_id = ${resume_id}`;
      await tx`DELETE FROM resume_education WHERE resume_id = ${resume_id}`;
      await tx`DELETE FROM resume_contacts WHERE resume_id = ${resume_id}`;

      // Insert experience records
      if (experience && experience.length > 0) {
        for (const exp of experience) {
          await tx`
            INSERT INTO resume_experience (resume_id, company, position, date_from, date_to, is_current, description)
            VALUES (${resume_id}, ${exp.company}, ${exp.position}, ${exp.date_from}, ${exp.date_to}, ${exp.is_current}, ${exp.description})
          `;
        }
      }

      // Insert education records
      if (education && education.length > 0) {
        for (const edu of education) {
          await tx`
            INSERT INTO resume_education (resume_id, level, institution, faculty, specialty, graduation_year)
            VALUES (${resume_id}, ${edu.level}, ${edu.institution}, ${edu.faculty}, ${edu.specialty}, ${edu.graduation_year})
          `;
        }
      }

      // Insert contact records
      if (contacts && contacts.length > 0) {
        for (const contact of contacts) {
          await tx`
            INSERT INTO resume_contacts (resume_id, contact_type, value_raw, value_normalized)
            VALUES (${resume_id}, ${contact.contact_type}, ${contact.value_raw}, ${contact.value_normalized})
          `;
        }
      }
    });

    console.log(`💾 Resume saved: ${resume_id} - ${candidate_name}`);
    return { success: true, resume_id };
  } catch (error) {
    console.error('❌ Error saving resume:', error);
    throw error;
  }
}

// Get resume by ID
async function getResume(resume_id) {
  try {
    const [resume] = await sql`
      SELECT * FROM resumes WHERE resume_id = ${resume_id}
    `;

    if (!resume) {
      return null;
    }

    // Get related data
    const experience = await sql`
      SELECT * FROM resume_experience WHERE resume_id = ${resume_id} ORDER BY date_from DESC
    `;

    const education = await sql`
      SELECT * FROM resume_education WHERE resume_id = ${resume_id} ORDER BY graduation_year DESC
    `;

    const contacts = await sql`
      SELECT * FROM resume_contacts WHERE resume_id = ${resume_id}
    `;

    return {
      ...resume,
      experience,
      education,
      contacts
    };
  } catch (error) {
    console.error('❌ Error getting resume:', error);
    throw error;
  }
}

// Get all resumes with summary info
async function getAllResumes() {
  try {
    const resumes = await sql`
      SELECT 
        resume_id,
        candidate_name,
        headline,
        location,
        email_primary,
        phone_primary_e164,
        contacts_masked,
        fetched_at,
        updated_at
      FROM resumes 
      ORDER BY updated_at DESC
    `;

    return resumes;
  } catch (error) {
    console.error('❌ Error getting resumes:', error);
    throw error;
  }
}

// Save raw HTML extract (ELT approach)
async function saveExtract(extractData) {
  try {
    const { resume_id, source_url, html_content, metadata = {} } = extractData;
    
    const result = await sql`
      INSERT INTO resume_extracts (resume_id, source_url, html_content, metadata)
      VALUES (${resume_id}, ${source_url}, ${html_content}, ${JSON.stringify(metadata)})
      RETURNING id, extracted_at
    `;
    
    console.log(`📄 Extract saved: Resume ID ${resume_id}, Extract ID ${result[0].id}`);
    return result[0];
  } catch (error) {
    console.error('❌ Error saving extract:', error);
    throw error;
  }
}

// Get unprocessed extracts
async function getUnprocessedExtracts(limit = 10) {
  try {
    const extracts = await sql`
      SELECT * FROM resume_extracts 
      WHERE processed = false
      ORDER BY extracted_at ASC
      LIMIT ${limit}
    `;
    
    return extracts;
  } catch (error) {
    console.error('❌ Error getting unprocessed extracts:', error);
    throw error;
  }
}

// Mark extract as processed
async function markExtractProcessed(extractId) {
  try {
    await sql`
      UPDATE resume_extracts 
      SET processed = true, processed_at = NOW()
      WHERE id = ${extractId}
    `;
    
    console.log(`✅ Extract ${extractId} marked as processed`);
  } catch (error) {
    console.error('❌ Error marking extract as processed:', error);
    throw error;
  }
}

module.exports = {
  sql,
  initDatabase,
  createTables,
  saveChat,
  saveMessage,
  saveMessages,
  getRecentMessages,
  getChatStats,
  getAllChats
};