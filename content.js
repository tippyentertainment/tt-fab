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
    <button id="fab-button">
      <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="TaskingBot">
    </button>
  `;

  document.body.appendChild(fab);

  // Toggle FAB
  document.getElementById('fab-button').addEventListener('click', () => {
    isOpen = !isOpen;
    if (isOpen) {
      showChat();
    } else {
      hideChat();
    }
  });

  function showChat() {
    // Open side panel
    chrome.runtime.sendMessage({ action: 'openSidePanel' });
  }

  function hideChat() {
    // Close side panel
    chrome.runtime.sendMessage({ action: 'closeSidePanel' });
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureScreenshot') {
      // Capture visible tab
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        sendResponse({ screenshot: dataUrl });
      });
      return true;
    }
  });
})();