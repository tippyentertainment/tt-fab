// Background service worker for FAB extension

chrome.runtime.onInstalled.addListener(() => {
  console.log('FAB Extension installed');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTabInfo') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true; // Required for async sendResponse
  }
});