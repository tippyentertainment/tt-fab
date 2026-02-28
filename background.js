// Background script - TaskingBot FAB

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendMessage') {
    handleTaskingBotMessage(request.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

async function handleTaskingBotMessage(data) {
  const { message, attachments, url, timestamp } = data;
  
  // Store locally first (always works)
  const task = {
    id: Date.now(),
    message,
    attachments: attachments || [],
    url,
    timestamp,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  // Save to chrome.storage
  const result = await chrome.storage.local.get(['tasks']);
  const tasks = result.tasks || [];
  tasks.push(task);
  await chrome.storage.local.set({ tasks });
  
  // Try to send to TaskingBot API
  try {
    const response = await fetch('https://tasking.tech/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        attachments,
        context: { url, timestamp },
        userId: 'fab-user'
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    // Update task with response
    task.status = 'completed';
    task.response = result.response || result.message || 'Task received!';
    
    // Update storage
    const updated = await chrome.storage.local.get(['tasks']);
    const taskIndex = updated.tasks.findIndex(t => t.id === task.id);
    if (taskIndex !== -1) {
      updated.tasks[taskIndex] = task;
      await chrome.storage.local.set({ tasks: updated.tasks });
    }
    
    return { response: task.response };
  } catch (error) {
    console.error('API Error:', error);
    // Return local success - task is saved locally
    return { response: '✅ Task saved locally! Will sync when online.' };
  }
}

// Context menu for right-click
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'taskingbot-fab-menu',
    title: 'TaskingBot FAB',
    contexts: ['all']
  });
  
  chrome.contextMenus.create({
    id: 'toggle-panel',
    parentId: 'taskingbot-fab-menu',
    title: 'Toggle Panel',
    contexts: ['all']
  });
  
  chrome.contextMenus.create({
    id: 'take-screenshot',
    parentId: 'taskingbot-fab-menu',
    title: 'Take Screenshot',
    contexts: ['all']
  });
  
  chrome.contextMenus.create({
    id: 'paste-clipboard',
    parentId: 'taskingbot-fab-menu',
    title: 'Paste from Clipboard',
    contexts: ['all']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'toggle-panel') {
    chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
  } else if (info.menuItemId === 'take-screenshot') {
    chrome.tabs.sendMessage(tab.id, { action: 'takeScreenshot' });
  } else if (info.menuItemId === 'paste-clipboard') {
    chrome.tabs.sendMessage(tab.id, { action: 'pasteClipboard' });
  }
});