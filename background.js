// TaskingBot FAB - Background Service Worker
// Handles API communication with tasking.tech

const API_BASE = 'https://tasking.tech';

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToTaskingBot') {
    handleTaskingBotMessage(request.data)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

async function handleTaskingBotMessage(data) {
  const { message, attachments, url, screenshot } = data;
  
  // Try to send to tasking.tech API
  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        attachments,
        url,
        timestamp: Date.now(),
        userId: 'fab-user'
      })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('[FAB] API error:', error);
    
    // Fallback: Store locally and return friendly message
    const task = {
      id: Date.now().toString(),
      message,
      attachments,
      url,
      screenshot,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // Store locally
    const stored = await chrome.storage.local.get(['pendingTasks']);
    const pendingTasks = stored.pendingTasks || [];
    pendingTasks.push(task);
    await chrome.storage.local.set({ pendingTasks });
    
    return {
      response: '✅ Task saved locally! Will sync when online.',
      taskId: task.id
    };
  }
}

// Context menu for right-click on FAB
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'fab-context-menu',
    title: 'TaskingBot FAB',
    contexts: ['all']
  });
  
  // Sub-menu items
  chrome.contextMenus.create({
    id: 'fab-toggle',
    parentId: 'fab-context-menu',
    title: '🔘 Toggle Panel'
  });
  chrome.contextMenus.create({
    id: 'fab-screenshot',
    parentId: 'fab-context-menu',
    title: '📸 Take Screenshot'
  });
  chrome.contextMenus.create({
    id: 'fab-clipboard',
    parentId: 'fab-context-menu',
    title: '📋 Paste from Clipboard'
  });
  chrome.contextMenus.create({
    id: 'fab-separator',
    parentId: 'fab-context-menu',
    type: 'separator'
  });
  chrome.contextMenus.create({
    id: 'fab-hide',
    parentId: 'fab-context-menu',
    title: '👁️ Hide for 1 hour'
  });
  chrome.contextMenus.create({
    id: 'fab-disable',
    parentId: 'fab-context-menu',
    title: '⚙️ Disable on this site'
  });
  chrome.contextMenus.create({
    id: 'fab-separator2',
    parentId: 'fab-context-menu',
    type: 'separator'
  });
  chrome.contextMenus.create({
    id: 'fab-off',
    parentId: 'fab-context-menu',
    title: '❌ Turn Off'
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'fab-toggle':
      chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
      break;
    case 'fab-screenshot':
      chrome.tabs.sendMessage(tab.id, { action: 'takeScreenshot' });
      break;
    case 'fab-clipboard':
      chrome.tabs.sendMessage(tab.id, { action: 'pasteFromClipboard' });
      break;
    case 'fab-hide':
      chrome.storage.local.set({ fabHiddenUntil: Date.now() + 3600000 });
      chrome.tabs.sendMessage(tab.id, { action: 'hideFAB' });
      break;
    case 'fab-disable':
      chrome.storage.local.get(['disabledSites'], (result) => {
        const disabledSites = result.disabledSites || [];
        const url = new URL(tab.url);
        if (!disabledSites.includes(url.hostname)) {
          disabledSites.push(url.hostname);
          chrome.storage.local.set({ disabledSites });
        }
        chrome.tabs.sendMessage(tab.id, { action: 'hideFAB' });
      });
      break;
    case 'fab-off':
      chrome.storage.local.set({ fabEnabled: false });
      chrome.tabs.sendMessage(tab.id, { action: 'hideFAB' });
      break;
  }
});
