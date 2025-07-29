# HH.ru Chat Features (Removed)

This document describes the chat messaging features that were removed from the extension to simplify it and focus on resume link extraction.

## Removed Features

### 1. Chat Monitoring and Message Capture
- **File**: `content.js`
- **Purpose**: Monitored HH.ru chat pages and captured messages
- **Key Functions**:
  - `captureCurrentChat()` - Captured chat messages and metadata
  - `monitorChat()` - Real-time chat monitoring
  - `extractChatIdFromUrl()` - Extracted chat ID from URL

### 2. Background Service Worker
- **File**: `background.js`
- **Purpose**: Managed message sending and tab coordination
- **Key Features**:
  - Message queue management
  - Tab navigation for sending messages
  - Communication between popup and content scripts

### 3. Chat List Management
- **Purpose**: Display and manage active chats
- **Features**:
  - List all active chats
  - Copy chat IDs
  - Quick message format generation

### 4. Message Sending
- **Format**: `chat:CHAT_ID:MESSAGE`
- **Features**:
  - Send messages to specific chats
  - Navigate to chat before sending
  - Queue multiple messages

## Database Schema (Chat-related)

The following tables were used for chat features:

```sql
-- Chats table
CREATE TABLE chats (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(500) NOT NULL,
    url VARCHAR(1000),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL,
    message_text TEXT NOT NULL,
    is_from_me BOOLEAN NOT NULL DEFAULT false,
    timestamp TIMESTAMP,
    message_index INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE
);
```

## API Endpoints (Chat-related)

- `POST /inbox` - Receive chat snapshots
- `POST /chats/bulk` - Save multiple chats
- `GET /chats` - Get all chats
- `GET /chats/:chatId/messages` - Get messages for a chat

## How to Re-implement

If you want to re-implement chat features:

1. **Content Script** (`content.js`):
   - Add selectors for HH.ru chat elements
   - Implement message extraction logic
   - Set up mutation observers for real-time monitoring

2. **Background Service** (`background.js`):
   - Implement message queue
   - Handle tab navigation
   - Coordinate popup and content script communication

3. **Popup Interface**:
   - Add chat list display
   - Implement message sending UI
   - Add chat selection and quick copy features

4. **Manifest Updates**:
   ```json
   {
     "background": {
       "service_worker": "background.js"
     },
     "content_scripts": [
       {
         "matches": ["*://*.hh.ru/*"],
         "js": ["content.js"],
         "run_at": "document_idle"
       }
     ]
   }
   ```

## Key Learnings

1. **Selectors Change**: HH.ru frequently updates their UI, so selectors need regular updates
2. **Authentication**: Some features require being logged in to HH.ru
3. **Rate Limiting**: Be careful not to send messages too quickly
4. **DOM Monitoring**: Use MutationObserver for real-time chat updates

## Current Focus

The extension now focuses solely on extracting resume links from vacancy response pages, which is a simpler and more reliable use case.