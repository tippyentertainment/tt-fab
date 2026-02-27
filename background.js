// Background service worker - Simple approach

chrome.runtime.onInstalled.addListener(() => {
  console.log('FAB Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createTask') {
    // Just open TaskingBot with a pre-filled message
    const message = `Create task: ${request.title}${request.description ? '\n\n' + request.description : ''}\n\nSource: ${request.pageTitle}\nURL: ${request.url}`;
    
    // Open TaskingBot in a new tab
    chrome.tabs.create({ 
      url: `https://tasking.tech?message=${encodeURIComponent(message)}` 
    }, (tab) => {
      sendResponse({ success: true });
    });
    
    return true;
  }
});