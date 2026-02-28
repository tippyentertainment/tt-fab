// TaskingBot FAB - Content Script

(function() {
  'use strict';

n  // State
  let isOpen = false;
  let messages = JSON.parse(localStorage.getItem('taskingbot_messages') || '[]');

  // Create FAB container
  const fab = document.createElement('div');
  fab.id = 'taskingbot-fab';
  fab.innerHTML = `
    <div class="fab-container">
      <div class="fab-header">
        <div class="fab-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
          <span>TaskingBot</span>
        </div>
        <button class="fab-close" title="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      
      <div class="fab-messages" id="fab-messages">
        <div class="fab-welcome">
          <p>👋 Hi! I'm TaskingBot, your AI assistant.</p>
          <p>Ask me anything or use the tools below!</p>
        </div>
      </div>
      
      <div class="fab-input-area">
        <div class="fab-input-container">
          <input type="text" id="fab-input" placeholder="Type a message..." />
          <button id="fab-send" class="fab-send-btn" title="Send message">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        
        <div class="fab-actions">
          <button class="fab-action-btn" id="fab-screenshot" title="Take Screenshot">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          <button class="fab-action-btn" id="fab-clipboard" title="Paste from Clipboard">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            </svg>
          </button>
          <button class="fab-action-btn" id="fab-attach" title="Attach File">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
    
    <button class="fab-toggle" id="fab-toggle" title="Open TaskingBot">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    </button>
  `;

  document.body.appendChild(fab);

  // Elements
  const toggle = document.getElementById('fab-toggle');
  const closeBtn = document.getElementById('fab-close');
  const messagesContainer = document.getElementById('fab-messages');
  const input = document.getElementById('fab-input');
  const sendBtn = document.getElementById('fab-send');
  const screenshotBtn = document.getElementById('fab-screenshot');
  const clipboardBtn = document.getElementById('fab-clipboard');
  const attachBtn = document.getElementById('fab-attach');

  // Toggle FAB
  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    fab.classList.toggle('open', isOpen);
    if (isOpen) {
      input.focus();
      renderMessages();
    }
  });

  closeBtn.addEventListener('click', () => {
    isOpen = false;
    fab.classList.remove('open');
  });

  // Send message
  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    addMessage('user', text);
    input.value = '';

    // Show typing indicator
    const typingDiv = document.createElement('div');
    typingDiv.className = 'fab-message fab-bot fab-typing';
    typingDiv.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
      // Send to background script which calls the API
      const response = await chrome.runtime.sendMessage({
        action: 'chat',
        message: text
      });

      // Remove typing indicator
      typingDiv.remove();

      if (response && response.reply) {
        addMessage('bot', response.reply);
      } else if (response && response.error) {
        addMessage('bot', `Error: ${response.error}`);
      } else {
        addMessage('bot', 'Sorry, I couldn\'t process that request. Please try again.');
      }
    } catch (error) {
      typingDiv.remove();
      addMessage('bot', 'Error connecting to TaskingBot. Please try again.');
      console.error('FAB error:', error);
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  // Add message to UI and storage
  function addMessage(role, content) {
    const msg = { role, content, timestamp: Date.now() };
    messages.push(msg);
    localStorage.setItem('taskingbot_messages', JSON.stringify(messages));
    renderMessages();
  }

  // Render messages
  function renderMessages() {
    const welcomeMsg = messagesContainer.querySelector('.fab-welcome');
    
    // Clear old messages except welcome
    Array.from(messagesContainer.children).forEach(child => {
      if (child !== welcomeMsg) {
        child.remove();
      }
    });

    // Add stored messages
    messages.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = `fab-message fab-${msg.role}`;
      msgDiv.innerHTML = `<div class="fab-message-content">${escapeHtml(msg.content)}</div>`;
      messagesContainer.appendChild(msgDiv);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Screenshot
  screenshotBtn.addEventListener('click', async () => {
    try {
      const dataUrl = await captureVisibleTab();
      addMessage('user', '[Screenshot captured]');
      addMessage('bot', 'Screenshot captured! I can analyze it once the API is connected.');
    } catch (error) {
      addMessage('bot', 'Failed to capture screenshot. Please try again.');
    }
  });

  async function captureVisibleTab() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'screenshot' }, (response) => {
        if (response && response.dataUrl) {
          resolve(response.dataUrl);
        } else {
          reject(new Error('Screenshot failed'));
        }
      });
    });
  }

  // Clipboard paste
  clipboardBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        input.value = text;
        input.focus();
      }
    } catch (error) {
      addMessage('bot', 'Failed to read clipboard. Please paste manually.');
    }
  });

  // File attachment
  attachBtn.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.pdf,.txt,.doc,.docx';
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        addMessage('user', `[Attached: ${file.name}]`);
        addMessage('bot', `File "${file.name}" attached. I can process it once the API is connected.`);
      }
    };
    fileInput.click();
  });

  // Context menu for selected text
  document.addEventListener('mouseup', () => {
    const selection = window.getSelection().toString().trim();
    if (selection && selection.length > 10) {
      // Store selection for context menu
      localStorage.setItem('taskingbot_selection', selection);
    }
  });

})();