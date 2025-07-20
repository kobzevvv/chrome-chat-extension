let currentTabId = null;

// Simple logging that directly writes to the log container
function addLog(message) {
  console.log('📋 LOG:', message);
  
  const logContainer = document.getElementById('logContainer');
  if (logContainer) {
    const time = new Date().toLocaleTimeString();
    logContainer.textContent += `[${time}] ${message}\n`;
    logContainer.scrollTop = logContainer.scrollHeight;
  } else {
    console.log('❌ logContainer not found in DOM');
  }
}

// Test function
function testLogging() {
  console.log('🧪 TEST BUTTON CLICKED!');
  addLog('🧪 Test button works!');
  alert('Test button clicked! Check console and log.');
}

// Main send function - now delegates to background service
async function sendQuickMessage() {
  console.log('🚀 === SEND BUTTON CLICKED ===');
  addLog('🚀 Send button clicked');
  
  try {
    // Get input value
    const input = document.getElementById('quickFormat');
    if (!input) {
      console.log('❌ Input not found');
      addLog('❌ Input field not found');
      return;
    }
    
    const message = input.value.trim();
    console.log('📋 Input value:', message);
    addLog(`📋 Input: "${message}"`);
    
    // Parse the message
    const match = message.match(/^chat:(\d+):(.+)$/);
    if (!match) {
      console.log('❌ Invalid format');
      addLog('❌ Invalid format. Use: chat:1234567890:message');
      alert('Invalid format!\nUse: chat:1234567890:YourMessage');
      return;
    }
    
    const chatId = match[1];
    const messageText = match[2];
    
    console.log('✅ Parsed:', {chatId, messageText});
    addLog(`✅ Chat ID: ${chatId}`);
    addLog(`✅ Message: "${messageText}"`);
    
    // Disable send button during process
    const sendBtn = document.getElementById('quickSendBtn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending...';
    }
    
    // Check which mode is selected (with fallback)
    let sendMode = 'current'; // default
    try {
      const selectedMode = document.querySelector('input[name="sendMode"]:checked');
      if (selectedMode) {
        sendMode = selectedMode.value;
      }
    } catch (error) {
      console.log('❌ Mode selection error, using default:', error);
      addLog('⚠️ Using default mode: current tab');
    }
    
    addLog(`📋 Send mode: ${sendMode}`);
    addLog(`📤 Delegating to background service...`);
    
    // Send to background service worker
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE_BACKGROUND',
      chatId: chatId,
      messageText: messageText,
      mode: sendMode
    });
    
    if (response && response.success) {
      addLog('✅ Message queued for sending!');
      addLog('📋 Background service will handle the rest');
      
      if (sendMode === 'current') {
        addLog('📍 Current tab will navigate to chat page');
      } else {
        addLog('📍 Background tab will open and send message');
      }
      
      // Clear input
      input.value = '';
      
    } else {
      addLog('❌ Failed to queue message');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    addLog(`❌ Error: ${error.message}`);
  } finally {
    // Re-enable send button
    const sendBtn = document.getElementById('quickSendBtn');
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
    }
  }
}

