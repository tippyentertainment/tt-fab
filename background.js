// Background service worker for TaskingBot FAB

chrome.runtime.onInstalled.addListener(() => {
  console.log('TaskingBot FAB installed');
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SEND_MESSAGE') {
    // Store task locally first
    const task = {
      id: Date.now().toString(),
      message: msg.message,
      attachments: msg.attachments,
      url: msg.url,
      timestamp: Date.now(),
      status: 'pending'
    };
    
    // Save to chrome.storage
    chrome.storage.local.get(['tasks'], (result) => {
      const tasks = result.tasks || [];
      tasks.push(task);
      chrome.storage.local.set({ tasks });
    });
    
    // Try to sync with tasking.tech API
    fetch('https://tasking.tech/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg.message,
        attachments: msg.attachments,
        url: msg.url,
        timestamp: Date.now()
      })
    })
    .then(res => {
      if (res.ok) return res.json();
      throw new Error('API not available');
    })
    .then(data => {
      // Update task status
      chrome.storage.local.get(['tasks'], (result) => {
        const tasks = result.tasks || [];
        const idx = tasks.findIndex(t => t.id === task.id);
        if (idx !== -1) {
          tasks[idx].status = 'synced';
          tasks[idx].remoteId = data.id;
          chrome.storage.local.set({ tasks });
        }
      });
      
      // Send response back to content script
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'BOT_RESPONSE',
        message: '✅ Task created and synced!'
      });
    })
    .catch(err => {
      console.log('Task stored locally (API unavailable):', err);
      // Still confirm to user - task is saved locally
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'BOT_RESPONSE',
        message: '✅ Task saved locally! Will sync when online.'
      });
    });
    
    return true; // Keep channel open for async response
  }

  if (msg.type === 'GET_TASKS') {
    chrome.storage.local.get(['tasks'], (result) => {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'TASKS_LIST',
        tasks: result.tasks || []
      });
    });
    return true;
  }

  if (msg.type === 'TAKE_SCREENSHOT') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      chrome.tabs.sendMessage(sender.tab.id, {
        type: 'SCREENSHOT_RESULT',
        data: dataUrl
      });
    });
    return true;
  }
});