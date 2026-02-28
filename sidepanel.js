const chatContainer = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const screenshotBtn = document.getElementById('screenshotBtn');

const API_URL = 'https://tasking.tech/api/chat';

let conversationHistory = [];
let currentScreenshot = null;

// TaskingBot avatar
const TASKINGBOT_AVATAR = 'https://tasking.tech/_api/r2/users/4/generated/1772126543966-3wcgtkr3.png';

function addMessage(content, isUser, hasScreenshot = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
  
  // Add avatar for assistant
  if (!isUser) {
    const avatar = document.createElement('img');
    avatar.src = TASKINGBOT_AVATAR;
    avatar.className = 'avatar';
    avatar.style.cssText = 'width: 32px; height: 32px; border-radius: 50%; margin-right: 8px; object-fit: cover;';
    messageDiv.appendChild(avatar);
  }
  
  const textDiv = document.createElement('div');
  textDiv.className = 'message-text';
  textDiv.textContent = content;
  messageDiv.appendChild(textDiv);
  
  if (hasScreenshot) {
    const indicator = document.createElement('div');
    indicator.className = 'screenshot-indicator';
    indicator.textContent = '📸 Screenshot attached';
    messageDiv.appendChild(indicator);
  }
  
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTyping() {
  const typingDiv = document.createElement('div');
  typingDiv.className = 'typing-indicator';
  typingDiv.id = 'typing';
  typingDiv.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatContainer.appendChild(typingDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTyping() {
  const typing = document.getElementById('typing');
  if (typing) typing.remove();
}

async function captureScreenshot() {
  try {
    // Request screenshot via background script
    const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });
    
    if (response && response.screenshot) {
      currentScreenshot = response.screenshot;
      
      // Show preview
      const preview = document.getElementById('screenshotPreview');
      if (preview) {
        preview.innerHTML = `<img src="${response.screenshot}" style="max-width: 100%; border-radius: 8px;" />`;
        preview.style.display = 'block';
      }
      
      addMessage('Screenshot captured! Ask me anything about it.', false);
    } else {
      addMessage('Screenshot failed. Please try again.', false);
    }
  } catch (error) {
    console.error('Screenshot failed:', error);
    addMessage('Screenshot permission denied. Please allow screen capture in extension settings.', false);
  }
}

async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message && !currentScreenshot) return;
  
  addMessage(message || 'Analyze this screenshot', true, !!currentScreenshot);
  messageInput.value = '';
  
  showTyping();
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history: conversationHistory,
        screenshot: currentScreenshot
      })
    });
    
    const data = await response.json();
    hideTyping();
    
    if (data.success) {
      addMessage(data.response, false);
      conversationHistory.push(
        { role: 'user', content: message },
        { role: 'assistant', content: data.response }
      );
    } else {
      addMessage(`Error: ${data.error}`, false);
    }
    
    currentScreenshot = null;
    const preview = document.getElementById('screenshotPreview');
    if (preview) preview.style.display = 'none';
    
  } catch (error) {
    hideTyping();
    addMessage('Sorry, I couldn\'t connect to the server.', false);
  }
}

// Screenshot button
if (screenshotBtn) {
  screenshotBtn.addEventListener('click', captureScreenshot);
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Initial greeting
addMessage('Hello! I\'m TaskingBot. I can help you with tasks, answer questions, and analyze screenshots. Click the camera button to share your screen!', false);