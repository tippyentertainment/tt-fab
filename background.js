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
    // forward to TaskingBot endpoint
    console.log('background: sending to AI', request.payload);
    fetch('https://tasking.tech/taskingbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.payload)
    })
    .then(async (r) => {
      const text = await r.text();
      console.log('background: raw response text', text);
      try {
        const data = JSON.parse(text);
        sendResponse({ result: data });
      } catch (parseErr) {
        console.error('Background parse error, raw response:', text);
        sendResponse({ error: 'Invalid JSON response: ' + parseErr.message + ' - ' + text });
      }
    })
    .catch(err => {
      console.error('background fetch error', err);
      sendResponse({ error: err.message });
    });
    return true;
  }
});