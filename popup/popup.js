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
    <div class="chat-item" onclick="selectChat('${chat.id}')">
      <div class="chat-name">${escapeHtml(chat.name || `Chat #${index + 1}`)}</div>
      <div class="chat-preview">${escapeHtml(chat.lastMessage || 'No messages')}</div>
      <div class="chat-meta">
        <span>Messages: ${chat.messageCount || 0}</span>
        <span>${chat.isActive ? '🟢 Active' : '⚪ Inactive'}</span>
      </div>
    </div>
  `).join('');
}

function selectChat(chatId) {
  // TODO: Handle chat selection
  updateStatus(`Selected chat: ${chatId}`);
  
  // For now, just highlight the selected chat
  document.querySelectorAll('.chat-item').forEach(item => {
    item.style.backgroundColor = '';
  });
  
  event.target.closest('.chat-item').style.backgroundColor = '#e3f2fd';
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