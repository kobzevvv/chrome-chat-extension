// HH.ru Chat Extension Content Script
console.log('🚀 HH Chat Extension: Content script loaded at', new Date().toLocaleTimeString());
console.log('📍 Current URL:', window.location.href);

// Selectors for HH.ru chat interface
const SELECTORS = {
    // Chat list selectors (for main chat page)
    CHAT_LIST: '.chat-list, [data-qa="chat-list"], .conversations, .dialog-list',
    CHAT_ITEM: '.chat-item, [data-qa="chat-item"], .conversation, .dialog-item',
    
    // Individual chat selectors  
    CHAT_NAME: '.chat-name, [data-qa="chat-name"], .contact-name, .dialog-name',
    LAST_MESSAGE: '.last-message, [data-qa="last-message"], .preview',
    MESSAGE_COUNT: '.unread-count, [data-qa="message-count"], .badge',
    
    // Message selectors (for chat detail pages) - Updated based on HH.ru structure
    MESSAGE_CONTAINER: '.messages, [data-qa="messages"], .chat-messages',
    MESSAGE_ITEM: '[data-qa*="chatik-chat-message"], .message--ObAiH0ml6LsDWxjP, .chat-bubble--TFjICp8IMFIhojGy',
    
    // Message input selectors
    MESSAGE_INPUT: 'textarea[data-qa="chatik-new-message-text"], .chat-text-area textarea, .message-input',
    SEND_BUTTON: 'button[data-qa="chatik-do-send-message"], .send-button, button[type="submit"]'
};

// Extract chat ID from current URL
const currentChatId = extractChatIdFromUrl(window.location.href);
console.log('📋 Current chat ID:', currentChatId);

// Announce readiness to background script
if (currentChatId) {
  console.log('📡 Announcing readiness to background script...');
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCRIPT_READY',
    chatId: currentChatId,
    url: window.location.href
  }).then(response => {
    console.log('📨 Background script response:', response);
  }).catch(error => {
    console.log('❌ Failed to contact background script:', error);
  });
} else {
  console.log('⚠️ No chat ID found in URL, not announcing readiness');
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Content script received message at', new Date().toLocaleTimeString(), ':', message);
  
  if (message.type === 'GET_CHAT_LIST') {
    console.log('🔍 Processing GET_CHAT_LIST request...');
    getChatList().then(result => {
      console.log('✅ GET_CHAT_LIST completed:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('❌ GET_CHAT_LIST failed:', error);
      sendResponse({success: false, error: error.message});
    });
    return true;
  }
  
  if (message.type === 'SEND_MESSAGE') {
    console.log('📤 Processing SEND_MESSAGE request...');
    console.log('   Chat ID:', message.chatId);
    console.log('   Message:', message.text);
    
    sendMessage(message.chatId, message.text).then(result => {
      console.log('✅ SEND_MESSAGE completed:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('❌ SEND_MESSAGE failed:', error);
      sendResponse({success: false, error: error.message});
    });
    return true;
  }
  
  if (message.type === 'GET_DEBUG_INFO') {
    console.log('🔍 Processing GET_DEBUG_INFO request...');
    
    const debugInfo = {
      isMonitoring: chatSnapshotInterval !== null,
      currentUrl: window.location.href,
      chatId: extractChatIdFromUrl(window.location.href),
      messageCount: extractMessages().length,
      lastCapture: lastCaptureTime,
      lastMessageCount: lastMessageCount
    };
    
    console.log('📊 Debug info:', debugInfo);
    sendResponse({success: true, debugInfo});
    return true;
  }
  
  if (message.type === 'INSPECT_MESSAGES_DOM') {
    console.log('🔍 Processing INSPECT_MESSAGES_DOM request...');
    
    // Run the inspection function
    const messageCandidates = window.inspectMessages();
    
    // Analyze results to find best selectors
    const potentialSelectors = [
      'div[class*="message"]',
      'div[class*="chat"]', 
      'div[class*="dialog"]',
      'div[class*="bubble"]',
      'div[class*="text"]',
      '[data-qa*="message"]',
      '[data-qa*="chat"]',
      'p', 'span[class*="text"]',
      '.msg', '.message', '.chat-message'
    ];
    
    const bestSelectors = [];
    potentialSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0 && elements.length < 100) {
        // Filter elements that might contain message text
        let textElements = 0;
        elements.forEach(el => {
          const text = el.textContent?.trim();
          if (text && text.length > 10 && text.length < 500) {
            textElements++;
          }
        });
        
        if (textElements > 0) {
          bestSelectors.push({
            selector: selector,
            count: elements.length,
            textElements: textElements
          });
        }
      }
    });
    
    // Sort by relevance (prefer fewer elements with more text)
    bestSelectors.sort((a, b) => {
      const scoreA = a.textElements / a.count;
      const scoreB = b.textElements / b.count;
      return scoreB - scoreA;
    });
    
    const inspection = {
      totalSelectors: potentialSelectors.length,
      messageCandidates: messageCandidates.length,
      bestSelectors: bestSelectors.slice(0, 5) // Top 5 candidates
    };
    
    console.log('📊 DOM Inspection results:', inspection);
    sendResponse({success: true, inspection});
    return true;
  }
  
  if (message.type === 'CAPTURE_RESUME') {
    console.log('📄 Processing CAPTURE_RESUME request...');
    console.log('📄 Options:', message.options);
    
    captureResume(message.options).then(result => {
      console.log('✅ CAPTURE_RESUME completed:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('❌ CAPTURE_RESUME failed:', error);
      sendResponse({success: false, error: error.message});
    });
    return true;
  }
  
  console.log('❓ Unknown message type:', message.type);
  sendResponse({success: false, error: 'Unknown message type'});
});

