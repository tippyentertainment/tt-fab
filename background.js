// Background service worker - Opens TaskingBot with pre-filled task

chrome.runtime.onInstalled.addListener(() => {
  console.log('FAB Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createTask') {
    // Build the task message
    const taskMessage = `Create task: ${request.title}${request.description ? '\n\n' + request.description : ''}\n\nSource: ${request.pageTitle}\nURL: ${request.url}`;
    
    // Open TaskingBot with the message pre-filled
    const taskingBotUrl = `https://tasking.tech?message=${encodeURIComponent(taskMessage)}`;
    
    chrome.tabs.create({ url: taskingBotUrl }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });
    
    return true; // Keep the message channel open for async response
  }
  
  if (request.action === 'getTabInfo') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }
});