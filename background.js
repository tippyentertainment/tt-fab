// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Handle messages from sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const windowId = tabs && tabs[0] ? tabs[0].windowId : chrome.windows.WINDOW_ID_CURRENT;
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        if (!dataUrl) {
          sendResponse({ error: 'No screenshot data returned.' });
          return;
        }
        sendResponse({ screenshot: dataUrl });
      });
    });
    return true;
  }

  if (request.action === 'sendToAI') {
    console.log('background sendToAI payload', request.payload);
    const tryUrls = ['https://tasking.tech/api/bridge'];
    (async () => {
      let lastError;
      const sessionToken = await getTaskingSessionToken();
      const authHeader = sessionToken ? `Bearer ${sessionToken}` : '';
      for (const url of tryUrls) {
        try {
          const resp = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(authHeader ? { Authorization: authHeader } : {}),
            },
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

async function getTaskingSessionToken() {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: 'https://tasking.tech', name: 'tasking_session' }, (cookie) => {
      resolve(cookie?.value || null);
    });
  });
}
