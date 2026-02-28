// === AI/chat/screenshot/screen share utility functions (no UI changes) ===
// Get user info from storage
async function getUserInfo() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userId', 'userAvatar'], (result) => {
      resolve({
        userId: result.userId || 'anonymous',
        userAvatar: result.userAvatar || null
      });
    });
  });
}

// Send message to AI
async function sendToAI(message, screenshotData = null) {
  const userInfo = await getUserInfo();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: conversationHistory,
      screenshot: screenshotData,
      userId: userInfo.userId
    })
  });
  const data = await response.json();
  // Update conversation history
  conversationHistory.push(
    { role: 'user', content: message },
    { role: 'assistant', content: data.response }
  );
  return data.response;
}

// Take screenshot
async function takeScreenshot() {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      resolve(dataUrl);
    });
  });
}

// Request screenshare permission
async function requestScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true
    });
    return stream;
  } catch (err) {
    console.error('Screen share denied:', err);
    return null;
  }
}

// Create thumbnail for attachment
function createThumbnail(dataUrl, maxWidth = 200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}
// === AI/chat/screenshot/screen share utility functions ===
const API_URL = 'https://tasking.tech/api/chat';
let conversationHistory = [];

// Get user info from storage
async function getUserInfo() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userId', 'userAvatar'], (result) => {
      resolve({
        userId: result.userId || 'anonymous',
        userAvatar: result.userAvatar || null
      });
    });
  });
}

// Send message to AI
async function sendToAI(message, screenshotData = null) {
  const userInfo = await getUserInfo();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history: conversationHistory,
      screenshot: screenshotData,
      userId: userInfo.userId
    })
  });
  const data = await response.json();
  // Update conversation history
  conversationHistory.push(
    { role: 'user', content: message },
    { role: 'assistant', content: data.response }
  );
  return data.response;
}

// Take screenshot
async function takeScreenshot() {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      resolve(dataUrl);
    });
  });
}

// Request screenshare permission
async function requestScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true
    });
    return stream;
  } catch (err) {
    console.error('Screen share denied:', err);
    return null;
  }
}

// Create thumbnail for attachment
function createThumbnail(dataUrl, maxWidth = 200) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}
const chatContainer = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');

// TaskingBot avatar from tasking.tech
const TASKINGBOT_AVATAR = 'https://tasking.tech/bot-avatar.png';
const USER_AVATAR = 'https://tasking.tech/user-avatar.png'; // Default user avatar
const API_URL = 'https://tasking.tech/api/chat';

// Conversation history for continuous chat
let conversationHistory = [];

// Current screenshot/attachment data
let currentScreenshot = null;
let currentAttachment = null;

// Add message to chat with avatar
function addMessage(content, isUser, attachment = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
  
  // Avatar
  const avatar = document.createElement('img');
  avatar.src = isUser ? USER_AVATAR : TASKINGBOT_AVATAR;
  avatar.className = 'avatar';
  avatar.alt = isUser ? 'You' : 'TaskingBot';
  
  // Content
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  contentDiv.textContent = content;
  
  // Attachment thumbnail
  if (attachment) {
    const thumb = document.createElement('img');
    thumb.src = attachment.dataUrl;
    thumb.className = 'attachment-thumb';
    thumb.style.maxWidth = '200px';
    thumb.style.borderRadius = '8px';
    thumb.style.marginTop = '8px';
    contentDiv.appendChild(thumb);
  }
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(contentDiv);
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Show typing indicator
function showTyping() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'typing-indicator';
  typingDiv.id = 'typing';
  typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatContainer.appendChild(typingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Hide typing indicator
function hideTyping() {
  const typing = document.getElementById('typing');
  if (typing) typing.remove();
}

// Capture screenshot
async function captureScreenshot() {
  const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });
  if (response.success) {
    currentScreenshot = response.dataUrl;
    showScreenshotPreview(response.dataUrl);
  } else {
    addMessage('Failed to capture screenshot: ' + response.error, false);
  }
}

// Show screenshot preview before sending
function showScreenshotPreview(dataUrl) {
  const preview = document.getElementById('screenshotPreview');
  if (preview) {
    preview.innerHTML = `<img src="${dataUrl}" style="max-width: 100%; border-radius: 8px;" />
      <button id="sendScreenshot">Send</button>
      <button id="cancelScreenshot">Cancel</button>`;
    preview.style.display = 'block';
    
    document.getElementById('sendScreenshot').onclick = () => {
      sendMessageWithAttachment(dataUrl);
      preview.style.display = 'none';
    };
    document.getElementById('cancelScreenshot').onclick = () => {
      currentScreenshot = null;
      preview.style.display = 'none';
    };
  }
}

// Handle file attachment
function handleAttachment(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      currentAttachment = e.target.result;
      showAttachmentPreview(e.target.result, file.name);
    };
    reader.readAsDataURL(file);
  }
}

// Show attachment preview
function showAttachmentPreview(dataUrl, fileName) {
  const preview = document.getElementById('attachmentPreview');
  if (preview) {
    if (dataUrl.startsWith('data:image')) {
      preview.innerHTML = `<img src="${dataUrl}" style="max-width: 100px; border-radius: 8px;" />
        <span>${fileName}</span>
        <button id="sendAttachment">Send</button>
        <button id="cancelAttachment">Cancel</button>`;
    } else {
      preview.innerHTML = `<span>📎 ${fileName}</span>
        <button id="sendAttachment">Send</button>
        <button id="cancelAttachment">Cancel</button>`;
    }
    preview.style.display = 'block';
    
    document.getElementById('sendAttachment').onclick = () => {
      sendMessageWithAttachment(dataUrl, fileName);
      preview.style.display = 'none';
    };
    document.getElementById('cancelAttachment').onclick = () => {
      currentAttachment = null;
      preview.style.display = 'none';
    };
  }
}

// Send message with optional attachment
async function sendMessageWithAttachment(dataUrl = null, fileName = null) {
  const message = messageInput.value.trim();
  if (!message && !dataUrl) return;
  
  // Add user message to chat
  addMessage(message || 'Sent an attachment', true, dataUrl ? { dataUrl, fileName } : null);
  
  // Add to conversation history
  conversationHistory.push({ role: 'user', content: message });
  
  messageInput.value = '';
  currentScreenshot = null;
  currentAttachment = null;
  
  showTyping();
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: conversationHistory,
        screenshot: dataUrl,
        attachment: currentAttachment
      })
    });
    
    const data = await response.json();
    hideTyping();
    
    // Add assistant response
    addMessage(data.response || 'Sorry, I encountered an error.', false);
    
    // Add to conversation history
    conversationHistory.push({ role: 'assistant', content: data.response });
  } catch (error) {
    hideTyping();
    addMessage('Sorry, I couldn\'t connect to the server.', false);
  }
}

// Send message (regular)
async function sendMessage() {
  await sendMessageWithAttachment();
}

// Event listeners
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Screenshot button (if exists)
const screenshotBtn = document.getElementById('screenshotBtn');
if (screenshotBtn) {
  screenshotBtn.addEventListener('click', captureScreenshot);
}

// Attachment input (if exists)
const attachmentInput = document.getElementById('attachmentInput');
if (attachmentInput) {
  attachmentInput.addEventListener('change', handleAttachment);
}

// Keyboard shortcut for screenshot (Ctrl+Shift+S)
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key === 'S') {
    captureScreenshot();
  }
});
