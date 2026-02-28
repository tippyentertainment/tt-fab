// sidepanel.js loaded
console.log('sidepanel.js loaded');

// === EVENT HANDLERS INIT ===
// global element references
let chatContainer, messageInput, sendBtn, screenshotBtn, screenShareBtn, attachBtn;
document.addEventListener('DOMContentLoaded', () => {
  // element references
  chatContainer = document.getElementById('chat');
  messageInput = document.getElementById('messageInput');
  sendBtn = document.getElementById('sendButton');
  screenshotBtn = document.getElementById('sidebar-screenshot');
  screenShareBtn = document.getElementById('sidebar-share-screen');
  attachBtn = document.getElementById('sidebar-attach');

  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn && sendBtn.click();
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      await sendMessage();
    });
  }

  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', async () => {
      const dataUrl = await captureScreenshot();
      if (dataUrl) {
        showScreenshotPreview(dataUrl);
        // automatically send to AI
        await sendMessageWithAttachment(dataUrl);
      }
    });
  }

  if (screenShareBtn) {
    screenShareBtn.addEventListener('click', async () => {
      const stream = await requestScreenShare();
      if (stream) {
        // create video preview with stop control
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.muted = true;
        video.style.maxWidth = '220px';
        video.style.maxHeight = '140px';
        video.style.margin = '10px 0';
        video.style.borderRadius = '10px';
        video.style.display = 'block';
        const stopBtn = document.createElement('button');
        stopBtn.textContent = 'Stop';
        stopBtn.style.marginLeft = '8px';
        stopBtn.onclick = () => {
          stream.getTracks().forEach((t) => t.stop());
          stopBtn.remove();
          video.remove();
        };
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        const avatar = document.createElement('img');
        avatar.src = TASKINGBOT_AVATAR;
        avatar.className = 'avatar';
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(video);
        messageDiv.appendChild(stopBtn);
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      } else {
        addMessage('Screen share permission denied or failed.', false);
      }
    });
  }

  if (attachBtn) {
    attachBtn.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*,.pdf,.txt,.doc,.docx';
      fileInput.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
          addMessage(`[Attached: ${file.name}]`, true);
          addMessage(`File "${file.name}" attached. I can process it once the API is connected.`, false);
        }
      };
      fileInput.click();
    });
  }

  document.addEventListener('paste', (e) => {
    if (e.clipboardData && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      const reader = new FileReader();
      reader.onload = (evt) => {
        showAttachmentPreview(evt.target.result, file.name);
      };
      reader.readAsDataURL(file);
    }
  });

  // Keyboard shortcut for screenshot (Ctrl+Shift+S)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      takeScreenshot();
    }
  });
});

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
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      action: 'sendToAI',
      payload: {
        message,
        history: conversationHistory,
        screenshot: screenshotData,
        userId: userInfo.userId
      }
    }, (response) => {
      if (response && response.result) {
        const data = response.result;
        conversationHistory.push(
          { role: 'user', content: message },
          { role: 'assistant', content: data.response }
        );
        resolve(data.response);
      } else {
        const err = response && response.error ? new Error(response.error) : new Error('no response');
        console.error('sendToAI background error', err);
        reject(err);
      }
    });
  });
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

// TaskingBot avatar from tasking.tech
const TASKINGBOT_AVATAR = chrome.runtime.getURL('icons/bot-avatar.png');
const USER_AVATAR = chrome.runtime.getURL('icons/user-icon.png'); // Default user avatar
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

  // copy button for assistant replies
  if (!isUser) {
    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    `;
    copyBtn.style.marginLeft = '6px';
    copyBtn.style.padding = '0 2px';
    copyBtn.style.border = '1px solid currentColor';
    copyBtn.style.borderRadius = '2px';
    copyBtn.style.background = 'transparent';
    copyBtn.style.cursor = 'pointer';
    copyBtn.title = 'Copy response';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(contentDiv.textContent);
    };
    messageDiv.appendChild(copyBtn);
  }

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

// Capture screenshot via background script
async function captureScreenshot() {
  const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });
  if (response && response.screenshot) {
    currentScreenshot = response.screenshot;
    return response.screenshot;
  } else {
    addMessage('Failed to capture screenshot', false);
    return null;
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
    const reply = await sendToAI(message, dataUrl);
    hideTyping();
    addMessage(reply || 'Sorry, I encountered an error.', false);
    conversationHistory.push({ role: 'assistant', content: reply });
  } catch (error) {
    hideTyping();
    console.error('sendMessageWithAttachment error', error);
    addMessage('Sorry, I couldn\'t connect to the server: ' + (error.message || ''), false);
  }
}

// Send message (regular)
async function sendMessage() {
  await sendMessageWithAttachment();
}

