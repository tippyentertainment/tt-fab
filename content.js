// Content script - Simple FAB that opens TaskingBot

(function() {
  'use strict';
  
  // Remove existing FAB if present
  const existingFAB = document.getElementById('fab-button');
  if (existingFAB) existingFAB.remove();

  // Create FAB
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
    transition: transform 0.2s;
    font-weight: 300;
  `;
  
  fab.addEventListener('click', () => {
    const title = prompt('Enter task title:');
    if (title) {
      const desc = prompt('Enter description (optional):') || '';
      const message = `Create task: ${title}\n\n${desc}\n\nSource: ${document.title}\nURL: ${window.location.href}`;
      
      // Open TaskingBot in new tab with message
      window.open(`https://tasking.tech?message=${encodeURIComponent(message)}`, '_blank');
    }
  });
  
  document.body.appendChild(fab);
})();