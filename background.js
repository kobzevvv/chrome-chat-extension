// Cache for chat snapshots per tab
const chatCache = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CHAT_SNAPSHOT') {
    const tabId = sender.tab.id;
    chatCache.set(tabId, message.data);
    
    // Update badge with message count
    const messageCount = message.data.messages.length;
    chrome.action.setBadgeText({
      text: messageCount > 0 ? messageCount.toString() : '',
      tabId: tabId
    });
    chrome.action.setBadgeBackgroundColor({color: '#4CAF50'});
    
    // Forward to server
    forwardToServer(message.data);
    
    sendResponse({success: true});
  } else if (message.type === 'GET_STATE') {
    const cachedData = chatCache.get(message.tabId) || {messages: [], timestamp: Date.now()};
    sendResponse(cachedData);
  } else if (message.type === 'SEND_MESSAGE') {
    // Forward send message request to content script
    chrome.tabs.sendMessage(message.tabId, {
      type: 'INJECT_MESSAGE',
      text: message.text
    }, (response) => {
      sendResponse(response);
    });
    return true; // Keep message channel open for async response
  }
  
  return true;
});

async function forwardToServer(data) {
  try {
    await fetch('http://localhost:4000/inbox', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source: 'hh-chat-extension',
        timestamp: Date.now(),
        data: data
      })
    });
  } catch (error) {
    console.log('Server forwarding failed (expected in dev):', error.message);
  }
}

// Clear cache when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chatCache.delete(tabId);
});