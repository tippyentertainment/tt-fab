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

const REQUEST_TIMEOUT_MS = 30000;

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
  removeLegacyPreviews();

  if (botToggle) {
    botToggle.addEventListener('change', () => {
      setBotEnabled(botToggle.checked);
    });
    setBotEnabled(botToggle.checked);
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
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
      void handleAttachmentFile(file);
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

async function sendToAI(message, attachment = null) {
  const userInfo = await getUserInfo();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      reject(new Error('Request timed out while sending attachment.'));
    }, REQUEST_TIMEOUT_MS);
    chrome.runtime.sendMessage(
      {
        action: 'sendToAI',
        payload: {
          message,
          history: conversationHistory,
          attachment: attachment || undefined,
          userId: userInfo.userId,
        },
      },
      (response) => {
        if (settled) {
          return;
        }
        clearTimeout(timeoutId);
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

async function sendAttachment(
  dataUrl,
  filename,
  displayDataUrl = null,
  isImage = false,
  attachmentType = null,
  attachmentSize = null,
) {
  if (botToggle && !botToggle.checked) {
    addMessage('Bot is turned off.', false);
    return;
  }

  const label = filename ? `Attachment: ${filename}` : 'Attachment';
  addAttachmentMessage(displayDataUrl || dataUrl, filename, isImage);
  removeLegacyPreviews();

  showTypingIndicator();
  try {
    const attachment = buildAttachment(dataUrl, filename, attachmentType, attachmentSize);
    const aiResponse = await sendToAI(label, attachment);
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

function addAttachmentMessage(dataUrl, filename, isImage = false) {
  if (!chatContainer) {
    return;
  }

  const msg = document.createElement('div');
  msg.className = 'message user';

  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  avatar.src = USER_AVATAR;
  avatar.onerror = () => {
    avatar.src = USER_AVATAR_FALLBACK;
  };

  const content = document.createElement('div');
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = '6px';

  if (isImage && isImageDataUrl(dataUrl)) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.maxWidth = '180px';
    img.style.maxHeight = '180px';
    img.style.borderRadius = '8px';
    img.style.objectFit = 'cover';
    content.appendChild(img);
  }

  const label = document.createElement('span');
  label.textContent = filename || 'Attachment';
  content.appendChild(label);

  msg.appendChild(avatar);
  msg.appendChild(content);
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
  const result = await captureScreenshot();
  if (!result || !result.dataUrl) {
    const message = result && result.error ? `Screenshot failed: ${result.error}` : 'Screenshot failed.';
    addMessage(message, false);
    return;
  }
  removeLegacyPreviews();
  const uploadDataUrl = await prepareImageForSend(result.dataUrl);
  await sendAttachment(uploadDataUrl, 'Screenshot', result.dataUrl, true, 'image/jpeg');
}

function captureScreenshot() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message, dataUrl: null });
        return;
      }
      if (!response) {
        resolve({ error: 'No response from background.', dataUrl: null });
        return;
      }
      if (response.error) {
        resolve({ error: response.error, dataUrl: null });
        return;
      }
      resolve({ dataUrl: response.screenshot || null, error: null });
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
    void handleAttachmentFile(file);
  };
  fileInput.click();
}

function handleAttachmentFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (!ev.target || typeof ev.target.result !== 'string') {
      return;
    }
    void handleAttachmentData(ev.target.result, file);
  };
  reader.readAsDataURL(file);
}

async function handleAttachmentData(dataUrl, file) {
  const filename = file && file.name ? file.name : 'Attachment';
  const isImage = (file && file.type ? file.type.startsWith('image/') : false) || isImageDataUrl(dataUrl);
  const attachmentType = file && file.type ? file.type : inferDataUrlMimeType(dataUrl);
  const attachmentSize = file && typeof file.size === 'number' ? file.size : null;
  const uploadDataUrl = isImage ? await prepareImageForSend(dataUrl) : dataUrl;
  await sendAttachment(uploadDataUrl, filename, dataUrl, isImage, attachmentType, attachmentSize);
}

function prepareImageForSend(dataUrl) {
  return resizeImageDataUrl(dataUrl, 1024, 0.8).catch(() => dataUrl);
}

function resizeImageDataUrl(dataUrl, maxWidth = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const targetWidth = Math.max(1, Math.round(img.width * scale));
      const targetHeight = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

function isImageDataUrl(dataUrl) {
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/');
}

function inferDataUrlMimeType(dataUrl) {
  if (typeof dataUrl !== 'string') return 'application/octet-stream';
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'application/octet-stream';
}

function buildAttachment(dataUrl, name, type, size) {
  if (!dataUrl) return null;
  return {
    name: name || 'attachment',
    type: type || inferDataUrlMimeType(dataUrl),
    content: dataUrl,
    size: typeof size === 'number' ? size : undefined,
  };
}

function removeLegacyPreviews() {
  const screenshotPreview = document.getElementById('screenshotPreview');
  const attachmentPreview = document.getElementById('attachmentPreview');
  if (screenshotPreview) {
    screenshotPreview.remove();
  }
  if (attachmentPreview) {
    attachmentPreview.remove();
  }
}