// Function to extract chat ID from URL
function extractChatIdFromUrl(url) {
  if (!url) return null;
  
  // Match patterns like /chat/123456789 or /chat/123456789/
  const match = url.match(/\/chat\/(\d+)/);
  return match ? match[1] : null;
}

// Function to send message to specific chat
async function sendMessage(chatId, messageText) {
  try {
    console.log(`🚀 Starting message send process:`);
    console.log(`   Chat ID: ${chatId}`);
    console.log(`   Message: "${messageText}"`);
    console.log(`   Current URL: ${window.location.href}`);
    
    // Check if we're already on the correct chat page
    const currentChatId = extractChatIdFromUrl(window.location.href);
    console.log(`   Current chat ID from URL: ${currentChatId}`);
    
    if (currentChatId !== chatId) {
      const errorMsg = `❌ Wrong chat page. Need: ${chatId}, Current: ${currentChatId || 'none'}`;
      console.log(errorMsg);
      return {
        success: false,
        error: `Please navigate to chat ${chatId} first. Current chat: ${currentChatId || 'none'}`
      };
    }
    
    console.log(`✅ On correct chat page (${chatId})`);
    
    // Find message input
    console.log(`🔍 Looking for message input...`);
    const inputSelectors = SELECTORS.MESSAGE_INPUT.split(', ');
    let messageInput = null;
    
    for (let i = 0; i < inputSelectors.length; i++) {
      const selector = inputSelectors[i];
      console.log(`   Trying selector ${i + 1}/${inputSelectors.length}: "${selector}"`);
      messageInput = document.querySelector(selector);
      if (messageInput) {
        console.log(`   ✅ Found message input with selector: "${selector}"`);
        console.log(`   Input element:`, messageInput);
        break;
      } else {
        console.log(`   ❌ No match for: "${selector}"`);
      }
    }
    
    if (!messageInput) {
      const errorMsg = `❌ Message input field not found. Tried selectors: ${inputSelectors.join(', ')}`;
      console.log(errorMsg);
      
      // Debug: show all textarea elements
      const allTextareas = document.querySelectorAll('textarea');
      console.log(`Debug: Found ${allTextareas.length} textarea elements:`, allTextareas);
      
      return {
        success: false,
        error: 'Message input field not found'
      };
    }
    
    console.log(`📝 Setting message text...`);
    console.log(`   Before: value="${messageInput.value}", textContent="${messageInput.textContent}"`);
    
    // Set the message text
    messageInput.value = messageText;
    messageInput.textContent = messageText;
    
    console.log(`   After: value="${messageInput.value}", textContent="${messageInput.textContent}"`);
    
    // Trigger input events to make sure the UI updates
    console.log(`🔄 Triggering input events...`);
    const inputEvent = new Event('input', { bubbles: true });
    const changeEvent = new Event('change', { bubbles: true });
    const keyupEvent = new Event('keyup', { bubbles: true });
    
    messageInput.dispatchEvent(inputEvent);
    messageInput.dispatchEvent(changeEvent);
    messageInput.dispatchEvent(keyupEvent);
    
    // Focus the input
    messageInput.focus();
    
    // Wait a bit for UI to update
    console.log(`⏱️ Waiting for UI update...`);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Find and click send button
    console.log(`🔍 Looking for send button...`);
    const sendSelectors = SELECTORS.SEND_BUTTON.split(', ');
    let sendButton = null;
    
    for (let i = 0; i < sendSelectors.length; i++) {
      const selector = sendSelectors[i];
      console.log(`   Trying selector ${i + 1}/${sendSelectors.length}: "${selector}"`);
      sendButton = document.querySelector(selector);
      if (sendButton) {
        console.log(`   ✅ Found send button with selector: "${selector}"`);
        console.log(`   Button element:`, sendButton);
        console.log(`   Button disabled: ${sendButton.disabled}`);
        console.log(`   Button visible: ${sendButton.offsetParent !== null}`);
        break;
      } else {
        console.log(`   ❌ No match for: "${selector}"`);
      }
    }
    
    if (!sendButton) {
      const errorMsg = `❌ Send button not found. Tried selectors: ${sendSelectors.join(', ')}`;
      console.log(errorMsg);
      
      // Debug: show all buttons
      const allButtons = document.querySelectorAll('button');
      console.log(`Debug: Found ${allButtons.length} button elements:`, allButtons);
      allButtons.forEach((btn, index) => {
        console.log(`  Button ${index}:`, btn.outerHTML.substring(0, 200));
      });
      
      return {
        success: false,
        error: 'Send button not found'
      };
    }
    
    if (sendButton.disabled) {
      const errorMsg = `❌ Send button is disabled`;
      console.log(errorMsg);
      return {
        success: false,
        error: 'Send button is disabled (maybe message is empty?)'
      };
    }
    
    // Click the send button
    console.log(`🖱️ Clicking send button...`);
    sendButton.click();
    
    // Wait a moment to see if message was sent
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check if input was cleared (usually indicates successful send)
    const inputCleared = !messageInput.value || messageInput.value.trim() === '';
    console.log(`📋 Input cleared after send: ${inputCleared}`);
    
    const successMsg = `✅ Message send process completed for chat ${chatId}`;
    console.log(successMsg);
    
    return {
      success: true,
      message: `Message sent to chat ${chatId}`,
      inputCleared: inputCleared
    };
    
  } catch (error) {
    const errorMsg = `❌ Error in sendMessage: ${error.message}`;
    console.error(errorMsg, error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function getChatList() {
  try {
    console.log('Scanning for chats on:', window.location.href);
    
    const chats = [];
    const url = window.location.href;
    
    // Method 1: Look for chat list elements
    const chatListSelectors = SELECTORS.CHAT_LIST.split(', ');
    let chatListContainer = null;
    
    for (const selector of chatListSelectors) {
      chatListContainer = document.querySelector(selector);
      if (chatListContainer) {
        console.log('Found chat list container with selector:', selector);
        break;
      }
    }
    
    if (chatListContainer) {
      // Found a chat list container, extract individual chats
      const chatItemSelectors = SELECTORS.CHAT_ITEM.split(', ');
      let chatItems = [];
      
      for (const selector of chatItemSelectors) {
        chatItems = chatListContainer.querySelectorAll(selector);
        if (chatItems.length > 0) {
          console.log(`Found ${chatItems.length} chat items with selector:`, selector);
          break;
        }
      }
      
      chatItems.forEach((item, index) => {
        const chat = extractChatInfo(item, index);
        if (chat) chats.push(chat);
      });
    }
    
    // Method 2: Look for any elements that might be chats (fallback)
    if (chats.length === 0) {
      console.log('No chat list found, trying generic approach...');
      
      // Look for common patterns
      const possibleChats = document.querySelectorAll('a[href*="chat"], div[class*="chat"], div[class*="dialog"]');
      console.log('Found possible chat elements:', possibleChats.length);
      
      possibleChats.forEach((item, index) => {
        if (index < 20) { // Limit to avoid too many false positives
          const chat = extractChatInfo(item, index, true);
          if (chat && chat.name && chat.chatId) chats.push(chat);
        }
      });
    }
    
    // Method 3: If we're on a specific chat page, extract current chat info
    if (chats.length === 0 && url.includes('/chat/')) {
      console.log('Looks like individual chat page, extracting current chat...');
      
      const currentChat = extractCurrentChatInfo();
      if (currentChat) chats.push(currentChat);
    }
    
    console.log('Final chat list:', chats);
    
    return {
      success: true,
      chats: chats,
      url: url,
      timestamp: Date.now()
    };
    
  } catch (error) {
    console.error('Error getting chat list:', error);
    throw error;
  }
}

function extractChatInfo(element, index, isGeneric = false) {
  try {
    // Try to extract chat name
    let name = '';
    const nameSelectors = SELECTORS.CHAT_NAME.split(', ');
    
    for (const selector of nameSelectors) {
      const nameEl = element.querySelector(selector);
      if (nameEl) {
        name = nameEl.textContent?.trim();
        break;
      }
    }
    
    // Fallback name extraction
    if (!name && !isGeneric) {
      name = element.textContent?.trim().split('\n')[0]?.substring(0, 50) || `Chat #${index + 1}`;
    } else if (!name && isGeneric) {
      // For generic elements, be more selective
      const text = element.textContent?.trim();
      if (text && text.length > 3 && text.length < 100 && !text.includes('http')) {
        name = text.split('\n')[0]?.substring(0, 50);
      }
    }
    
    if (!name) return null;
    
    // Extract URL if it's a link
    let chatUrl = '';
    if (element.tagName === 'A') {
      chatUrl = element.href;
    } else {
      const link = element.querySelector('a[href*="chat"]');
      if (link) chatUrl = link.href;
    }
    
    // Extract chat ID from URL
    const chatId = extractChatIdFromUrl(chatUrl);
    if (!chatId && isGeneric) return null; // Skip items without chat ID in generic mode
    
    // Try to extract last message
    let lastMessage = '';
    const messageSelectors = SELECTORS.LAST_MESSAGE.split(', ');
    
    for (const selector of messageSelectors) {
      const msgEl = element.querySelector(selector);
      if (msgEl) {
        lastMessage = msgEl.textContent?.trim().substring(0, 100);
        break;
      }
    }
    
    // Try to extract message count
    let messageCount = 0;
    const countSelectors = SELECTORS.MESSAGE_COUNT.split(', ');
    
    for (const selector of countSelectors) {
      const countEl = element.querySelector(selector);
      if (countEl) {
        const countText = countEl.textContent?.trim();
        const count = parseInt(countText);
        if (!isNaN(count)) {
          messageCount = count;
          break;
        }
      }
    }
    
    return {
      id: `chat_${index}_${Date.now()}`,
      chatId: chatId || `unknown_${index}`,
      name: name,
      lastMessage: lastMessage || 'No preview available',
      messageCount: messageCount,
      isActive: messageCount > 0 || chatUrl.includes(window.location.pathname),
      url: chatUrl || window.location.href
    };
    
  } catch (error) {
    console.error('Error extracting chat info:', error);
    return null;
  }
}

function extractCurrentChatInfo() {
  try {
    // Extract chat ID from current URL
    const chatId = extractChatIdFromUrl(window.location.href);
    
    // Try to get chat title from page title or header
    let name = document.title;
    
    // Look for chat header elements
    const headerSelectors = ['h1', '.chat-header', '[data-qa="chat-title"]', '.page-title'];
    for (const selector of headerSelectors) {
      const headerEl = document.querySelector(selector);
      if (headerEl && headerEl.textContent.trim()) {
        name = headerEl.textContent.trim();
        break;
      }
    }
    
    // Count messages on current page
    const messageSelectors = SELECTORS.MESSAGE_ITEM.split(', ');
    let messageCount = 0;
    
    for (const selector of messageSelectors) {
      const messages = document.querySelectorAll(selector);
      if (messages.length > 0) {
        messageCount = messages.length;
        break;
      }
    }
    
    // Get last message
    let lastMessage = 'Active chat';
    if (messageCount > 0) {
      // Try to get the last message text
      const messageElements = document.querySelectorAll(messageSelectors[0]);
      const lastMsg = messageElements[messageElements.length - 1];
      if (lastMsg) {
        lastMessage = lastMsg.textContent?.trim().substring(0, 100) || 'Recent message';
      }
    }
    
    return {
      id: `current_chat_${Date.now()}`,
      chatId: chatId || 'unknown',
      name: name.replace(' - hh.ru', '').substring(0, 50),
      lastMessage: lastMessage,
      messageCount: messageCount,
      isActive: true,
      url: window.location.href
    };
    
  } catch (error) {
    console.error('Error extracting current chat info:', error);
    return null;
  }
}

// Capture and send chat messages periodically
let lastMessageCount = 0;
let chatSnapshotInterval = null;
let lastCaptureTime = null;
const API_ENDPOINT = 'http://localhost:4000/inbox';

function startChatMonitoring() {
  if (chatSnapshotInterval) {
    clearInterval(chatSnapshotInterval);
  }
  
  console.log('📊 Starting chat monitoring...');
  console.log('📍 Current URL:', window.location.href);
  console.log('📍 Chat ID from URL:', extractChatIdFromUrl(window.location.href));
  
  // Check for new messages every 5 seconds
  chatSnapshotInterval = setInterval(async () => {
    try {
      await captureAndSendChatSnapshot();
    } catch (error) {
      console.error('❌ Error in chat monitoring:', error);
    }
  }, 5000);
}

async function captureAndSendChatSnapshot() {
  try {
    const currentChatId = extractChatIdFromUrl(window.location.href);
    console.log('🔍 [DEBUG] Chat ID check:', currentChatId);
    
    if (!currentChatId) {
      console.log('🔍 [DEBUG] No chat ID found, skipping...');
      return; // Not on a chat page
    }
    
    // Extract chat messages
    const messages = extractMessages();
    console.log('🔍 [DEBUG] Extracted messages:', messages.length);
    console.log('🔍 [DEBUG] Previous message count:', lastMessageCount);
    
    // Only send if we have messages and the count has changed
    if (messages.length === 0) {
      console.log('🔍 [DEBUG] No messages found, skipping...');
      return;
    }
    
    if (messages.length === lastMessageCount) {
      console.log('🔍 [DEBUG] Message count unchanged, skipping...');
      return;
    }
    
    lastMessageCount = messages.length;
    
    // Extract chat name
    const chatName = extractChatName();
    
    // Prepare snapshot data
    const snapshot = {
      source: 'chrome-extension',
      timestamp: Date.now(),
      data: {
        url: window.location.href,
        chatName: chatName,
        messages: messages
      }
    };
    
    console.log(`📤 Sending chat snapshot: ${messages.length} messages`);
    
    // Send to API
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(snapshot)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Chat snapshot sent successfully:', result);
      lastCaptureTime = Date.now();
    } else {
      console.error('❌ Failed to send chat snapshot:', response.status, response.statusText);
    }
    
  } catch (error) {
    console.error('❌ Error capturing chat snapshot:', error);
  }
}

function extractMessages() {
  const messages = [];
  const messageSelectors = SELECTORS.MESSAGE_ITEM.split(', ');
  
  console.log('🔍 [DEBUG] Looking for messages with selectors:', messageSelectors);
  
  for (let i = 0; i < messageSelectors.length; i++) {
    const selector = messageSelectors[i];
    console.log(`🔍 [DEBUG] Trying selector ${i + 1}/${messageSelectors.length}: "${selector}"`);
    
    const messageElements = document.querySelectorAll(selector);
    console.log(`🔍 [DEBUG] Found ${messageElements.length} elements for selector: "${selector}"`);
    
    if (messageElements.length > 0) {
      messageElements.forEach((msgEl, index) => {
        const messageData = extractMessageData(msgEl, index);
        if (messageData) {
          messages.push(messageData);
        }
      });
      console.log(`🔍 [DEBUG] Extracted ${messages.length} valid messages from ${messageElements.length} elements`);
      break; // Found messages, stop trying other selectors
    }
  }
  
  // If no messages found with predefined selectors, try generic approach
  if (messages.length === 0) {
    console.log('🔍 [DEBUG] No messages found with predefined selectors, trying generic approach...');
    
    // Look for common message patterns
    const genericSelectors = [
      'div[class*="message"]',
      'div[class*="chat"]',
      '[data-qa*="message"]',
      '.bubble',
      '.msg'
    ];
    
    for (const selector of genericSelectors) {
      const elements = document.querySelectorAll(selector);
      console.log(`🔍 [DEBUG] Generic selector "${selector}" found ${elements.length} elements`);
      
      if (elements.length > 0) {
        // Show first few elements for debugging
        elements.forEach((el, idx) => {
          if (idx < 3) {
            console.log(`🔍 [DEBUG] Element ${idx}:`, el.outerHTML.substring(0, 200));
          }
        });
        break;
      }
    }
  }
  
  return messages;
}

function extractMessageData(messageElement, index) {
  try {
    // Extract message text using HH.ru specific selectors
    let textElement = messageElement.querySelector('[data-qa="chat-bubble-text"], .chat-bubble-text--XJMldv8jNgMtyLaI, .markdown--po02tUmuyrM7KPYt p');
    
    // Fallback to generic selectors
    if (!textElement) {
      textElement = messageElement.querySelector('.message-text, .chat-message-text, [data-qa*="text"]');
    }
    
    // Last resort - use the element itself
    if (!textElement) {
      textElement = messageElement;
    }
    
    let text = textElement.textContent?.trim() || '';
    
    // Clean up text - remove extra whitespace and newlines
    text = text.replace(/\s+/g, ' ').trim();
    
    if (!text || text.length < 2) return null;
    
    // Skip if it's just timestamp or metadata
    if (/^\d{2}:\d{2}$/.test(text) || text.includes('data-qa') || text.includes('class=')) {
      return null;
    }
    
    // Try to determine if message is from me (outgoing vs incoming)
    const isFromMe = messageElement.classList.contains('outgoing') || 
                    messageElement.classList.contains('chat-bubble_outgoing') ||
                    !messageElement.classList.contains('chat-bubble_incoming') ||
                    messageElement.querySelector('.chat-bubble_outgoing') !== null;
    
    // Try to extract timestamp from HH.ru structure
    let timestamp = Date.now(); // Default to now
    const timeElement = messageElement.querySelector('.message-time, .timestamp, time') || 
                       messageElement.textContent.match(/(\d{2}:\d{2})/);
    
    if (timeElement) {
      let timeText = '';
      if (typeof timeElement === 'string') {
        timeText = timeElement;
      } else if (timeElement.length && timeElement[1]) {
        timeText = timeElement[1];
      } else {
        timeText = timeElement.textContent?.trim();
      }
      
      if (timeText) {
        const timeMatch = timeText.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
          const now = new Date();
          const messageTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 
                                     parseInt(timeMatch[1]), parseInt(timeMatch[2]));
          timestamp = messageTime.getTime();
        }
      }
    }
    
    console.log(`🔍 [DEBUG] Extracted message: "${text.substring(0, 50)}..." (isFromMe: ${isFromMe})`);
    
    return {
      text: text,
      me: isFromMe,
      ts: timestamp,
      index: index
    };
  } catch (error) {
    console.error('Error extracting message data:', error);
    return null;
  }
}

