console.log('🚀 Popup script starting...');

let currentTabId = null;

// Enhanced logging function
function addLog(message, type = 'info') {
  console.log('📋 LOG:', message);
  
  const logContainer = document.getElementById('logContainer');
  if (logContainer) {
    const time = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Keep only last 50 log entries
    while (logContainer.children.length > 50) {
      logContainer.removeChild(logContainer.firstChild);
    }
  } else {
    console.log('❌ logContainer not found');
  }
}

// Test function
function testLogging() {
  console.log('🧪 TEST BUTTON CLICKED!');
  addLog('🧪 Test button clicked!', 'info');
  
  // Test background service
  console.log('🔍 Testing background service...');
  addLog('🔍 Testing background service...', 'info');
  
  chrome.runtime.sendMessage({
    type: 'PING',
    timestamp: Date.now()
  }).then(response => {
    console.log('✅ Background response:', response);
    addLog(`✅ Background service works: ${response.message}`, 'success');
  }).catch(error => {
    console.log('❌ Background error:', error);
    addLog(`❌ Background service error: ${error.message}`, 'error');
  });
}

// Save chats to database
async function saveChatsToDatabase(chats) {
  try {
    addLog('💾 Saving chats to database...', 'info');
    
    const response = await fetch('http://localhost:4000/chats/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ chats })
    });
    
    if (response.ok) {
      const result = await response.json();
      addLog(`✅ Saved ${result.saved} chats to database`, 'success');
      return result;
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    addLog(`❌ Failed to save chats: ${error.message}`, 'error');
    throw error;
  }
}

// Get debug info from content script
async function getDebugInfo() {
  try {
    addLog('🔍 Getting debug info from content script...', 'info');
    
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: 'GET_DEBUG_INFO'
    });
    
    if (response && response.success) {
      const debugInfo = response.debugInfo;
      addLog(`📊 Chat monitoring: ${debugInfo.isMonitoring ? 'ON' : 'OFF'}`, debugInfo.isMonitoring ? 'success' : 'error');
      addLog(`📍 Current URL: ${debugInfo.currentUrl}`, 'info');
      addLog(`🆔 Chat ID: ${debugInfo.chatId || 'Not detected'}`, debugInfo.chatId ? 'success' : 'error');
      addLog(`📬 Messages found: ${debugInfo.messageCount}`, 'info');
      addLog(`📤 Last capture: ${debugInfo.lastCapture ? new Date(debugInfo.lastCapture).toLocaleTimeString() : 'Never'}`, 'info');
    } else {
      addLog('❌ Could not get debug info from content script', 'error');
    }
  } catch (error) {
    addLog(`❌ Debug info error: ${error.message}`, 'error');
  }
}

// Inspect DOM for message elements
async function inspectMessagesDOM() {
  try {
    addLog('🔍 Inspecting DOM for message elements...', 'info');
    
    // Execute the inspection function in the content script context
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: 'INSPECT_MESSAGES_DOM'
    });
    
    if (response && response.success) {
      const inspection = response.inspection;
      addLog(`📊 Found ${inspection.totalSelectors} potential selectors`, 'info');
      addLog(`📋 Found ${inspection.messageCandidates} message candidates`, 'info');
      
      if (inspection.bestSelectors && inspection.bestSelectors.length > 0) {
        addLog(`✅ Best selectors:`, 'success');
        inspection.bestSelectors.forEach((selector, index) => {
          addLog(`  ${index + 1}. "${selector.selector}" (${selector.count} elements)`, 'info');
        });
      } else {
        addLog('❌ No good message selectors found', 'error');
      }
      
      addLog('💡 Check browser console for detailed inspection results', 'info');
    } else {
      addLog('❌ Could not inspect DOM from content script', 'error');
    }
  } catch (error) {
    addLog(`❌ DOM inspection error: ${error.message}`, 'error');
  }
}

// Send message function
async function sendQuickMessage() {
  console.log('🚀 SEND BUTTON CLICKED');
  addLog('🚀 Send button clicked', 'info');
  
  try {
    const input = document.getElementById('quickFormat');
    if (!input) {
      addLog('❌ Input field not found', 'error');
      return;
    }
    
    const message = input.value.trim();
    addLog(`📋 Input: "${message}"`, 'info');
    
    // Parse message format
    const match = message.match(/^chat:(\d+):(.+)$/);
    if (!match) {
      addLog('❌ Invalid format. Use: chat:1234567890:message', 'error');
      return;
    }
    
    const chatId = match[1];
    const messageText = match[2];
    
    addLog(`✅ Chat ID: ${chatId}`, 'success');
    addLog(`✅ Message: "${messageText}"`, 'success');
    
    // Get send mode
    let sendMode = 'current';
    const modeInput = document.querySelector('input[name="sendMode"]:checked');
    if (modeInput) {
      sendMode = modeInput.value;
    }
    
    addLog(`📋 Mode: ${sendMode}`, 'info');
    addLog(`📤 Sending to background service...`, 'info');
    
    // Send to background
    const response = await chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE_BACKGROUND',
      chatId: chatId,
      messageText: messageText,
      mode: sendMode
    });
    
    if (response && response.success) {
      addLog('✅ Message queued successfully!', 'success');
      input.value = '';
    } else {
      addLog('❌ Failed to queue message', 'error');
    }
    
  } catch (error) {
    console.error('❌ Send error:', error);
    addLog(`❌ Error: ${error.message}`, 'error');
  }
}

