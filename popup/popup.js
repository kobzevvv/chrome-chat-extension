let currentTabId = null;
let selectedChatId = null;

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

  document.getElementById('sendBtn').addEventListener('click', handleSendClick);
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
    <div class="chat-item" onclick="selectChat('${chat.chatId}', event)">
      <div class="chat-name">${escapeHtml(chat.name || `Chat #${index + 1}`)}</div>
      <div class="chat-preview">${escapeHtml(chat.lastMessage || 'No messages')}</div>
      <div class="chat-meta">
        <span>ID: ${chat.chatId || 'n/a'}</span>
        <span>Messages: ${chat.messageCount || 0}</span>
        <span>${chat.isActive ? '🟢 Active' : '⚪ Inactive'}</span>
      </div>
    </div>
  `).join('');
}

function selectChat(chatId, evt) {
  selectedChatId = chatId;
  updateStatus(`Selected chat: ${chatId}`);

  // For now, just highlight the selected chat
  document.querySelectorAll('.chat-item').forEach(item => {
    item.style.backgroundColor = '';
  });

  if (evt) evt.currentTarget.style.backgroundColor = '#e3f2fd';

  const input = document.getElementById('sendInput');
  if (input) input.value = `${chatId}:`;
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleSendClick() {
  const input = document.getElementById('sendInput');
  const value = input.value.trim();
  console.log('Popup send click', value);
  if (!value) return;

  const parts = value.split(':');
  if (parts.length < 2 && !selectedChatId) {
    showError('Use format chatId:message');
    return;
  }

  if (parts[0] === 'chat') parts.shift();
  let chatId;
  let text;
  if (parts.length >= 2) {
    chatId = parts.shift();
    text = parts.join(':');
  } else {
    chatId = selectedChatId;
    text = parts.join(':');
  }

  chrome.tabs.sendMessage(currentTabId, { type: 'SEND_MESSAGE', chatId, text })
    .then(res => {
      console.log('Send response', res);
      if (res && res.success) {
        updateStatus('Message sent');
        input.value = '';
      } else {
        showError('Failed to send message');
      }
    })
    .catch(err => {
      console.error('Send error', err);
      showError('Error: ' + err.message);
    });
}