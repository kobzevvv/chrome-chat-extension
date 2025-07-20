let currentTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Get current active tab
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  currentTabId = tab.id;
  
  updateStatus(`Current URL: ${tab.url.substring(0, 50)}...`);
  
  // Check if we're on HH.ru
  if (!tab.url.includes('hh.ru')) {
    showError('This extension only works on HH.ru pages');
    return;
  }
  
  // Load chat list
  loadChatList();
});

async function loadChatList() {
  try {
    updateStatus('Scanning for chats...');
    
    // Request chat list from content script
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: 'GET_CHAT_LIST'
    });
    
    if (response && response.success) {
      renderChatList(response.chats);
      updateStatus(`Found ${response.chats.length} chats`);
      
      // Debug info
      document.getElementById('debug').textContent = `Debug: ${JSON.stringify(response, null, 2)}`;
    } else {
      showError('Failed to get chat list: ' + (response?.error || 'Unknown error'));
    }
  } catch (error) {
    showError('Failed to communicate with page: ' + error.message);
    
    // Try to inject content script if it's not loaded
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        files: ['content.js']
      });
      
      // Try again after injection
      setTimeout(loadChatList, 1000);
    } catch (injectionError) {
      showError('Content script injection failed. Try refreshing the page.');
    }
  }
}

function renderChatList(chats) {
  const container = document.getElementById('chatList');
  
  if (!chats || !chats.length) {
    container.innerHTML = '<div class="empty">No active chats found</div>';
    return;
  }
  
  container.innerHTML = chats.map((chat, index) => `
    <div class="chat-item" onclick="selectChat('${chat.chatId}', '${escapeHtml(chat.name)}')">
      <div class="chat-name">${escapeHtml(chat.name || `Chat #${index + 1}`)}</div>
      <div class="chat-id" onclick="event.stopPropagation(); copyToClipboard('${chat.chatId}')" title="Click to copy Chat ID">
        ID: ${chat.chatId}
      </div>
      <div class="chat-preview">${escapeHtml(chat.lastMessage || 'No messages')}</div>
      <div class="chat-meta">
        <span>Messages: ${chat.messageCount || 0}</span>
        <span>${chat.isActive ? '🟢 Active' : '⚪ Inactive'}</span>
      </div>
      <div class="quick-copy" onclick="event.stopPropagation(); copyQuickFormat('${chat.chatId}')" title="Click to copy quick format">
        chat:${chat.chatId}:
      </div>
    </div>
  `).join('');
}

function selectChat(chatId, chatName) {
  // Fill the quick format input with template
  document.getElementById('quickFormat').value = `chat:${chatId}:`;
  updateStatus(`Selected chat: ${chatName} (ID: ${chatId})`);
  addLog(`Selected chat ${chatId}: ${chatName}`, 'info');
  
  // Highlight the selected chat
  document.querySelectorAll('.chat-item').forEach(item => {
    item.style.backgroundColor = '';
  });
  
  event.target.closest('.chat-item').style.backgroundColor = '#e3f2fd';
  
  // Focus on message input and position cursor at the end
  const input = document.getElementById('quickFormat');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

async function sendMessage() {
  // Remove this function since we're only using quick format
}

async function sendQuickMessage() {
  const quickFormat = document.getElementById('quickFormat').value.trim();
  
  addLog(`Attempting to parse: "${quickFormat}"`, 'info');
  
  // Parse format: chat:ID:message
  const match = quickFormat.match(/^chat:(\d+):(.+)$/);
  
  if (!match) {
    const error = 'Invalid format. Use: chat:4644696158:Привет';
    showError(error);
    addLog(`Parse failed: ${error}`, 'error');
    return;
  }
  
  const chatId = match[1];
  const message = match[2];
  
  addLog(`Parsed - Chat ID: ${chatId}, Message: "${message}"`, 'success');
  await sendMessageToChat(chatId, message);
}

async function sendMessageToChat(chatId, message) {
  try {
    updateStatus('Sending message...');
    addLog(`Starting message send to chat ${chatId}`, 'info');
    
    // Disable send button
    const sendBtn = document.getElementById('quickSendBtn');
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    
    addLog('Communicating with content script...', 'info');
    
    // Send message via content script
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: 'SEND_MESSAGE',
      chatId: chatId,
      text: message
    });
    
    addLog(`Content script response: ${JSON.stringify(response)}`, 'info');
    
    if (response && response.success) {
      const successMsg = `✅ Message sent to chat ${chatId}!`;
      showSuccess(successMsg);
      updateStatus('Message sent successfully');
      addLog(successMsg, 'success');
      
      // Clear input
      document.getElementById('quickFormat').value = '';
      
      // Refresh chat list after a moment
      setTimeout(loadChatList, 2000);
    } else {
      const errorMsg = `❌ Send failed: ${response?.error || 'Unknown error'}`;
      showError(errorMsg);
      addLog(errorMsg, 'error');
    }
    
  } catch (error) {
    const errorMsg = `❌ Communication error: ${error.message}`;
    showError(errorMsg);
    addLog(errorMsg, 'error');
  } finally {
    // Re-enable send button
    const sendBtn = document.getElementById('quickSendBtn');
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send';
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showSuccess(`Copied: ${text}`);
  }).catch(err => {
    showError('Failed to copy to clipboard');
  });
}

function copyQuickFormat(chatId) {
  const format = `chat:${chatId}:`;
  navigator.clipboard.writeText(format).then(() => {
    showSuccess(`Copied format: ${format}`);
    addLog(`Copied to clipboard: ${format}`, 'info');
    // Also fill the quick format input
    document.getElementById('quickFormat').value = format;
    // Focus on the end of the input
    const input = document.getElementById('quickFormat');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }).catch(err => {
    const errorMsg = 'Failed to copy to clipboard';
    showError(errorMsg);
    addLog(errorMsg, 'error');
  });
}

function addLog(message, type = 'info') {
  const logContainer = document.getElementById('logContainer');
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  
  const time = new Date().toLocaleTimeString();
  logEntry.innerHTML = `<span class="log-time">${time}</span>${message}`;
  
  logContainer.appendChild(logEntry);
  
  // Auto-scroll to bottom
  logContainer.scrollTop = logContainer.scrollHeight;
  
  // Keep only last 20 log entries
  const entries = logContainer.children;
  while (entries.length > 20) {
    logContainer.removeChild(entries[0]);
  }
}

function updateStatus(text) {
  document.getElementById('status').textContent = text;
}

function showError(message) {
  const errorDiv = document.getElementById('error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

function showSuccess(message) {
  const successDiv = document.getElementById('success');
  successDiv.textContent = message;
  successDiv.style.display = 'block';
  setTimeout(() => {
    successDiv.style.display = 'none';
  }, 3000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}