// Resume capture function
async function captureCurrentResume() {
  try {
    addLog('📄 Starting resume capture...', 'info');
    
    // Update status display
    const statusEl = document.getElementById('resumeStatus');
    if (statusEl) {
      statusEl.textContent = 'Capturing resume...';
      statusEl.style.color = '#007bff';
    }
    
    // Get checkbox state
    const revealContacts = document.getElementById('revealContacts')?.checked || false;
    
    // Get current tab
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    if (!tab || !tab.url) {
      throw new Error('No active tab found');
    }
    
    // Check if on resume page
    if (!tab.url.includes('/resume/')) {
      addLog('❌ Not on a resume page', 'error');
      if (statusEl) {
        statusEl.textContent = 'Please navigate to a resume page first';
        statusEl.style.color = '#dc3545';
      }
      return;
    }
    
    addLog(`📄 Capturing from: ${tab.url}`, 'info');
    addLog(`📄 Reveal contacts: ${revealContacts ? 'Yes' : 'No'}`, 'info');
    
    // Send capture request to content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'CAPTURE_RESUME',
      options: {
        revealContacts: revealContacts
      }
    });
    
    if (response && response.success) {
      addLog('✅ Resume captured successfully!', 'success');
      addLog(`📄 Resume ID: ${response.result.resume_id}`, 'info');
      addLog(`👤 Candidate: ${response.result.candidate_name}`, 'info');
      addLog(`📧 Emails: ${response.result.contacts_found.emails}`, 'info');
      addLog(`📱 Phones: ${response.result.contacts_found.phones}`, 'info');
      addLog(`📲 Telegram: ${response.result.contacts_found.telegrams}`, 'info');
      
      if (response.result.contacts_masked) {
        addLog('⚠️ Some contacts are masked', 'warning');
      }
      
      if (statusEl) {
        statusEl.textContent = `Saved: ${response.result.candidate_name}`;
        statusEl.style.color = '#28a745';
      }
      
      // Show stored resumes link
      showStoredResumesLink();
      
    } else {
      throw new Error(response?.error || 'Failed to capture resume');
    }
    
  } catch (error) {
    console.error('❌ Resume capture error:', error);
    addLog(`❌ Resume capture failed: ${error.message}`, 'error');
    
    const statusEl = document.getElementById('resumeStatus');
    if (statusEl) {
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.style.color = '#dc3545';
    }
  }
}

// Show link to view stored resumes
function showStoredResumesLink() {
  const statusEl = document.getElementById('resumeStatus');
  if (statusEl) {
    setTimeout(() => {
      statusEl.innerHTML = `
        <a href="http://localhost:4000/resumes" target="_blank" 
           style="color: #007bff; text-decoration: underline; cursor: pointer;">
          View all stored resumes →
        </a>
      `;
    }, 3000);
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
  const debugBtn = document.getElementById('debugBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const inspectBtn = document.getElementById('inspectBtn');
  
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
  
  if (debugBtn) {
    debugBtn.addEventListener('click', getDebugInfo);
    console.log('✅ Debug button listener added');
  } else {
    console.log('❌ Debug button not found');
  }
  
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadChatList);
    console.log('✅ Refresh button listener added');
  } else {
    console.log('❌ Refresh button not found');
  }
  
  if (inspectBtn) {
    inspectBtn.addEventListener('click', inspectMessagesDOM);
    console.log('✅ Inspect button listener added');
  } else {
    console.log('❌ Inspect button not found');
  }
  
  // Resume extraction button
  const extractResumesBtn = document.getElementById('extractResumesBtn');
  if (extractResumesBtn) {
    extractResumesBtn.addEventListener('click', handleResumeExtraction);
    console.log('✅ Extract resumes button listener added');
  } else {
    console.log('❌ Extract resumes button not found');
  }
  
  // Try to load chat list
  loadChatList();
});

