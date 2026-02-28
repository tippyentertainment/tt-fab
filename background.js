// Background service worker for TaskingBot FAB

chrome.runtime.onInstalled.addListener(() => {
  console.log('TaskingBot FAB installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEND_MESSAGE') {
    // Forward to tasking.tech API
    fetch('https://tasking.tech/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg.message,
        attachments: msg.attachments,
        url: msg.url,
        timestamp: Date.now()
      })
    })
    .then(res => res.json())
    .then(data => {
      // Send response back to content script
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'BOT_RESPONSE',
        message: data.response || 'Message received!'
      });
    })
    .catch(err => {
      console.error('Error sending message:', err);
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'BOT_RESPONSE',
        message: 'Error connecting to TaskingBot. Please try again.'
      });
    });
  }

  if (msg.type === 'TAKE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'SCREENSHOT_RESULT',
        data: dataUrl
      });
    });
  }
});