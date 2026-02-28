const chatContainer = document.getElementById('chat');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');

const API_URL = 'https://tasking.tech/api/chat';

function addMessage(content, isUser) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
  if (isUser) {
    // User avatar
    const avatar = document.createElement('img');
    avatar.src = 'https://tasking.tech/avatar.png';
    avatar.alt = 'User Avatar';
    avatar.className = 'avatar';
    messageDiv.appendChild(avatar);
    const span = document.createElement('span');
    span.textContent = content;
    messageDiv.appendChild(span);
  } else {
    // Bot avatar (logo)
    const avatar = document.createElement('img');
    avatar.src = 'https://tasking.tech/logo.png';
    avatar.alt = 'Bot Avatar';
    avatar.className = 'avatar';
    messageDiv.appendChild(avatar);
    const span = document.createElement('span');
    span.textContent = content;
    messageDiv.appendChild(span);
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

async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;
  
  addMessage(message, true);
  messageInput.value = '';
  
  showTyping();
  
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    
    const data = await response.json();
    hideTyping();
    addMessage(data.response || 'Sorry, I encountered an error.', false);
  } catch (error) {
    hideTyping();
    addMessage('Sorry, I couldn\'t connect to the server.', false);
  }
}

sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});