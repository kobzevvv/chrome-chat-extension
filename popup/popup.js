let currentTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Get current active tab
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  currentTabId = tab.id;
  
  // Check if we're on HH.ru chat page
  if (!tab.url.includes('hh.ru/chat/')) {
    showError('This extension only works on HH.ru chat pages');
    return;
  }
  
  // Load chat state
  loadChatState();
  
  // Setup event listeners
  document.getElementById('sendButton').addEventListener('click', sendMessage);
  document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });
});

async function loadChatState() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_STATE',
      tabId: currentTabId
    });
    
    renderMessages(response.messages || []);
    updateStatus(`Last updated: ${new Date(response.timestamp).toLocaleTimeString()}`);
  } catch (error) {
    showError('Failed to load chat state: ' + error.message);
  }
}

function renderMessages(messages) {
  const container = document.getElementById('messages');
  
  if (!messages.length) {
    container.innerHTML = '<div class="empty">No messages yet</div>';
    return;
  }
  
  container.innerHTML = messages.map(msg => {
    const time = formatTimestamp(msg.ts);
    const className = msg.me ? 'message me' : 'message them';
    
    return `
      <div class="${className}">
        <div>${escapeHtml(msg.text)}</div>
        <div class="message-time">${time}</div>
      </div>
    `;
  }).join('');
  
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('messageInput');
  const button = document.getElementById('sendButton');
  const text = input.value.trim();
  
  if (!text) return;
  
  // Disable UI while sending
  button.disabled = true;
  button.textContent = 'Sending...';
  input.disabled = true;
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE',
      tabId: currentTabId,
      text: text
    });
    
    if (response.success) {
      input.value = '';
      // Reload chat state to see the new message
      setTimeout(loadChatState, 1000);
    } else {
      showError('Failed to send message: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    showError('Failed to send message: ' + error.message);
  } finally {
    // Re-enable UI
    button.disabled = false;
    button.textContent = 'Send';
    input.disabled = false;
    input.focus();
  }
}

function formatTimestamp(ts) {
  if (typeof ts === 'string') {
    return ts; // If already formatted
  }
  
  const date = new Date(ts);
  const now = new Date();
  
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  } else {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}