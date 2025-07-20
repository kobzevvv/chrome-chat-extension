console.log('🚀 Popup script starting...');

let currentTabId = null;

// Simple logging function
function addLog(message) {
  console.log('📋 LOG:', message);
  
  const logContainer = document.getElementById('logContainer');
  if (logContainer) {
    const time = new Date().toLocaleTimeString();
    logContainer.textContent += `[${time}] ${message}\n`;
    logContainer.scrollTop = logContainer.scrollHeight;
  } else {
    console.log('❌ logContainer not found');
  }
}

// Test function
function testLogging() {
  console.log('🧪 TEST BUTTON CLICKED!');
  addLog('🧪 Test button clicked!');
  
  // Test background service
  console.log('🔍 Testing background service...');
  addLog('🔍 Testing background service...');
  
  chrome.runtime.sendMessage({
    type: 'PING',
    timestamp: Date.now()
  }).then(response => {
    console.log('✅ Background response:', response);
    addLog(`✅ Background service works: ${response.message}`);
  }).catch(error => {
    console.log('❌ Background error:', error);
    addLog(`❌ Background service error: ${error.message}`);
  });
}

// Send message function
async function sendQuickMessage() {
  console.log('🚀 SEND BUTTON CLICKED');
  addLog('🚀 Send button clicked');
  
  try {
    const input = document.getElementById('quickFormat');
    if (!input) {
      addLog('❌ Input field not found');
      return;
    }
    
    const message = input.value.trim();
    addLog(`📋 Input: "${message}"`);
    
    // Parse message format
    const match = message.match(/^chat:(\d+):(.+)$/);
    if (!match) {
      addLog('❌ Invalid format. Use: chat:1234567890:message');
      return;
    }
    
    const chatId = match[1];
    const messageText = match[2];
    
    addLog(`✅ Chat ID: ${chatId}`);
    addLog(`✅ Message: "${messageText}"`);
    
    // Get send mode
    let sendMode = 'current';
    const modeInput = document.querySelector('input[name="sendMode"]:checked');
    if (modeInput) {
      sendMode = modeInput.value;
    }
    
    addLog(`📋 Mode: ${sendMode}`);
    addLog(`📤 Sending to background service...`);
    
    // Send to background
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE_BACKGROUND',
      chatId: chatId,
      messageText: messageText,
      mode: sendMode
    });
    
    if (response && response.success) {
      addLog('✅ Message queued successfully!');
      input.value = '';
    } else {
      addLog('❌ Failed to queue message');
    }
    
  } catch (error) {
    console.error('❌ Send error:', error);
    addLog(`❌ Error: ${error.message}`);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Popup DOM loaded');
  addLog('🚀 Popup loaded');
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    currentTabId = tab.id;
    
    addLog(`📋 Tab ID: ${currentTabId}`);
    addLog(`📋 URL: ${tab.url}`);
    
    if (!tab.url.includes('hh.ru')) {
      addLog('❌ Not on HH.ru page');
      return;
    }
    
    addLog('✅ On HH.ru page');
    
  } catch (error) {
    console.error('❌ Tab error:', error);
    addLog(`❌ Tab error: ${error.message}`);
  }
  
  // Set up button event listeners
  const sendBtn = document.getElementById('quickSendBtn');
  const testBtn = document.getElementById('testBtn');
  
  if (sendBtn) {
    sendBtn.addEventListener('click', sendQuickMessage);
    console.log('✅ Send button listener added');
  } else {
    console.log('❌ Send button not found');
    addLog('❌ Send button not found in DOM');
  }
  
  if (testBtn) {
    testBtn.addEventListener('click', testLogging);
    console.log('✅ Test button listener added');
  } else {
    console.log('❌ Test button not found');
    addLog('❌ Test button not found in DOM');
  }
  
  // Try to load chat list
  loadChatList();
});

async function loadChatList() {
  try {
    addLog('🔍 Loading chat list...');
    
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: 'GET_CHAT_LIST'
    });
    
    if (response && response.success) {
      renderChatList(response.chats);
      addLog(`✅ Found ${response.chats.length} chats`);
    } else {
      addLog('❌ Failed to get chat list');
    }
  } catch (error) {
    console.error('❌ Chat list error:', error);
    addLog('🔄 Content script not loaded');
  }
}

function renderChatList(chats) {
  const container = document.getElementById('chatList');
  
  if (!chats || !chats.length) {
    container.innerHTML = '<div class="empty">No chats found</div>';
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
  console.log('📋 Chat selected:', chatId, chatName);
  addLog(`📋 Selected: ${chatName} (${chatId})`);
  
  const input = document.getElementById('quickFormat');
  if (input) {
    input.value = `chat:${chatId}:`;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    addLog(`📋 Copied: ${text}`);
  }).catch(err => {
    addLog('❌ Copy failed');
  });
}

function copyQuickFormat(chatId) {
  const format = `chat:${chatId}:`;
  navigator.clipboard.writeText(format).then(() => {
    addLog(`📋 Copied format: ${format}`);
    
    const input = document.getElementById('quickFormat');
    if (input) {
      input.value = format;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }).catch(err => {
    addLog('❌ Copy failed');
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}