async function sendMessageToChat(chatId, messageText) {
  try {
    addLog(`📍 Step 1: Opening chat ${chatId}...`);
    
    // Create new tab or update existing tab with the chat URL
    const chatUrl = `https://ufa.hh.ru/chat/${chatId}`;
    
    // Option 1: Update current tab
    await chrome.tabs.update(currentTabId, { url: chatUrl });
    addLog(`📍 Navigated to chat page`);
    
    // Wait for page to load
    addLog(`⏱️ Step 2: Waiting for page to load...`);
    
    // Wait for navigation to complete
    await new Promise(resolve => {
      const listener = (tabId, changeInfo) => {
        if (tabId === currentTabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      
      // Fallback timeout
      setTimeout(resolve, 5000);
    });
    
    addLog(`✅ Page loaded`);
    addLog(`📋 Step 3: Injecting content script...`);
    
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: currentTabId },
      files: ['content.js']
    });
    
    addLog(`✅ Content script injected`);
    addLog(`⏱️ Step 4: Waiting for script to initialize...`);
    
    // Wait for content script to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    addLog(`📤 Step 5: Sending message...`);
    
    // Send message
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: 'SEND_MESSAGE',
      chatId: chatId,
      text: messageText
    });
    
    console.log('📨 Response:', response);
    
    if (response && response.success) {
      addLog('🎉 SUCCESS: Message sent!');
      
      // Clear input
      const input = document.getElementById('quickFormat');
      if (input) input.value = '';
      
      addLog(`📍 You can now see the sent message in the chat`);
      
    } else {
      addLog(`❌ Send failed: ${response?.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('❌ Send error:', error);
    addLog(`❌ Send error: ${error.message}`);
    
    if (error.message.includes('Could not establish connection')) {
      addLog(`💡 Try waiting a bit longer and try again`);
    }
  }
}

// Alternative: Send in background tab (doesn't switch focus)
async function sendMessageInBackground(chatId, messageText) {
  try {
    addLog(`📍 Opening chat ${chatId} in background...`);
    
    // Create new background tab
    const newTab = await chrome.tabs.create({
      url: `https://ufa.hh.ru/chat/${chatId}`,
      active: false  // Don't switch to this tab
    });
    
    addLog(`📍 Background tab created: ${newTab.id}`);
    
    // Wait for page to load
    await new Promise(resolve => {
      const listener = (tabId, changeInfo) => {
        if (tabId === newTab.id && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      
      setTimeout(resolve, 5000);
    });
    
    addLog(`✅ Background page loaded`);
    
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: newTab.id },
      files: ['content.js']
    });
    
    addLog(`✅ Content script injected in background`);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Send message
    const response = await chrome.tabs.sendMessage(newTab.id, {
      type: 'SEND_MESSAGE',
      chatId: chatId,
      text: messageText
    });
    
    if (response && response.success) {
      addLog('🎉 SUCCESS: Message sent in background!');
      
      // Close background tab after a moment
      setTimeout(() => {
        chrome.tabs.remove(newTab.id);
        addLog(`📍 Background tab closed`);
      }, 1000);
      
      // Clear input
      const input = document.getElementById('quickFormat');
      if (input) input.value = '';
      
    } else {
      addLog(`❌ Background send failed: ${response?.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    addLog(`❌ Background send error: ${error.message}`);
  }
}

// Set up event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Popup loaded');
  addLog('🚀 Popup loaded');
  
  // Get current tab
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    currentTabId = tab.id;
    
    console.log('📋 Tab:', tab.url);
    addLog(`📋 Tab ID: ${currentTabId}`);
    addLog(`📋 URL: ${tab.url}`);
    
    // Check if on HH.ru
    if (!tab.url.includes('hh.ru')) {
      addLog('❌ Not on HH.ru page');
      return;
    }
    
    addLog('✅ On HH.ru page');
    
  } catch (error) {
    console.error('❌ Tab error:', error);
    addLog(`❌ Tab error: ${error.message}`);
  }
  
  // Set up button listeners
  const sendBtn = document.getElementById('quickSendBtn');
  const testBtn = document.getElementById('testBtn');
  
  if (sendBtn) {
    sendBtn.addEventListener('click', sendQuickMessage);
    console.log('✅ Send button listener added');
  } else {
    console.log('❌ Send button not found');
  }
  
  if (testBtn) {
    testBtn.addEventListener('click', testLogging);
    console.log('✅ Test button listener added');
  } else {
    console.log('❌ Test button not found');
  }
  
  // Load chat list
  loadChatList();
});

async function loadChatList() {
  try {
    addLog('🔍 Loading chat list...');
    
    let response;
    try {
      response = await chrome.tabs.sendMessage(currentTabId, {
        type: 'GET_CHAT_LIST'
      });
    } catch (commError) {
      if (commError.message.includes('Could not establish connection')) {
        addLog('🔄 Content script not loaded for chat list');
        addLog('💡 Content script will be injected when sending messages');
        
        // Show a simple message instead of failing
        const container = document.getElementById('chatList');
        container.innerHTML = `
          <div class="empty">
            Content script not loaded on this page.<br>
            Navigate to a specific chat page to see chat list.<br>
            You can still send messages by typing the format manually.
          </div>
        `;
        return;
      } else {
        throw commError;
      }
    }
    
    if (response && response.success) {
      renderChatList(response.chats);
      addLog(`✅ Found ${response.chats.length} chats`);
    } else {
      addLog('❌ Failed to get chat list');
    }
  } catch (error) {
    console.error('❌ Chat list error:', error);
    addLog(`❌ Chat list error: ${error.message}`);
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
  
  // Fill input
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