// sidepanel.js loaded
console.log('sidepanel.js loaded');

const USER_AVATAR = chrome.runtime.getURL('icons/avatar.png');
const TASKINGBOT_AVATAR = chrome.runtime.getURL('icons/taskingbot.png');

let conversationHistory = [];

// element refs
let chatContainer, messageInput, sendBtn, screenshotBtn, screenShareBtn, attachBtn;
let botToggle, botDisabledMsg;

document.addEventListener('DOMContentLoaded', () => {
  chatContainer = document.getElementById('chat');
  messageInput = document.getElementById('messageInput');
  sendBtn = document.getElementById('sendButton');
  screenshotBtn = document.getElementById('sidebar-screenshot');
  screenShareBtn = document.getElementById('sidebar-share-screen');
  attachBtn = document.getElementById('sidebar-attach');
  botToggle = document.getElementById('botToggle');
  botDisabledMsg = document.getElementById('botDisabledMsg');

  if (botToggle) {
    botToggle.addEventListener('change', () => {
      const on = botToggle.checked;
      if (on) {
        chatContainer.style.display = 'flex';
        botDisabledMsg.style.display = 'none';
      } else {
        chatContainer.style.display = 'none';
        botDisabledMsg.style.display = 'block';
      }
    });
  }

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
        await sendMessageWithAttachment(dataUrl);
      }
    });
  }

  if (screenShareBtn) {
    screenShareBtn.addEventListener('click', async () => {
      const stream = await requestScreenShare();
      if (stream) {
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
      fileInput.onchange = function (e) {
        const file = e.target.files[0];
        if (file) {
          addMessage(`[Attached: ${file.name}]`, true);
          showAttachmentPreview(URL.createObjectURL(file), file.name);
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

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'S') {
      takeScreenshot();
    }
  });
});

// ---------- utility / helper functions ------------

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
        if (response && response.result) {
          const data = response.result;
          conversationHistory.push(
            { role: 'user', content: message },
            { role: 'assistant', content: data.response }
          );
          resolve(data.response);
        } else {
          const err =
            response && response.error ? new Error(response.error) : new Error('no response');
          console.error('sendToAI background error', err);
          reject(err);
        }
      }
    );
  });
}

async function sendMessage() {
  if (!botToggle || !botToggle.checked) {
    addMessage("Bot is turned off.", false);
    return;
  }
  const text = messageInput.value.trim();
  if (!text) return;
  addMessage(text, true);
  messageInput.value = '';
  try {
    const aiResp = await sendToAI(text);
    addMessage(aiResp, false);
  } catch (err) {
    addMessage('Error: ' + err.message, false);
  }
}

async function sendMessageWithAttachment(dataUrl) {
  if (!botToggle || !botToggle.checked) {
    addMessage("Bot is turned off.", false);
    return;
  }
  addMessage('[Attachment sent]', true);
  try {
    const aiResp = await sendToAI('', dataUrl);
    addMessage(aiResp, false);
  } catch (err) {
    addMessage('Error: ' + err.message, false);
  }
}

function addMessage(text, isUser = true) {
  const msg = document.createElement('div');
  msg.className = 'message ' + (isUser ? 'user' : 'assistant');
  if (!isUser) {
    const avatar = document.createElement('img');
    avatar.src = TASKINGBOT_AVATAR;
    avatar.className = 'avatar';
    avatar.onerror = () => (avatar.src = chrome.runtime.getURL('icons/taskingbot.png'));
    msg.appendChild(avatar);
  } else {
    const avatar = document.createElement('img');
    avatar.src = USER_AVATAR;
    avatar.className = 'avatar';
    avatar.onerror = () => (avatar.src = chrome.runtime.getURL('icons/avatar.png'));
    msg.appendChild(avatar);
  }
  const content = document.createElement('span');
  content.textContent = text;
  msg.appendChild(content);

  if (!isUser) {
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋';
    copyBtn.title = 'Copy';
    copyBtn.style.marginLeft = '8px';
    copyBtn.style.border = 'none';
    copyBtn.style.background = 'transparent';
    copyBtn.style.cursor = 'pointer';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(text);
    };
    msg.appendChild(copyBtn);
  }

  chatContainer.appendChild(msg);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

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

function showScreenshotPreview(dataUrl) {
  const preview = document.getElementById('screenshotPreview');
  if (preview) {
    preview.innerHTML = `<img src="${dataUrl}" style="max-width:100%;border-radius:8px;" />`;
    preview.style.display = 'block';
  }
}

function showAttachmentPreview(dataUrl, filename) {
  const preview = document.getElementById('attachmentPreview');
  if (preview) {
    preview.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">
        <img src="${dataUrl}" style="max-width:100px;max-height:100px;border-radius:8px;"/>
        <span>${filename}</span>
      </div>`;
    preview.style.display = 'block';
  }
}

function captureScreenshot() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
      resolve(response ? response.screenshot : null);
    });
  });
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
