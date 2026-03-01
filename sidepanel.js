// sidepanel.js loaded
console.log('sidepanel.js loaded');

// === AUTH STATE MANAGEMENT ===
let authState = {
  token: null,
  user: null,
  provider: null
};

// Check auth state on load
async function checkAuthState() {
  const response = await chrome.runtime.sendMessage({ action: 'getAuthState' });
  authState = response || { token: null, user: null, provider: null };
  updateAuthUI();
}

// Update UI based on auth state
function updateAuthUI() {
  const loggedOutSection = document.getElementById('auth-logged-out');
  const loggedInSection = document.getElementById('auth-logged-in');
  const userAvatar = document.getElementById('user-avatar');
  const userName = document.getElementById('user-name');
  const userEmail = document.getElementById('user-email');

  if (authState.user) {
    // User is logged in
    loggedOutSection.style.display = 'none';
    loggedInSection.style.display = 'block';
    userAvatar.src = authState.user.avatar;
    userName.textContent = authState.user.name;
    userEmail.textContent = authState.user.email;
  } else {
    // User is logged out
    loggedOutSection.style.display = 'block';
    loggedInSection.style.display = 'none';
  }
}

// Sign in with provider
async function signIn(provider) {
  const loadingDiv = document.getElementById('auth-loading');
  loadingDiv.style.display = 'block';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'signIn', provider });
    if (response.success) {
      authState.user = response.user;
      authState.provider = provider;
      updateAuthUI();
    } else {
      console.error('Sign in failed:', response.error);
      alert('Sign in failed: ' + response.error);
    }
  } catch (error) {
    console.error('Sign in error:', error);
    alert('Sign in error: ' + error.message);
  } finally {
    loadingDiv.style.display = 'none';
  }
}

// Sign out
async function signOut() {
  try {
    await chrome.runtime.sendMessage({ action: 'signOut' });
    authState = { token: null, user: null, provider: null };
    updateAuthUI();
  } catch (error) {
    console.error('Sign out error:', error);
  }
}

// === EVENT HANDLERS INIT ===
// global element references
let chatContainer, messageInput, sendBtn, screenshotBtn, screenShareBtn, attachBtn;

document.addEventListener('DOMContentLoaded', () => {
  // Check auth state on load
  checkAuthState();

  // Auth button handlers
  document.getElementById('google-signin')?.addEventListener('click', () => signIn('google'));
  document.getElementById('github-signin')?.addEventListener('click', () => signIn('github'));
  document.getElementById('microsoft-signin')?.addEventListener('click', () => signIn('microsoft'));
  document.getElementById('signout-btn')?.addEventListener('click', signOut);

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
      }
    });
  }
});

// ... rest of the existing sidepanel.js code ...