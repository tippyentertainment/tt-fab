// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Handle messages from sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ screenshot: dataUrl });
    });
    return true;
  }

  if (request.action === 'sendToAI') {
    console.log('background sendToAI payload', request.payload);
    const tryUrls = [
      'https://tasking.tech/taskingbot/api',
      'https://tasking.tech/taskingbot',
    ];
    (async () => {
      let lastError;
      for (const url of tryUrls) {
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.payload),
          });
          const data = await resp.json();
          console.log('background received response', url, data);
          sendResponse({ result: data });
          return;
        } catch (err) {
          console.warn('background fetch failed for', url, err);
          lastError = err;
        }
      }
      sendResponse({ error: lastError ? lastError.message : 'fetch failed' });
    })();
    return true;
  }
});