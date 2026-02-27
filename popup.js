// Popup script

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggleFab');
  const settingsBtn = document.getElementById('settings');
  const statusDiv = document.getElementById('status');
  
  // Toggle FAB visibility
  toggleBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleFab' }, (response) => {
        if (response && response.visible !== undefined) {
          statusDiv.textContent = `Status: ${response.visible ? 'Visible' : 'Hidden'}`;
        }
      });
    });
  });
  
  // Settings button
  settingsBtn.addEventListener('click', () => {
    statusDiv.textContent = 'Settings coming soon!';
  });
});