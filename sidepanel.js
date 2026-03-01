'use strict';

const USER_AVATAR = chrome.runtime.getURL('icons/user-icon.png');
const USER_AVATAR_FALLBACK = chrome.runtime.getURL('icons/icon32.png');
const TASKINGBOT_AVATAR = chrome.runtime.getURL('icons/taskingbot.png');
const TASKINGBOT_AVATAR_FALLBACK = chrome.runtime.getURL('icons/logo.png');

let conversationHistory = [];

let chatContainer;
let messageInput;
let sendBtn;
let screenshotBtn;
let screenShareBtn;
let attachBtn;
let botToggle;
let botDisabledMsg;
let inputContainer;
let screenshotPreview;
let attachmentPreview;

document.addEventListener('DOMContentLoaded', () => {
  chatContainer = document.getElementById('chat');
  messageInput = document.getElementById('messageInput');
  sendBtn = document.getElementById('sendButton');
  screenshotBtn = document.getElementById('sidebar-screenshot');
  screenShareBtn = document.getElementById('sidebar-share-screen');
  attachBtn = document.getElementById('sidebar-attach');
  botToggle = document.getElementById('botToggle');
  botDisabledMsg = document.getElementById('botDisabledMsg');
  inputContainer = document.getElementById('inputContainer');
  screenshotPreview = document.getElementById('screenshotPreview');
  attachmentPreview = document.getElementById('attachmentPreview');

  if (botToggle) {
    botToggle.addEventListener('change', () => {
      setBotEnabled(botToggle.checked);
    });
    setBotEnabled(botToggle.checked);
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        if (sendBtn) {
          sendBtn.click();
        }
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
      await takeScreenshot();
    });
  }

  if (screenShareBtn) {
    screenShareBtn.addEventListener('click', async () => {
      await startScreenShare();
    });
  }

  if (attachBtn) {
    attachBtn.addEventListener('click', () => {
      openFilePicker();
    });
  }

  document.addEventListener('paste', (event) => {
    if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length > 0) {
      const file = event.clipboardData.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (!ev.target || typeof ev.target.result !== 'string') {
          return;
        }
        showAttachmentPreview(ev.target.result, file.name);
        void sendMessageWithAttachment(ev.target.result, file.name);
      };
      reader.readAsDataURL(file);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void takeScreenshot();
    }
  });
});

function setBotEnabled(enabled) {
  if (chatContainer) {
    chatContainer.style.display = enabled ? 'flex' : 'none';
  }
  if (inputContainer) {
    inputContainer.style.display = enabled ? 'block' : 'none';
  }
  if (botDisabledMsg) {
    botDisabledMsg.style.display = enabled ? 'none' : 'block';
  }
}

function extractAssistantText(data) {
  if (!data) {
    return 'No response received.';
  }
  if (typeof data === 'string') {
    return data;
  }
  return data.response || data.message || data.text || JSON.stringify(data);
}

async function getUserInfo() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userId', 'userAvatar'], (result) => {
      resolve({
        userId: result.userId || 'anonymous',
        userAvatar: result.userAvatar || null,
      });
    });
  });
}

async function sendToAI(message, screenshotData = null) {
  const userInfo = await getUserInfo();
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'sendToAI',
        payload: {
          message,
          history: conversationHistory,
          screenshot: screenshotData,
          userId: userInfo.userId,
        },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response && response.result) {
          const data = response.result;
          conversationHistory.push({ role: 'user', content: message });
          conversationHistory.push({ role: 'assistant', content: extractAssistantText(data) });
          resolve(data);
          return;
        }

        reject(new Error(response && response.error ? response.error : 'Unknown error'));
      }
    );
  });
}

async function sendMessage() {
  if (botToggle && !botToggle.checked) {
    addMessage('Bot is turned off.', false);
    return;
  }
  if (!messageInput) {
    return;
  }
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  addMessage(text, true);
  messageInput.value = '';

  showTypingIndicator();
  try {
    const aiResponse = await sendToAI(text);
    hideTypingIndicator();
    addMessage(extractAssistantText(aiResponse), false);
  } catch (err) {
    hideTypingIndicator();
    addMessage(`Error: ${err.message}`, false);
  }
}

async function sendMessageWithAttachment(dataUrl, filename) {
  if (botToggle && !botToggle.checked) {
    addMessage('Bot is turned off.', false);
    return;
  }

  const label = filename ? `Attachment sent: ${filename}` : 'Attachment sent.';
  addMessage(label, true);

  showTypingIndicator();
  try {
    const aiResponse = await sendToAI(label, dataUrl);
    hideTypingIndicator();
    addMessage(extractAssistantText(aiResponse), false);
  } catch (err) {
    hideTypingIndicator();
    addMessage(`Error: ${err.message}`, false);
  }
}

