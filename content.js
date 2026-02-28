// Content script - TaskingBot FAB with chat interface
(function() {
  'use strict';

  // Remove existing FAB
  const existingFAB = document.getElementById('taskingbot-fab');
  if (existingFAB) existingFAB.remove();

  // Create FAB container
  const fabContainer = document.createElement('div');
  fabContainer.id = 'taskingbot-fab';
  fabContainer.innerHTML = `
    <div id="fab-button" title="TaskingBot">
      <img src="https://tasking.tech/logo.png" alt="TaskingBot" />
    </div>
    <div id="fab-panel">
      <div id="fab-header">
        <img src="https://tasking.tech/logo.png" alt="TaskingBot" />
        <span>TaskingBot</span>
        <button id="fab-close">×</button>
      </div>
      <div id="fab-messages"></div>
      <div id="fab-input-area">
        <div id="fab-attachments"></div>
        <div id="fab-input-row">
          <button id="fab-attach" title="Attach file">📎</button>
          <button id="fab-screenshot" title="Take screenshot">📷</button>
          <button id="fab-paste" title="Paste from clipboard">📋</button>
          <input type="text" id="fab-input" placeholder="Type a message..." />
          <button id="fab-send">Send</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(fabContainer);

  // Elements
  const fabButton = document.getElementById('fab-button');
  const fabPanel = document.getElementById('fab-panel');
  const fabClose = document.getElementById('fab-close');
  const fabInput = document.getElementById('fab-input');
  const fabSend = document.getElementById('fab-send');
  const fabMessages = document.getElementById('fab-messages');
  const fabAttach = document.getElementById('fab-attach');
  const fabScreenshot = document.getElementById('fab-screenshot');
  const fabPaste = document.getElementById('fab-paste');
  const fabAttachments = document.getElementById('fab-attachments');

  let attachments = [];

  // Toggle panel
  fabButton.addEventListener('click', () => {
    fabPanel.classList.toggle('open');
    if (fabPanel.classList.contains('open')) {
      fabInput.focus();
    }
  });

  fabClose.addEventListener('click', () => {
    fabPanel.classList.remove('open');
  });

  // Send message
  function sendMessage() {
    const text = fabInput.value.trim();
    if (!text && attachments.length === 0) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'fab-message user';
    messageDiv.innerHTML = `<div class="message-content">${text}</div>`;
    
    if (attachments.length > 0) {
      const attachmentsDiv = document.createElement('div');
      attachmentsDiv.className = 'message-attachments';
      attachments.forEach(att => {
        if (att.type.startsWith('image/')) {
          attachmentsDiv.innerHTML += `<img src="${att.data}" alt="attachment" />`;
        } else {
          attachmentsDiv.innerHTML += `<div class="file-attachment">📎 ${att.name}</div>`;
        }
      });
      messageDiv.appendChild(attachmentsDiv);
    }

    fabMessages.appendChild(messageDiv);
    fabMessages.scrollTop = fabMessages.scrollHeight;

    // Send to background script
    chrome.runtime.sendMessage({
      type: 'SEND_MESSAGE',
      message: text,
      attachments: attachments,
      url: window.location.href
    });

    fabInput.value = '';
    attachments = [];
    fabAttachments.innerHTML = '';
  }

  fabSend.addEventListener('click', sendMessage);
  fabInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Attach file
  fabAttach.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => handleFiles(e.target.files);
    input.click();
  });

  // Take screenshot
  fabScreenshot.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
  });

  // Paste from clipboard
  fabPaste.addEventListener('click', async () => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const reader = new FileReader();
            reader.onload = (e) => addAttachment(e.target.result, 'image.png', type);
            reader.readAsDataURL(blob);
          } else if (type === 'text/plain') {
            const blob = await item.getType(type);
            const text = await blob.text();
            fabInput.value += text;
          }
        }
      }
    } catch (err) {
      console.log('Clipboard paste failed:', err);
    }
  });

  // Handle file attachments
  function handleFiles(files) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => addAttachment(e.target.result, file.name, file.type);
      reader.readAsDataURL(file);
    });
  }

  function addAttachment(data, name, type) {
    attachments.push({ data, name, type });
    const attDiv = document.createElement('div');
    attDiv.className = 'attachment-preview';
    if (type.startsWith('image/')) {
      attDiv.innerHTML = `<img src="${data}" alt="${name}" /><button onclick="this.parentElement.remove()">×</button>`;
    } else {
      attDiv.innerHTML = `<span>📎 ${name}</span><button onclick="this.parentElement.remove()">×</button>`;
    }
    fabAttachments.appendChild(attDiv);
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SCREENSHOT_RESULT') {
      addAttachment(msg.data, 'screenshot.png', 'image/png');
    }
    if (msg.type === 'BOT_RESPONSE') {
      const messageDiv = document.createElement('div');
      messageDiv.className = 'fab-message bot';
      messageDiv.innerHTML = `<div class="message-content">${msg.message}</div>`;
      fabMessages.appendChild(messageDiv);
      fabMessages.scrollTop = fabMessages.scrollHeight;
    }
  });
})();