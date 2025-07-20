// Simple selectors - these will need to be updated based on actual HH.ru DOM
// TODO: Inspect HH.ru pages to find correct selectors
const SELECTORS = {
    // Chat list selectors (for main chat page)
    CHAT_LIST: '.chat-list, [data-qa="chat-list"], .conversations, .dialog-list',
    CHAT_ITEM: '.chat-item, [data-qa="chat-item"], .conversation, .dialog-item',
    
    // Individual chat selectors  
    CHAT_NAME: '.chat-name, [data-qa="chat-name"], .contact-name, .dialog-name',
    LAST_MESSAGE: '.last-message, [data-qa="last-message"], .preview',
    MESSAGE_COUNT: '.unread-count, [data-qa="message-count"], .badge',
    
    // Message selectors (for chat detail pages)
    MESSAGE_CONTAINER: '.messages, [data-qa="messages"], .chat-messages',
    MESSAGE_ITEM: '.message, [data-qa="message"], .chat-message',
    
    // Message input selectors
    MESSAGE_INPUT: 'textarea[data-qa="chatik-new-message-text"], .chat-text-area textarea, .message-input',
    SEND_BUTTON: 'button[data-qa="chatik-do-send-message"], .send-button, button[type="submit"]'
};

console.log('🚀 HH Chat Extension: Content script loaded at', new Date().toLocaleTimeString());
console.log('📍 Current URL:', window.location.href);
console.log('📋 User agent:', navigator.userAgent.substring(0, 100));

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

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Content script received message:', message);
  console.log('🕐 At time:', new Date().toLocaleTimeString());
  
  if (message.type === 'GET_CHAT_LIST') {
    console.log('🔍 Processing GET_CHAT_LIST request...');
    getChatList().then(result => {
      console.log('✅ GET_CHAT_LIST completed:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('❌ GET_CHAT_LIST failed:', error);
      sendResponse({success: false, error: error.message});
    });
    return true; // Keep message channel open
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
    
    // Method 4: Debug - show all elements for analysis
    if (chats.length === 0) {
      console.log('No chats found, showing debug info...');
      
      // Get some DOM structure info for debugging
      const bodyClasses = document.body.className;
      const mainContent = document.querySelector('main, #main, .main-content, .content');
      const allLinks = document.querySelectorAll('a[href*="hh.ru"]').length;
      
      chats.push({
        id: 'debug',
        chatId: 'debug',
        name: `Debug Info - ${document.title}`,
        lastMessage: `Body classes: ${bodyClasses.substring(0, 100)}`,
        messageCount: allLinks,
        isActive: true,
        url: url
      });
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

// Initialize
console.log('HH Chat Extension: Content script initialized');
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log('HH Chat Extension: Content script ready');
}