function addMessage(text, isUser = true) {
  if (!chatContainer) {
    return;
  }

  const msg = document.createElement('div');
  msg.className = `message ${isUser ? 'user' : 'assistant'}`;

  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  avatar.src = isUser ? USER_AVATAR : TASKINGBOT_AVATAR;
  avatar.onerror = () => {
    avatar.src = isUser ? USER_AVATAR_FALLBACK : TASKINGBOT_AVATAR_FALLBACK;
  };

  const content = document.createElement('span');
  content.textContent = text;

  msg.appendChild(avatar);
  msg.appendChild(content);

  if (!isUser) {
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '⧉';
    copyBtn.title = 'Copy';
    copyBtn.style.marginLeft = '8px';
    copyBtn.style.border = 'none';
    copyBtn.style.background = 'transparent';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.color = '#FF8C00';
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(text);
    });
    msg.appendChild(copyBtn);
  }

  chatContainer.appendChild(msg);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTypingIndicator() {
  if (!chatContainer) {
    return;
  }
  const existing = document.getElementById('typingIndicator');
  if (existing) {
    return;
  }
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typingIndicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatContainer.appendChild(indicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    indicator.remove();
  }
}

async function takeScreenshot() {
  const dataUrl = await captureScreenshot();
  if (!dataUrl) {
    addMessage('Screenshot failed.', false);
    return;
  }
  await showScreenshotPreview(dataUrl);
  await sendMessageWithAttachment(dataUrl, 'Screenshot');
}

function captureScreenshot() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
      resolve(response && response.screenshot ? response.screenshot : null);
    });
  });
}

async function startScreenShare() {
  const stream = await requestScreenShare();
  if (!stream) {
    addMessage('Screen share permission denied or failed.', false);
    return;
  }

  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.muted = true;
  video.style.maxWidth = '200px';
  video.style.maxHeight = '140px';
  video.style.margin = '10px 0';
  video.style.borderRadius = '10px';
  video.style.display = 'block';

  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stop';
  stopBtn.style.marginTop = '8px';
  stopBtn.addEventListener('click', () => {
    stream.getTracks().forEach((track) => track.stop());
    stopBtn.remove();
    video.remove();
  });

  const message = document.createElement('div');
  message.className = 'message assistant';
  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  avatar.src = TASKINGBOT_AVATAR;
  avatar.onerror = () => {
    avatar.src = TASKINGBOT_AVATAR_FALLBACK;
  };
  message.appendChild(avatar);
  message.appendChild(video);
  message.appendChild(stopBtn);

  if (chatContainer) {
    chatContainer.appendChild(message);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

async function requestScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    return stream;
  } catch (err) {
    console.error('Screen share denied:', err);
    return null;
  }
}

function openFilePicker() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,.pdf,.txt,.doc,.docx';
  fileInput.onchange = (event) => {
    const file = event.target && event.target.files ? event.target.files[0] : null;
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!ev.target || typeof ev.target.result !== 'string') {
        return;
      }
      showAttachmentPreview(ev.target.result, file.name);
      void sendMessageWithAttachment(ev.target.result, file.name);
    };
    reader.readAsDataURL(file);
  };
  fileInput.click();
}

function showScreenshotPreview(dataUrl) {
  if (!screenshotPreview) {
    return Promise.resolve();
  }

  return createThumbnail(dataUrl, 200)
    .then((thumbUrl) => {
      screenshotPreview.innerHTML = `<img src="${thumbUrl}" style="max-width:200px;border-radius:8px;" />`;
      screenshotPreview.style.display = 'block';
    })
    .catch(() => {
      screenshotPreview.innerHTML = `<img src="${dataUrl}" style="max-width:200px;border-radius:8px;" />`;
      screenshotPreview.style.display = 'block';
    });
}

function showAttachmentPreview(dataUrl, filename) {
  if (!attachmentPreview) {
    return;
  }

  if (dataUrl.startsWith('data:image/')) {
    attachmentPreview.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <img src="${dataUrl}" style="max-width:100px;max-height:100px;border-radius:8px;" />
        <span>${filename || 'Attachment'}</span>
      </div>
    `;
  } else {
    attachmentPreview.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span>${filename || 'Attachment'}</span>
      </div>
    `;
  }

  attachmentPreview.style.display = 'block';
}

function createThumbnail(dataUrl, maxWidth = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}
