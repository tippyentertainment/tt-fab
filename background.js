// TaskingBot FAB - Background Service Worker
// Handles screenshots, screen sharing, and communication with tasking.tech

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Listen for messages from sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    captureScreenshot().then(sendResponse);
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'startScreenShare') {
    startScreenShare().then(sendResponse);
    return true;
  }
  
  if (request.action === 'stopScreenShare') {
    stopScreenShare().then(sendResponse);
    return true;
  }
});

// Capture visible tab as screenshot
async function captureScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
      quality: 90
    });
    return { success: true, dataUrl };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Screen sharing (requires user permission via content script)
async function startScreenShare() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Inject content script to request screen share
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: requestScreenShare
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function requestScreenShare() {
  navigator.mediaDevices.getDisplayMedia({ video: true })
    .then(stream => {
      window.screenShareStream = stream;
      // Send stream info to sidepanel
      chrome.runtime.sendMessage({ action: 'screenShareStarted', streamId: stream.id });
    })
    .catch(err => {
      chrome.runtime.sendMessage({ action: 'screenShareError', error: err.message });
    });
}

async function stopScreenShare() {
  try {
    if (window.screenShareStream) {
      window.screenShareStream.getTracks().forEach(track => track.stop());
      window.screenShareStream = null;
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
