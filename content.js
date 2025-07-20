// Content script for HH Chat Assistant
console.log('HH Chat Extension loaded');

function parseChatId(url) {
  const m = url && url.match(/\/chat\/(\d+)/);
  return m ? m[1] : null;
}

function getChatList() {
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
  if (!chatId) throw new Error('chatId required');
  const targetUrl = `https://hh.ru/chat/${chatId}`;
  if (!location.href.includes(`/chat/${chatId}`)) {
    location.href = targetUrl;
    await new Promise(r => setTimeout(r, 1000));
  }
  const input = document.querySelector('textarea[data-qa="chatik-new-message-text"]');
  if (!input) throw new Error('Message input not found');
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const btn = document.querySelector('button[data-qa="chatik-do-send-message"]');
  if (!btn) throw new Error('Send button not found');
  btn.click();
  return { success: true };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_CHAT_LIST') {
    sendResponse(getChatList());
    return true;
  }
  if (msg.type === 'SEND_MESSAGE') {
    sendMessageToChat(msg.chatId, msg.text).then(res => sendResponse(res)).catch(err => sendResponse({ success:false, error: err.message }));
    return true;
  }
});
