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
    MESSAGE_ITEM: '.message, [data-qa="message"], .chat-message'
  };
  
  console.log('HH Chat Extension: Content script loaded');
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received message:', message);
    
    if (message.type === 'GET_CHAT_LIST') {
      getChatList().then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({success: false, error: error.message});
      });
      return true; // Keep message channel open
    }
  });
  
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
            if (chat && chat.name) chats.push(chat);
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
      
      // Extract URL if it's a link
      let chatUrl = '';
      if (element.tagName === 'A') {
        chatUrl = element.href;
      } else {
        const link = element.querySelector('a[href*="chat"]');
        if (link) chatUrl = link.href;
      }
      
      return {
        id: `chat_${index}_${Date.now()}`,
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
  ``` is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }