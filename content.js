// TaskingBot FAB - Content Script
(function() {
  'use strict';

  // State
  let isOpen = false;
  let messages = JSON.parse(localStorage.getItem('taskingbot_messages') || '[]');

  // Create FAB container
  const fab = document.createElement('div');
  fab.id = 'taskingbot-fab';
  fab.innerHTML = `
    <div id="fab-button">
      <img src="https://tasking.tech/favicon.ico" alt="TaskingBot">
    </div>
    <div id="fab-panel">
      <div id="fab-header">
        <img src="https://tasking.tech/favicon.ico" alt="TaskingBot">
        <span>TaskingBot</span>
        <button id="fab-close">&times;</button>
      </div>
      <div id="fab-messages">
        <div class="fab-message bot">👋 Hi! I'm TaskingBot, your AI assistant. Ask me anything or use the tools below!</div>
      </div>
      <div id="fab-input-container">
        <input type="text" id="fab-input" placeholder="Type your message...">
        <button id="fab-send">Send</button>
      </div>
      <div id="fab-tools">
        <button id="fab-screenshot" title="Take Screenshot">📸</button>
        <button id="fab-clipboard" title="Read Clipboard">📋</button>
        <button id="fab-attach" title="Attach File">📎</button>
      </div>
    </div>
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
    typingDiv.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
      // Send to background script which calls the API
      const response = await chrome.runtime.sendMessage({ action: 'chat', message: text });

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
      addMessage('bot', `Error: ${error.message}`);
    }
  }

  // Add message to chat
  function addMessage(role, content) {
    messages.push({ role, content, timestamp: Date.now() });
    localStorage.setItem('taskingbot_messages', JSON.stringify(messages));
    renderMessages();
  }

  // Render messages
  function renderMessages() {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => {
      const div = document.createElement('div');
      div.className = `fab-message ${msg.role === 'user' ? 'user' : 'bot'}`;
      div.textContent = msg.content;
      messagesContainer.appendChild(div);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Screenshot
  screenshotBtn.addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'captureScreenshot' });
      if (response && response.screenshot) {
        addMessage('bot', '📸 Screenshot captured! Analyzing...');
        // Send to AI for analysis
        const aiResponse = await chrome.runtime.sendMessage({
          action: 'chat',
          message: 'Analyze this screenshot',
          attachment: response.screenshot
        });
        if (aiResponse && aiResponse.reply) {
          addMessage('bot', aiResponse.reply);
        }
      }
    } catch (error) {
      addMessage('bot', `Screenshot error: ${error.message}`);
    }
  });

  // Clipboard
  clipboardBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        input.value = text;
        addMessage('bot', '📋 Clipboard content pasted. Ready to send!');
      }
    } catch (error) {
      addMessage('bot', `Clipboard error: ${error.message}`);
    }
  });

  // Attach file
  attachBtn.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,.pdf,.txt,.doc,.docx';
    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        addMessage('bot', `📎 File attached: ${file.name}`);
        // Handle file upload
      }
    };
    fileInput.click();
  });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Browser automation: Fill form
    if (request.action === 'fillForm') {
      try {
        const { selector, value } = request;
        const element = document.querySelector(selector);
        if (element) {
          element.value = value;
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          sendResponse({ success: true });
        } else {
          sendResponse({ error: 'Element not found' });
        }
      } catch (error) {
        sendResponse({ error: error.message });
      }
      return true;
    }

    // Browser automation: Click element
    if (request.action === 'clickElement') {
      try {
        const { selector } = request;
        const element = document.querySelector(selector);
        if (element) {
          element.click();
          sendResponse({ success: true });
        } else {
          sendResponse({ error: 'Element not found' });
        }
      } catch (error) {
        sendResponse({ error: error.message });
      }
      return true;
    }

    // Browser automation: Extract content
    if (request.action === 'extractContent') {
      try {
        const { selector } = request;
        if (selector) {
          const element = document.querySelector(selector);
          sendResponse({ content: element ? element.textContent : null });
        } else {
          sendResponse({ content: document.body.textContent });
        }
      } catch (error) {
        sendResponse({ error: error.message });
      }
      return true;
    }

    // Browser automation: Get page info
    if (request.action === 'getPageInfo') {
      try {
        sendResponse({
          url: window.location.href,
          title: document.title,
          content: document.body.textContent.substring(0, 5000)
        });
      } catch (error) {
        sendResponse({ error: error.message });
      }
      return true;
    }
  });

  // Initialize
  renderMessages();
})();