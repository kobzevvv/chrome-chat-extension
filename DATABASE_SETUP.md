# Chat Messages Database Setup

This document explains how to set up the database functionality to save chat messages to Neon.com serverless database.

## Features Added

✅ **Automatic Message Capture**: Content script automatically monitors chat pages and captures new messages
✅ **Database Storage**: Messages are stored in Neon PostgreSQL database with chat metadata
✅ **API Endpoints**: RESTful API to retrieve stored chats and messages
✅ **Message Deduplication**: Only new messages are sent to avoid duplicates

## Database Schema

### Tables Created

1. **chats** - Stores chat metadata
   - `id` (Primary Key)
   - `chat_id` (Unique chat identifier from URL)
   - `name` (Chat/candidate name)
   - `url` (Chat page URL)
   - `created_at`, `updated_at`

2. **messages** - Stores individual chat messages
   - `id` (Primary Key)
   - `chat_id` (Foreign Key to chats.chat_id)
   - `message_text` (Message content)
   - `is_from_me` (Boolean: true if sent by you)
   - `timestamp` (When message was sent)
   - `message_index` (Order in conversation)
   - `created_at`

## Setup Instructions

### 1. Create Neon Database

1. Go to [console.neon.tech](https://console.neon.tech/)
2. Create a new project
3. Copy your connection string (it looks like: `postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`)

### 2. Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Neon connection string:
   ```
   DATABASE_URL=postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   PORT=4000
   ```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the API Server

```bash
npm run dev
```

The server will automatically:
- Connect to your Neon database
- Create the required tables if they don't exist
- Start listening on port 4000

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/inbox` | Receive chat snapshots (used by extension) |
| GET | `/chats` | Get all chats with message counts |
| GET | `/chats/:chatId/messages` | Get messages for specific chat |
| GET | `/chats/:chatId/stats` | Get statistics for specific chat |
| GET | `/health` | Health check |

## How It Works

1. **Content Script Monitoring**: When you visit a chat page on HH.ru, the content script starts monitoring for new messages every 5 seconds

2. **Message Detection**: When new messages are detected, the script extracts:
   - Message text
   - Sender (you vs them)
   - Timestamp
   - Chat ID and name

3. **API Call**: The content script sends a snapshot to `POST /inbox` with all current messages

4. **Database Storage**: The API server:
   - Saves/updates chat information
   - Stores new messages
   - Avoids duplicates

5. **Data Retrieval**: You can query the API to get stored chat data

## Testing

1. Start the API server: `npm run dev`
2. Load the Chrome extension
3. Visit a chat page on HH.ru
4. Check the browser console for monitoring logs
5. Check the API server logs for incoming data
6. Visit `http://localhost:4000/chats` to see stored chats

## Example Usage

```javascript
// Get all chats
const chats = await fetch('http://localhost:4000/chats').then(r => r.json());

// Get messages for a specific chat
const messages = await fetch('http://localhost:4000/chats/123456789/messages').then(r => r.json());

// Get chat statistics
const stats = await fetch('http://localhost:4000/chats/123456789/stats').then(r => r.json());
```

## Troubleshooting

- **Database connection fails**: Check your `DATABASE_URL` is correct
- **No messages captured**: Check browser console for errors, ensure you're on a chat page
- **CORS errors**: The API allows all origins by default
- **Extension not working**: Check that the content script is injected properly

## Security Notes

- The API currently allows all CORS origins for development
- Database credentials are in environment variables
- Consider adding authentication for production use