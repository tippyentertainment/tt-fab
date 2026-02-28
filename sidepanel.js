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

  // Keyboard shortcut: Ctrl+Shift+S for screenshot
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      e.preventDefault();
      screenshotBtn && screenshotBtn.click();
    }
  });
});

// === CONSTANTS ===
const API_URL = 'https://tasking.tech/api/chat';
const TASKINGBOT_AVATAR = 'https://tasking.tech/bot-avatar.png';
let conversationHistory = [];

// === HELPER FUNCTIONS ===
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addMessage(text, isUser = false, avatarUrl = null) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;

  const avatar = document.createElement('img');
  avatar.src = avatarUrl || (isUser ? 'https://tasking.tech/user-avatar.png' : TASKINGBOT_AVATAR);
  avatar.className = 'avatar';
  messageDiv.appendChild(avatar);

  const textDiv = document.createElement('div');
  textDiv.className = 'text';
  textDiv.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  messageDiv.appendChild(textDiv);

  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showScreenshotPreview(dataUrl) {
  const previewDiv = document.createElement('div');
  previewDiv.className = 'screenshot-preview';
  previewDiv.style.margin = '10px 0';

  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.maxWidth = '200px';
  img.style.borderRadius = '8px';
  previewDiv.appendChild(img);

  chatContainer.appendChild(previewDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showAttachmentPreview(dataUrl, filename) {
  const previewDiv = document.createElement('div');
  previewDiv.className = 'attachment-preview';
  previewDiv.style.margin = '10px 0';

  if (dataUrl.startsWith('data:image')) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.maxWidth = '200px';
    img.style.borderRadius = '8px';
    previewDiv.appendChild(img);
  } else {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.textContent = filename;
    link.target = '_blank';
    previewDiv.appendChild(link);
  }

  chatContainer.appendChild(previewDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// === SCREENSHOT & SCREEN SHARE ===
async function captureScreenshot() {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      resolve(dataUrl);
    });
  });
}

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

// === AI INTEGRATION ===
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

async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  // Show user message
  addMessage(message, true);
  messageInput.value = '';

  // Send to AI
  try {
    const response = await sendToAI(message);
    addMessage(response, false);
  } catch (err) {
    console.error('AI error:', err);
    addMessage('Sorry, I encountered an error. Please try again.', false);
  }
}

async function sendMessageWithAttachment(attachmentData) {
  // Show preview
  showScreenshotPreview(attachmentData);

  // Send to AI with attachment
  try {
    const response = await sendToAI('[Screenshot attached]', attachmentData);
    addMessage(response, false);
  } catch (err) {
    console.error('AI error:', err);
    addMessage('Sorry, I encountered an error processing the screenshot.', false);
  }
}

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
