// Background service worker - the "supervisor"
console.log('🚀 HH Chat Extension: Background service worker loaded at', new Date().toLocaleTimeString());

// Queue of pending messages to send
let messageQueue = [];
let isProcessing = false;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Background received message at', new Date().toLocaleTimeString(), ':', message);
  
  if (message.type === 'PING') {
    console.log('🏓 Ping received, sending pong');
    sendResponse({ success: true, message: 'Pong from background service', timestamp: Date.now() });
    return true;
  }
  
  if (message.type === 'SEND_MESSAGE_BACKGROUND') {
    console.log('📤 Processing send message request...');
    handleMessageSendRequest(message);
    sendResponse({ success: true, message: 'Message queued for sending' });
    return true;
  }
  
  if (message.type === 'CONTENT_SCRIPT_READY') {
    console.log('📋 Content script ready notification received');
    // Content script is ready and asking if it should send a message
    handleContentScriptReady(sender.tab.id, message.chatId);
    sendResponse({ success: true });
    return true;
  }
  
  console.log('❓ Unknown message type:', message.type);
  sendResponse({ success: false, error: 'Unknown message type' });
  return true;
});

async function handleMessageSendRequest(request) {
  console.log('📤 Handling message send request:', request);
  
  const { chatId, messageText, mode } = request;
  
  // Add to queue
  messageQueue.push({
    chatId,
    messageText,
    mode,
    timestamp: Date.now(),
    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  });
  
  console.log('📋 Message added to queue. Queue length:', messageQueue.length);
  
  // Process queue if not already processing
  if (!isProcessing) {
    await processMessageQueue();
  }
}

async function processMessageQueue() {
  if (messageQueue.length === 0 || isProcessing) {
    return;
  }
  
  isProcessing = true;
  console.log('🔄 Starting message queue processing...');
  
  while (messageQueue.length > 0) {
    const messageTask = messageQueue.shift();
    console.log('📤 Processing message:', messageTask);
    
    try {
      if (messageTask.mode === 'background') {
        await sendMessageInBackground(messageTask);
      } else {
        await sendMessageInCurrentTab(messageTask);
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
    }
    
    // Wait between messages to avoid overwhelming
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  isProcessing = false;
  console.log('✅ Message queue processing completed');
}

async function sendMessageInBackground(messageTask) {
  console.log('📍 Sending message in background tab...');
  
  const { chatId, messageText } = messageTask;
  const chatUrl = `https://ufa.hh.ru/chat/${chatId}`;
  
  try {
    // Create background tab
    const tab = await chrome.tabs.create({
      url: chatUrl,
      active: false
    });
    
    console.log(`📍 Background tab created: ${tab.id} for chat ${chatId}`);
    
    // Store the message task for this tab
    await chrome.storage.local.set({
      [`pending_${tab.id}`]: {
        chatId,
        messageText,
        tabId: tab.id,
        created: Date.now()
      }
    });
    
    // Wait for page to load and content script to be ready
    await waitForTabToLoad(tab.id);
    
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    
    console.log(`✅ Content script injected in background tab ${tab.id}`);
    
    // The content script will check for pending messages and send them
    
  } catch (error) {
    console.error('❌ Error in background send:', error);
  }
}

async function sendMessageInCurrentTab(messageTask) {
  console.log('📍 Sending message in current tab...');
  
  const { chatId, messageText } = messageTask;
  const chatUrl = `https://ufa.hh.ru/chat/${chatId}`;
  
  try {
    // Get current active tab
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!currentTab) {
      throw new Error('No active tab found');
    }
    
    console.log(`📍 Navigating current tab ${currentTab.id} to chat ${chatId}`);
    
    // Store the message task for this tab
    await chrome.storage.local.set({
      [`pending_${currentTab.id}`]: {
        chatId,
        messageText,
        tabId: currentTab.id,
        created: Date.now()
      }
    });
    
    // Navigate current tab
    await chrome.tabs.update(currentTab.id, { url: chatUrl });
    
    // Wait for navigation
    await waitForTabToLoad(currentTab.id);
    
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['content.js']
    });
    
    console.log(`✅ Content script injected in current tab ${currentTab.id}`);
    
  } catch (error) {
    console.error('❌ Error in current tab send:', error);
  }
}

function waitForTabToLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        console.log(`✅ Tab ${tabId} finished loading`);
        resolve();
      }
    };
    
    chrome.tabs.onUpdated.addListener(listener);
    
    // Fallback timeout
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      console.log(`⏱️ Tab ${tabId} load timeout, proceeding anyway`);
      resolve();
    }, 10000);
  });
}

async function handleContentScriptReady(tabId, chatId) {
  console.log(`📋 Content script ready in tab ${tabId}, chat ${chatId}`);
  
  // Check if there's a pending message for this tab
  const result = await chrome.storage.local.get(`pending_${tabId}`);
  const pendingMessage = result[`pending_${tabId}`];
  
  if (pendingMessage) {
    console.log('📤 Found pending message for tab:', pendingMessage);
    
    // Send the message
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'SEND_MESSAGE',
        chatId: pendingMessage.chatId,
        text: pendingMessage.messageText
      });
      
      console.log('📨 Message send response:', response);
      
      if (response && response.success) {
        console.log('✅ Message sent successfully in tab', tabId);
        
        // Clean up
        await chrome.storage.local.remove(`pending_${tabId}`);
        
        // If it was a background tab, close it after a moment
        const tabs = await chrome.tabs.query({});
        const tab = tabs.find(t => t.id === tabId);
        
        if (tab && !tab.active) {
          console.log('🗑️ Closing background tab after successful send');
          setTimeout(() => {
            chrome.tabs.remove(tabId);
          }, 2000);
        }
        
      } else {
        console.log('❌ Message send failed:', response?.error);
      }
      
    } catch (error) {
      console.error('❌ Error sending message:', error);
    }
  } else {
    console.log('📋 No pending message found for tab', tabId);
  }
}

// Clean up old pending messages on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('🧹 Cleaning up old pending messages...');
  
  const storage = await chrome.storage.local.get();
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  for (const [key, value] of Object.entries(storage)) {
    if (key.startsWith('pending_') && value.created < oneHourAgo) {
      await chrome.storage.local.remove(key);
      console.log('🗑️ Removed old pending message:', key);
    }
  }
});