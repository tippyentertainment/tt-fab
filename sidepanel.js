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