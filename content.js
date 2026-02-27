// Content script - FAB with TaskingBot integration

function createFAB() {
  // Remove existing FAB if present
  const existingFAB = document.getElementById('fab-button');
  if (existingFAB) existingFAB.remove();

  const fab = document.createElement('div');
  fab.id = 'fab-button';
  fab.innerHTML = '+';
  fab.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 56px;
    height: 56px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    z-index: 999999;
    transition: transform 0.2s, box-shadow 0.2s;
    font-weight: 300;
    user-select: none;
  `;
  
  fab.addEventListener('mouseenter', () => {
    fab.style.transform = 'scale(1.1) rotate(90deg)';
    fab.style.boxShadow = '0 6px 16px rgba(102, 126, 234, 0.6)';
  });
  
  fab.addEventListener('mouseleave', () => {
    fab.style.transform = 'scale(1) rotate(0deg)';
    fab.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
  });
  
  fab.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showTaskModal();
  });
  
  document.body.appendChild(fab);
}

function showTaskModal() {
  const existingModal = document.getElementById('fab-task-modal');
  if (existingModal) {
    existingModal.remove();
    return;
  }
  
  const modal = document.createElement('div');
  modal.id = 'fab-task-modal';
  modal.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999999;">
      <div style="background: white; padding: 24px; border-radius: 12px; width: 400px; max-width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.2);">
        <h2 style="margin: 0 0 16px 0; color: #333; font-size: 20px;">Quick Task</h2>
        <input type="text" id="fab-task-title" placeholder="Task title..." style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; margin-bottom: 12px; box-sizing: border-box;" />
        <textarea id="fab-task-desc" placeholder="Description (optional)..." style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 14px; margin-bottom: 16px; min-height: 80px; resize: vertical; box-sizing: border-box;"></textarea>
        <div style="display: flex; gap: 8px;">
          <button id="fab-cancel" style="flex: 1; padding: 12px; background: #f5f5f5; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">Cancel</button>
          <button id="fab-create" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">Create Task</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const titleInput = document.getElementById('fab-task-title');
  titleInput.focus();
  
  document.getElementById('fab-cancel').addEventListener('click', () => {
    modal.remove();
  });
  
  document.getElementById('fab-create').addEventListener('click', () => {
    const title = document.getElementById('fab-task-title').value.trim();
    const desc = document.getElementById('fab-task-desc').value.trim();
    
    if (!title) {
      alert('Please enter a task title');
      return;
    }
    
    // Show loading state
    const createBtn = document.getElementById('fab-create');
    createBtn.textContent = 'Creating...';
    createBtn.disabled = true;
    
    chrome.runtime.sendMessage({
      action: 'createTask',
      title: title,
      description: desc,
      url: window.location.href,
      pageTitle: document.title
    }, (response) => {
      if (response && response.success) {
        modal.remove();
        showNotification('✓ Task created successfully!');
      } else {
        createBtn.textContent = 'Create Task';
        createBtn.disabled = false;
        alert('Failed to create task: ' + (response?.error || 'Unknown error'));
      }
    });
  });
  
  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escHandler);
    }
  });
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 90px;
    right: 20px;
    background: #4caf50;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 9999998;
    font-size: 14px;
    font-weight: 500;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// Listen for toggle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleFab') {
    const fab = document.getElementById('fab-button');
    if (fab) {
      fab.style.display = fab.style.display === 'none' ? 'flex' : 'none';
      sendResponse({ visible: fab.style.display !== 'none' });
    } else {
      sendResponse({ visible: false });
    }
  }
  return true;
});

// Initialize FAB
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createFAB);
} else {
  createFAB();
}