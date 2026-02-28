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
    fetch('https://tasking.tech/taskingbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.payload)
    })
    .then(r => r.json())
    .then(data => sendResponse({ result: data }))
    .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});