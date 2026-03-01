// sidepanel.js loaded
console.log('sidepanel.js loaded');

// === EVENT HANDLERS INIT ===

// global element references
let chatContainer, messageInput, sendBtn, screenshotBtn;

document.addEventListener('DOMContentLoaded', () => {
  // element references
  chatContainer = document.getElementById('chatContainer');
  messageInput = document.getElementById('messageInput');
  sendBtn = document.getElementById('sendBtn');
  screenshotBtn = document.getElementById('screenshotBtn');

  // event listeners
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  screenshotBtn.addEventListener('click', captureScreenshot);

  // load chat history
  loadChatHistory();
});

async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  addMessage(message, 'user');
  messageInput.value = '';

  try {
    const response = await fetch('https://tasking.tech/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    const data = await response.json();
    addMessage(data.response, 'assistant');
  } catch (error) {
    addMessage('Error: ' + error.message, 'assistant');
  }
}

function addMessage(content, role) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role}`;
  messageDiv.textContent = content;
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // save to storage
  saveChatHistory();
}

async function captureScreenshot() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { action: 'captureScreenshot' }, (response) => {
    if (response && response.screenshot) {
      addMessage('Screenshot captured', 'user');
    }
  });
}

function saveChatHistory() {
  const messages = Array.from(chatContainer.children).map(div => ({
    role: div.className.split(' ')[1],
    content: div.textContent
  }));
  chrome.storage.local.set({ chatHistory: messages });
}

function loadChatHistory() {
  chrome.storage.local.get(['chatHistory'], (result) => {
    if (result.chatHistory) {
      result.chatHistory.forEach(msg => addMessage(msg.content, msg.role));
    }
  });
}