// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Handle screenshot requests from sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 }, (dataUrl) => {
      sendResponse({ screenshot: dataUrl });
    });
    return true; // Keep channel open for async response
  }
});