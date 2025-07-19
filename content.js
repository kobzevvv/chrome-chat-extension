// TODO: Update these selectors by inspecting HH.ru chat DOM structure
// Common selectors that might need adjustment:
const SELECTORS = {
    // TODO: Inspect DOM to find actual message container
    ROOT: '[data-qa="chat-messages"], .chat-messages, #chat-messages',
    // TODO: Inspect DOM to find actual message input field
    INPUT: '[data-qa="chat-input"], .chat-input input, textarea[placeholder*="сообщение"]',
    // TODO: Inspect DOM to find actual send button
    SEND: '[data-qa="send-message"], .send-button, button[type="submit"]',
    // TODO: Inspect DOM to find individual message elements
    MESSAGE: '[data-qa="message"], .message-item, .chat-message'
  };
  
  let observer;
  let lastSnapshotHash = '';
  
  function init() {
    console.log('HH Chat Extension: Initializing...');
    
    // Wait for chat to load
    setTimeout(() => {
      setupMutationObserver();
      dumpChat(); // Initial snapshot
    }, 2000);
  }
  
  function setupMutationObserver() {
    const root = document.querySelector(SELECTORS.ROOT);
    if (!root) {
      console.warn('HH Chat Extension: Message root not found. Selectors may need updating.');
      return;
    }
  
    observer = new MutationObserver((mutations) => {
      let hasNewMessages = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          hasNewMessages = true;
        }
      });
      
      if (hasNewMessages) {
        setTimeout(dumpChat, 500); // Debounce
      }
    });
  
    observer.observe(root, {
      childList: true,
      subtree: true
    });
    
    console.log('HH Chat Extension: Mutation observer setup complete');
  }
  
  function dumpChat() {
    const messages = [];
    
    // TODO: Update message selector and data extraction logic based on actual HH.ru DOM
    const messageElements = document.querySelectorAll(SELECTORS.MESSAGE);
    
    messageElements.forEach((element, index) => {
      try {
        // TODO: Adjust these selectors based on actual message structure
        const textElement = element.querySelector('.message-text, .text, p') || element;
        const text = textElement.textContent?.trim() || '';
        
        if (!text) return;
        
        // TODO: Implement proper detection of own messages vs received messages
        // This is a placeholder - inspect DOM to find actual indicators
        const isOwnMessage = element.classList.contains('own-message') || 
                            element.classList.contains('outgoing') ||
                            element.querySelector('.own-message, .outgoing') !== null;
        
        // TODO: Extract actual timestamp if available in DOM
        const timestampElement = element.querySelector('.timestamp, .time, [data-time]');
        const timestamp = timestampElement ? 
          timestampElement.textContent || timestampElement.getAttribute('data-time') :
          Date.now() - (messageElements.length - index) * 1000; // Fallback
        
        messages.push({
          id: `msg_${index}_${Date.now()}`,
          me: isOwnMessage,
          ts: timestamp,
          text: text
        });
      } catch (error) {
        console.warn('Error parsing message element:', error);
      }
    });
  
    const snapshot = {
      messages,
      timestamp: Date.now(),
      url: window.location.href
    };
    
    // Avoid duplicate snapshots
    const currentHash = JSON.stringify(messages);
    if (currentHash === lastSnapshotHash) {
      return;
    }
    lastSnapshotHash = currentHash;
  
    // Send to background script
    chrome.runtime.sendMessage({
      type: 'CHAT_SNAPSHOT',
      data: snapshot
    }).catch(error => {
      console.warn('Failed to send snapshot:', error);
    });
  }
  
  // Listen for message injection requests
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'INJECT_MESSAGE') {
      injectMessage(message.text).then(result => {
        sendResponse(result);
      }).catch(error => {
        sendResponse({success: false, error: error.message});
      });
      return true; // Keep message channel open
    }
  });
  
  async function injectMessage(text) {
    // TODO: Update input selector if needed
    const input = document.querySelector(SELECTORS.INPUT);
    if (!input) {
      throw new Error('Message input not found. Check INPUT selector.');
    }
  
    // Focus the input
    input.focus();
    
    // Clear existing text
    input.value = '';
    
    // Insert new text
    document.execCommand('insertText', false, text);
    
    // Alternative method if execCommand doesn't work
    if (input.value !== text) {
      input.value = text;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      input.dispatchEvent(new Event('change', {bubbles: true}));
    }
    
    // Find and click send button
    // TODO: Update send button selector if needed
    const sendButton = document.querySelector(SELECTORS.SEND);
    if (!sendButton) {
      throw new Error('Send button not found. Check SEND selector.');
    }
    
    // Wait a moment for text to be processed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    sendButton.click();
    
    return {success: true, message: 'Message sent successfully'};
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }