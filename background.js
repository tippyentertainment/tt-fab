// Background service worker - TaskingBot API integration

const TASKINGBOT_API = 'https://tasking.tech/api/tasks';

chrome.runtime.onInstalled.addListener(() => {
  console.log('FAB Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createTask') {
    createTaskingBotTask(request.title, request.description, request.url, request.pageTitle)
      .then(result => sendResponse({ success: true, task: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'getTabInfo') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      sendResponse({ tab: tabs[0] });
    });
    return true;
  }
});

async function createTaskingBotTask(title, description, url, pageTitle) {
  const taskData = {
    title: title,
    description: `${description}\n\nSource: ${pageTitle}\nURL: ${url}`,
    priority: 'medium',
    status: 'open'
  };
  
  try {
    const response = await fetch(TASKINGBOT_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskData)
    });
    
    if (!response.ok) {
      throw new Error('Failed to create task');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}