// sidepanel.js loaded
console.log('sidepanel.js loaded');

// === EVENT HANDLERS INIT ===
// global element references
let chatContainer, messageInput, sendBtn, screenshotBtn, screenShareBtn, attachBtn;

document.addEventListener('DOMContentLoaded', () => {
  // element references
  chatContainer = document.getElementById('chatContainer');
  messageInput = document.getElementById('messageInput');
  sendBtn = document.getElementById('sendBtn');
  screenshotBtn = document.getElementById('screenshotBtn');
  screenShareBtn = document.getElementById('screenShareBtn');
  attachBtn = document.getElementById('attachBtn');

  // event listeners
  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  screenshotBtn.addEventListener('click', captureScreenshot);
  if (screenShareBtn) screenShareBtn.addEventListener('click', shareScreen);
  if (attachBtn) attachBtn.addEventListener('click', attachFile);

  // load chat history
  loadChatHistory();
});

// === CHAT FUNCTIONS ===
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
    addMessage(data.response, 'ai');
  } catch (error) {
    addMessage('Error connecting to AI', 'ai');
  }
}

function addMessage(text, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `message ${sender}`;
  msgDiv.textContent = text;
  chatContainer.appendChild(msgDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function loadChatHistory() {
  const history = JSON.parse(localStorage.getItem('chatHistory') || '[]');
  history.forEach(msg => addMessage(msg.text, msg.sender));
}

function captureScreenshot() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      addMessage('Screenshot captured', 'user');
    });
  });
}