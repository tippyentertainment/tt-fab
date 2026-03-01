// sidepanel.js loaded
console.log('sidepanel.js loaded');

// === AUTH STATE MANAGEMENT ===
let authState = {
  token: null,
  user: null,
  provider: null
};

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', async () => {
  // Load auth state from storage
  await loadAuthState();
  
  // Update UI based on auth state
  updateAuthUI();
  
  // Initialize event listeners
  initializeEventListeners();
});

// === AUTH FUNCTIONS ===
async function loadAuthState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken', 'authUser', 'authProvider'], (result) => {
      if (result.authToken) {
        authState.token = result.authToken;
        authState.user = result.authUser;
        authState.provider = result.authProvider;
        console.log('Restored auth state:', authState.provider, authState.user?.email);
      }
      resolve();
    });
  });
}

function updateAuthUI() {
  const userInfo = document.getElementById('userInfo');
  const userAvatar = document.getElementById('userAvatar');
  const userInitials = document.getElementById('userInitials');
  const onlineStatus = document.getElementById('onlineStatus');
  
  if (authState.user) {
    // Show user info
    userInfo.style.display = 'flex';
    
    // Set user initials
    const name = authState.user.name || authState.user.email || 'U';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    userInitials.textContent = initials;
    
    // Set online status
    onlineStatus.classList.remove('offline-status');
    
    // Set avatar image if available
    if (authState.user.avatar) {
      userAvatar.style.backgroundImage = `url(${authState.user.avatar})`;
      userAvatar.style.backgroundSize = 'cover';
      userInitials.style.display = 'none';
    }
  } else {
    // Hide user info
    userInfo.style.display = 'none';
  }
}

// === EVENT LISTENERS ===
function initializeEventListeners() {
  // Message input
  const messageInput = document.getElementById('messageInput');
  const sendButton = document.getElementById('sendButton');
  
  if (messageInput) {
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendButton && sendButton.click();
      }
    });
  }
  
  if (sendButton) {
    sendButton.addEventListener('click', async () => {
      await sendMessage();
    });
  }
  
  // Sidebar buttons
  const screenshotBtn = document.getElementById('sidebar-screenshot');
  const shareScreenBtn = document.getElementById('sidebar-share-screen');
  const attachBtn = document.getElementById('sidebar-attach');
  
  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', async () => {
      const dataUrl = await captureScreenshot();
      if (dataUrl) {
        await sendImageMessage(dataUrl);
      }
    });
  }
  
  if (shareScreenBtn) {
    shareScreenBtn.addEventListener('click', async () => {
      // Share screen functionality
      console.log('Share screen clicked');
    });
  }
  
  if (attachBtn) {
    attachBtn.addEventListener('click', async () => {
      // Attach file functionality
      console.log('Attach clicked');
    });
  }
}

// === MESSAGE FUNCTIONS ===
async function sendMessage() {
  const messageInput = document.getElementById('messageInput');
  const message = messageInput.value.trim();
  
  if (!message) return;
  
  // Add user message to chat
  addMessageToChat('user', message);
  messageInput.value = '';
  
  // Send to AI
  try {
    const response = await sendToAI(message);
    addMessageToChat('ai', response);
  } catch (error) {
    console.error('Error sending message:', error);
    addMessageToChat('ai', 'Sorry, I encountered an error. Please try again.');
  }
}

async function sendToAI(message) {
  // Get auth token
  const token = authState.token;
  
  // Send to bridge endpoint
  const response = await fetch('https://tasking.tech/api/bridge', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    },
    body: JSON.stringify({
      message: message,
      conversationHistory: getConversationHistory()
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to send message');
  }
  
  const data = await response.json();
  return data.response || data.message || 'No response from AI';
}

function addMessageToChat(role, content) {
  const chatContainer = document.getElementById('chat');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}-message`;
  messageDiv.textContent = content;
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function getConversationHistory() {
  const messages = document.querySelectorAll('.message');
  return Array.from(messages).map(msg => ({
    role: msg.classList.contains('user-message') ? 'user' : 'assistant',
    content: msg.textContent
  }));
}

// === SCREENSHOT FUNCTIONS ===
async function captureScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    return dataUrl;
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    return null;
  }
}

async function sendImageMessage(dataUrl) {
  // Add image to chat
  const chatContainer = document.getElementById('chat');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message user-message';
  
  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.maxWidth = '100%';
  img.style.borderRadius = '8px';
  
  messageDiv.appendChild(img);
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  // Send to AI for analysis
  try {
    const response = await sendToAI('What do you see in this screenshot?');
    addMessageToChat('ai', response);
  } catch (error) {
    console.error('Error analyzing screenshot:', error);
    addMessageToChat('ai', 'Sorry, I couldn\'t analyze the screenshot.');
  }
}

// === AUTH LISTENERS ===
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'authStateChanged') {
    loadAuthState().then(() => {
      updateAuthUI();
    });
  }
});