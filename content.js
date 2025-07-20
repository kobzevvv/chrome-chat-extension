// Content script for HH Chat Assistant
console.log('HH Chat Extension loaded');

function parseChatId(url) {
  const m = url && url.match(/\/chat\/(\d+)/);
  return m ? m[1] : null;
}

function getChatList() {
  console.log('getChatList called');
  const chats = [];
  const seen = new Set();
  document.querySelectorAll('a[href*="/chat/"]').forEach(link => {
    const id = parseChatId(link.href);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const name = link.textContent.trim() || `Chat ${id}`;
    chats.push({
      id,
      chatId: id,
      name,
      lastMessage: '',
      messageCount: 0,
      url: link.href,
      isActive: location.href.includes('/chat/' + id)
    });
  });
  return { success: true, chats };
}

async function sendMessageToChat(chatId, text) {
  console.log('sendMessageToChat', chatId, text);
  if (!chatId) throw new Error('chatId required');
  const targetUrl = `https://hh.ru/chat/${chatId}`;
  if (!location.href.includes(`/chat/${chatId}`)) {
    console.log('Navigating to chat page:', targetUrl);
    location.href = targetUrl;
    await new Promise(r => setTimeout(r, 1000));
  }
  const input = document.querySelector('textarea[data-qa="chatik-new-message-text"]');
  if (!input) {
    console.error('Message input not found');
    throw new Error('Message input not found');
  }
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const btn = document.querySelector('button[data-qa="chatik-do-send-message"]');
  if (!btn) {
    console.error('Send button not found');
    throw new Error('Send button not found');
  }
  btn.click();
  console.log('Message sent via UI');
  return { success: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('Content script received message', msg);
  if (msg.type === 'GET_CHAT_LIST') {
    const result = getChatList();
    console.log('Returning chat list', result);
    sendResponse(result);
    return true;
  }
  if (msg.type === 'SEND_MESSAGE') {
    sendMessageToChat(msg.chatId, msg.text)
      .then(res => {
        console.log('sendMessage result', res);
        sendResponse(res);
      })
      .catch(err => {
        console.error('sendMessage error', err);
        sendResponse({ success:false, error: err.message });
      });
    return true;
  }
});
