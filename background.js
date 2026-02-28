// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Handle messages from sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 }, (dataUrl) => {
      sendResponse({ screenshot: dataUrl });
    });
    return true;
  }
  if (request.action === 'sendToAI') {
    console.log('background: sending to AI', request.payload);
    const base = 'https://tasking.tech';
    const candidates = [
      '/taskingbot/api/chat',
      '/api/chat',
      '/taskingbot',
      '/api/taskingbot/chat',
      '/taskingbot/chat'
    ];
    (async function tryPaths(idx) {
      if (idx >= candidates.length) {
        sendResponse({ error: 'all endpoints failed' });
        return;
      }
      const url = base + candidates[idx];
      console.log('background: trying endpoint', url);
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request.payload)
        });
        const text = await r.text();
        console.log('background: response from', url, r.status);
        if (r.status === 404) {
          // try next
          return tryPaths(idx + 1);
        }
        if (!r.ok) {
          console.error('background failed status', r.status, text);
          sendResponse({ error: 'status ' + r.status + ' - ' + text });
          return;
        }
        try {
          const data = JSON.parse(text);
          sendResponse({ result: data });
        } catch (parseErr) {
          console.error('Background parse error, raw response:', text);
          sendResponse({ error: 'Invalid JSON response: ' + parseErr.message + ' - ' + text });
        }
      } catch (err) {
        console.error('background fetch error', err);
        sendResponse({ error: err.message });
      }
    })(0);
    return true;
  }
});