async function loadChatList() {
  try {
    addLog('🔍 Loading chat list...', 'info');
    
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: 'GET_CHAT_LIST'
    });
    
    if (response && response.success) {
      renderChatList(response.chats);
      addLog(`✅ Found ${response.chats.length} chats`, 'success');
      
      // Save chats to database
      if (response.chats.length > 0) {
        try {
          await saveChatsToDatabase(response.chats);
        } catch (error) {
          // Already logged in saveChatsToDatabase
        }
      }
      
      // Get debug info
      await getDebugInfo();
      
    } else {
      addLog('❌ Failed to get chat list', 'error');
    }
  } catch (error) {
    console.error('❌ Chat list error:', error);
    addLog('🔄 Content script not loaded', 'error');
  }
}

function renderChatList(chats) {
  const container = document.getElementById('chatList');
  
  if (!chats || !chats.length) {
    container.innerHTML = '<div class="empty">No chats found</div>';
    return;
  }
  
  container.innerHTML = chats.map((chat, index) => `
    <div class="chat-item" data-chat-id="${chat.chatId}" data-chat-name="${escapeHtml(chat.name)}">
      <div class="chat-name">${escapeHtml(chat.name || `Chat #${index + 1}`)}</div>
      <div class="chat-id" data-action="copy-id" data-value="${chat.chatId}" title="Click to copy Chat ID">
        ID: ${chat.chatId}
      </div>
      <div class="chat-preview">${escapeHtml(chat.lastMessage || 'No messages')}</div>
      <div class="chat-meta">
        <span>Messages: ${chat.messageCount || 0}</span>
        <span>${chat.isActive ? '🟢 Active' : '⚪ Inactive'}</span>
      </div>
      <div class="quick-copy" data-action="copy-format" data-value="${chat.chatId}" title="Click to copy quick format">
        chat:${chat.chatId}:
      </div>
    </div>
  `).join('');
  
  // Add event delegation for chat list interactions
  container.addEventListener('click', handleChatListClick);
}

// Handle clicks on chat list items
function handleChatListClick(event) {
  const target = event.target;
  
  // Handle copy actions
  const action = target.getAttribute('data-action');
  if (action === 'copy-id') {
    event.stopPropagation();
    copyToClipboard(target.getAttribute('data-value'));
    return;
  }
  
  if (action === 'copy-format') {
    event.stopPropagation();
    copyQuickFormat(target.getAttribute('data-value'));
    return;
  }
  
  // Handle chat item selection
  const chatItem = target.closest('.chat-item');
  if (chatItem) {
    const chatId = chatItem.getAttribute('data-chat-id');
    const chatName = chatItem.getAttribute('data-chat-name');
    selectChat(chatId, chatName);
  }
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

// Add event listener for vacancy extractor button
document.getElementById('vacancyExtractorBtn').addEventListener('click', () => {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup/vacancy-extractor.html'),
    type: 'popup',
    width: 450,
    height: 600
  });
});

// Handle resume extraction
async function handleResumeExtraction() {
  const count = document.getElementById('resumeCount').value;
  const statusDiv = document.getElementById('extractionStatus');
  const messageEl = document.getElementById('extractionMessage');
  const extractBtn = document.getElementById('extractResumesBtn');
  
  if (!count || count < 1) {
    alert('Please enter a valid number of resumes to extract');
    return;
  }
  
  statusDiv.style.display = 'block';
  extractBtn.disabled = true;
  messageEl.textContent = `Starting extraction of ${count} resumes...`;
  
  try {
    // Send message to background script for browser-based extraction
    const result = await chrome.runtime.sendMessage({
      type: 'EXTRACT_RESUMES_BROWSER',
      count: parseInt(count)
    });
    
    if (result.success) {
      const errorInfo = result.errors && result.errors.length > 0 
        ? `<br><small>Some errors occurred: ${result.errors.length} failed</small>` 
        : '';
        
      messageEl.innerHTML = `
        <strong style="color: #28a745;">✅ Extraction completed!</strong><br>
        Successfully extracted ${result.processed} out of ${result.total} resumes.${errorInfo}
      `;
      addLog(`📄 Extracted ${result.processed}/${result.total} resumes`, 'success');
      
      // Re-enable button after 5 seconds
      setTimeout(() => {
        extractBtn.disabled = false;
        statusDiv.style.display = 'none';
      }, 5000);
      
    } else {
      throw new Error(result.error || 'Failed to extract resumes');
    }
    
  } catch (error) {
    messageEl.innerHTML = `<strong style="color: #dc3545;">❌ Error:</strong> ${error.message}`;
    addLog(`❌ Resume extraction error: ${error.message}`, 'error');
    extractBtn.disabled = false;
  }
}