function extractChatName() {
  // Try to get chat name from page title or header
  let name = document.title.replace(' - hh.ru', '').trim();
  
  // Look for chat header elements
  const headerSelectors = ['h1', '.chat-header', '[data-qa="chat-title"]', '.page-title', '.chat-name'];
  for (const selector of headerSelectors) {
    const headerEl = document.querySelector(selector);
    if (headerEl && headerEl.textContent.trim()) {
      name = headerEl.textContent.trim();
      break;
    }
  }
  
  return name;
}

// Start monitoring when on chat page
if (currentChatId) {
  startChatMonitoring();
}

// Stop monitoring when leaving page
window.addEventListener('beforeunload', () => {
  if (chatSnapshotInterval) {
    clearInterval(chatSnapshotInterval);
  }
});

// ==================== RESUME CAPTURE FUNCTIONS ====================

/**
 * Main resume capture function
 * @param {Object} options - Capture options
 * @param {boolean} options.revealContacts - Whether to attempt revealing contacts
 * @returns {Object} - Result object with success status
 */
async function captureResume(options = {}) {
  console.log('📄 Starting resume capture process...');
  console.log('📄 Current URL:', window.location.href);
  console.log('📄 Options:', options);
  
  try {
    // Check if we're on a resume page
    if (!isResumePage()) {
      throw new Error('Not on a resume page. Expected URL pattern: /resume/[id]');
    }
    
    // Get print version if possible
    const html = await getResumeHTML(options.revealContacts);
    
    if (!html) {
      throw new Error('Could not capture resume HTML');
    }
    
    // NOTE: Resume parsing API removed - now using resume_html_content table
    // HTML capture still works for manual testing
    
    console.log('✅ Resume HTML captured successfully');
    return {
      success: true,
      html: html,
      sourceUrl: window.location.href,
      htmlLength: html.length,
      captured_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('❌ Resume capture failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if current page is a resume page
 */
function isResumePage() {
  const url = window.location.href;
  return /\/resume\/[a-f0-9]+/.test(url);
}

/**
 * Get resume HTML, preferring print version
 */
async function getResumeHTML(revealContacts = false) {
  console.log('📄 Attempting to get resume HTML...');
  
  // First, try to reveal contacts if requested
  if (revealContacts) {
    await attemptRevealContacts();
  }
  
  // Try to get print version
  let printHTML = await attemptGetPrintVersion();
  
  if (printHTML) {
    console.log('✅ Successfully captured print version');
    return printHTML;
  }
  
  // Fallback to current page HTML
  console.log('⚠️ Print version not available, using current page');
  return document.documentElement.outerHTML;
}

/**
 * Attempt to reveal hidden contacts
 */
async function attemptRevealContacts() {
  console.log('📄 Attempting to reveal contacts...');
  
  try {
    // Look for "Показать все контакты" button
    const revealSelectors = [
      'button:contains("Показать все контакты")',
      'a:contains("Показать все контакты")',
      '[data-qa*="contact"] button',
      '.bloko-link:contains("Показать")'
    ];
    
    let revealButton = null;
    
    for (const selector of revealSelectors) {
      // Custom contains selector implementation
      const elements = Array.from(document.querySelectorAll('button, a, .bloko-link'));
      revealButton = elements.find(el => 
        el.textContent && el.textContent.includes('Показать все контакты')
      );
      
      if (revealButton) {
        console.log('📄 Found reveal contacts button');
        break;
      }
    }
    
    if (revealButton) {
      console.log('📄 Clicking reveal contacts button...');
      revealButton.click();
      
      // Wait for potential DOM updates
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('✅ Contacts reveal attempted');
      return true;
    } else {
      console.log('ℹ️ No reveal contacts button found');
      return false;
    }
    
  } catch (error) {
    console.warn('⚠️ Error attempting to reveal contacts:', error);
    return false;
  }
}

/**
 * Attempt to get print version of resume
 */
async function attemptGetPrintVersion() {
  console.log('📄 Attempting to get print version...');
  
  try {
    // Method 1: Look for print button and try to open print version
    const printButton = document.querySelector([
      '[data-qa="resume-print-button"]',
      '.print-button',
      'button:contains("Печать")',
      'a:contains("Печать")'
    ].join(', '));
    
    if (printButton) {
      console.log('📄 Found print button, trying to get print URL...');
      
      // Try to extract print URL from button
      const printUrl = extractPrintUrl(printButton);
      
      if (printUrl) {
        console.log('📄 Fetching print version from:', printUrl);
        return await fetchPrintVersion(printUrl);
      }
    }
    
    // Method 2: Try common print URL patterns
    const currentUrl = window.location.href;
    const printUrls = [
      currentUrl + '?print=true',
      currentUrl + '/print',
      currentUrl.replace('/resume/', '/resume/print/')
    ];
    
    for (const printUrl of printUrls) {
      console.log('📄 Trying print URL:', printUrl);
      try {
        const html = await fetchPrintVersion(printUrl);
        if (html && html.length > 1000) { // Basic validation
          return html;
        }
      } catch (error) {
        console.log('📄 Print URL failed:', printUrl, error.message);
      }
    }
    
    return null;
    
  } catch (error) {
    console.warn('⚠️ Error getting print version:', error);
    return null;
  }
}

/**
 * Extract print URL from print button
 */
function extractPrintUrl(printButton) {
  if (printButton.href) {
    return printButton.href;
  }
  
  // Look for data attributes or onclick handlers
  const onclick = printButton.getAttribute('onclick');
  if (onclick) {
    const urlMatch = onclick.match(/['"](\/[^'"]+print[^'"]*)['"]/);
    if (urlMatch) {
      return new URL(urlMatch[1], window.location.origin).href;
    }
  }
  
  return null;
}

/**
 * Fetch print version from URL
 */
async function fetchPrintVersion(printUrl) {
  try {
    const response = await fetch(printUrl, {
      credentials: 'same-origin',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    console.log('📄 Print version fetched, size:', html.length);
    
    return html;
    
  } catch (error) {
    console.warn('⚠️ Failed to fetch print version:', error);
    throw error;
  }
}

// Resume parsing API removed - now using resume_html_content table directly
// The sendResumeToAPI function is deprecated

// Resume capture test function
window.testResumeCapture = function(options = {}) {
  console.log('🧪 [RESUME-TEST] Starting manual resume capture test...');
  console.log('🧪 [RESUME-TEST] Current URL:', window.location.href);
  console.log('🧪 [RESUME-TEST] Options:', options);
  
  if (!isResumePage()) {
    console.error('🧪 [RESUME-TEST] Not on a resume page!');
    return;
  }
  
  captureResume(options).then(result => {
    console.log('🧪 [RESUME-TEST] Capture completed:', result);
  }).catch(error => {
    console.error('🧪 [RESUME-TEST] Capture failed:', error);
  });
};

// DOM inspection function to help debug message selectors
window.inspectMessages = function() {
  console.log('🔍 [INSPECT] Analyzing page DOM for message elements...');
  console.log('🔍 [INSPECT] Current URL:', window.location.href);
  
  // Show all elements that might contain messages
  const potentialSelectors = [
    'div[class*="message"]',
    'div[class*="chat"]', 
    'div[class*="dialog"]',
    'div[class*="bubble"]',
    'div[class*="text"]',
    '[data-qa*="message"]',
    '[data-qa*="chat"]',
    'p', 'span[class*="text"]',
    '.msg', '.message', '.chat-message'
  ];
  
  console.log('🔍 [INSPECT] Testing selectors:');
  potentialSelectors.forEach((selector, index) => {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      console.log(`  ${index + 1}. "${selector}" → ${elements.length} elements`);
      
      // Show first few elements
      for (let i = 0; i < Math.min(3, elements.length); i++) {
        const el = elements[i];
        const text = el.textContent?.trim();
        if (text && text.length > 10 && text.length < 200) {
          console.log(`     Sample ${i + 1}: "${text.substring(0, 100)}..."`);
          console.log(`     Classes: ${el.className}`);
          console.log(`     HTML: ${el.outerHTML.substring(0, 150)}...`);
        }
      }
    }
  });
  
  // Look for any text content that looks like messages
  console.log('\n🔍 [INSPECT] Looking for potential message text patterns...');
  const allDivs = document.querySelectorAll('div');
  let messageCandiates = [];
  
  allDivs.forEach((div, index) => {
    const text = div.textContent?.trim();
    if (text && text.length > 5 && text.length < 500) {
      // Skip if it contains child divs (likely container)
      const childDivs = div.querySelectorAll('div');
      if (childDivs.length === 0) {
        messageCandiates.push({
          element: div,
          text: text,
          classes: div.className,
          id: div.id
        });
      }
    }
  });
  
  console.log(`🔍 [INSPECT] Found ${messageCandiates.length} potential message elements:`);
  messageCandiates.slice(0, 10).forEach((candidate, index) => {
    console.log(`  ${index + 1}. "${candidate.text.substring(0, 80)}..."`);
    console.log(`     Classes: "${candidate.classes}"`);
    console.log(`     ID: "${candidate.id}"`);
  });
  
  return messageCandiates;
};

// Test function you can run in browser console
window.testChatCapture = function() {
  console.log('🧪 [TEST] Starting manual chat capture test...');
  console.log('🧪 [TEST] Current URL:', window.location.href);
  console.log('🧪 [TEST] Chat ID:', extractChatIdFromUrl(window.location.href));
  
  const messages = extractMessages();
  console.log('🧪 [TEST] Extracted messages:', messages);
  
  if (messages.length > 0) {
    const testSnapshot = {
      source: 'manual-test',
      timestamp: Date.now(),
      data: {
        url: window.location.href,
        chatName: extractChatName(),
        messages: messages
      }
    };
    
    console.log('🧪 [TEST] Test snapshot:', testSnapshot);
    
    fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testSnapshot)
    }).then(response => {
      console.log('🧪 [TEST] API Response status:', response.status);
      return response.json();
    }).then(result => {
      console.log('🧪 [TEST] API Response:', result);
    }).catch(error => {
      console.error('🧪 [TEST] API Error:', error);
    });
  } else {
    console.log('🧪 [TEST] No messages found to test with');
    console.log('🧪 [TEST] Running DOM inspection...');
    window.inspectMessages();
  }
};

// Quick test function for HH.ru selectors
window.testHHSelectors = function() {
  console.log('🧪 [HH-TEST] Testing HH.ru specific selectors...');
  
  // Test the selectors we found from your console output
  const selectors = [
    '[data-qa*="chatik-chat-message"]',
    '.message--ObAiH0ml6LsDWxjP', 
    '.chat-bubble--TFjICp8IMFIhojGy',
    '[data-qa="chat-bubble-text"]',
    '.chat-bubble-text--XJMldv8jNgMtyLaI',
    '.markdown--po02tUmuyrM7KPYt p'
  ];
  
  selectors.forEach(selector => {
    const elements = document.querySelectorAll(selector);
    console.log(`🔍 "${selector}" → ${elements.length} elements`);
    
    if (elements.length > 0 && elements.length < 20) {
      elements.forEach((el, idx) => {
        const text = el.textContent?.trim();
        if (text && text.length > 5 && text.length < 200) {
          console.log(`  ${idx + 1}. "${text.substring(0, 80)}..."`);
        }
      });
    }
  });
  
  // Test the main extraction function
  console.log('\n🧪 [HH-TEST] Testing message extraction...');
  const messages = extractMessages();
  console.log(`📬 Found ${messages.length} messages:`, messages);
};

// Initialize
console.log('HH Chat Extension: Content script initialized and ready');
console.log('💡 [TIP] Available console functions:');
console.log('  - window.testChatCapture() - Test message capture');
console.log('  - window.inspectMessages() - Inspect DOM for message elements');
console.log('  - window.testHHSelectors() - Test HH.ru specific selectors');