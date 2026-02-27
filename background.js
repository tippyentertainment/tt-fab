// Background service worker - TaskingBot API integration

chrome.runtime.onInstalled.addListener(() => {
  console.log('FAB Extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'createTask') {
    createTask(request.title, request.description, request.url, request.pageTitle)
      .then(result => sendResponse({ success: true, task: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

async function createTask(title, description, url, pageTitle) {
  // Use TaskingBot's internal API
  const response = await fetch('https://tasking.tech/api/tasks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // This includes your session cookie
    body: JSON.stringify({
      title: title,
      description: `${description}\n\nSource: ${pageTitle}\nURL: ${url}`,
      priority: 'medium'
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to create task');
  }
  
  return await response.json();
}