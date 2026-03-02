// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// ── Autonomous Action Queue Polling ──────────────────────────────────
// Polls tasking.tech for pending actions from autonomous tasks.
// When the AI runs a task and needs browser automation, actions are
// queued in the DB. This loop picks them up, executes them, and
// posts results back.

const QUEUE_POLL_INTERVAL_MS = 2000;
const QUEUE_API_BASE = 'https://tasking.tech/_api/extension';
let queuePollingActive = false;
let queuePollTimer = null;
let lastQueueActionTabId = null; // Track tab opened by navigate/open_tab for subsequent actions

async function pollActionQueue() {
  if (queuePollingActive) return;
  queuePollingActive = true;

  try {
    const sessionToken = await getTaskingSessionToken();
    if (!sessionToken) {
      // Not logged in — skip this poll
      return;
    }

    const resp = await fetch(`${QUEUE_API_BASE}/queue`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (resp.status === 204) {
      // No pending actions — nothing to do
      return;
    }

    if (resp.status === 401) {
      // Not authenticated — stop polling until next session
      console.log('[Queue] Not authenticated, will retry next cycle');
      return;
    }

    if (!resp.ok) {
      console.warn('[Queue] Poll failed:', resp.status);
      return;
    }

    const data = await resp.json();
    if (!data || !data.id || !Array.isArray(data.actions)) {
      return;
    }

    console.log(`[Queue] Received ${data.actions.length} action(s) for queue ${data.id}`);

    // Reset tab tracking for this batch
    lastQueueActionTabId = null;

    const results = [];
    for (const action of data.actions) {
      const result = await executeQueuedAction(action);
      results.push(result);
    }

    // Build result summary
    const resultSummary = results.map((r) => {
      const parts = [
        `id=${r.id || 'n/a'}`,
        `type=${r.type || 'unknown'}`,
        `status=${r.status || 'unknown'}`,
      ];
      if (r.error) parts.push(`error="${r.error}"`);
      if (r.data) {
        // Include data but limit size (except for screenshot base64)
        const dataStr = JSON.stringify(r.data);
        if (dataStr.length > 5000 && !r.data.image_base64) {
          parts.push(`data=${dataStr.substring(0, 5000)}...`);
        } else {
          parts.push(`data=${dataStr}`);
        }
      }
      return parts.join(' ');
    }).join('\n');

    const finalResult = `[ACTION_RESULTS]\n${resultSummary}\n[/ACTION_RESULTS]`;
    const finalStatus = results.every((r) => r.status === 'success') ? 'completed' : 'failed';

    // POST result back
    await fetch(`${QUEUE_API_BASE}/result`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: data.id,
        result: finalResult,
        status: finalStatus,
      }),
    });

    console.log(`[Queue] Posted result for ${data.id}: ${finalStatus}`);
  } catch (err) {
    console.warn('[Queue] Poll error:', err);
  } finally {
    queuePollingActive = false;
  }
}

async function executeQueuedAction(action) {
  const type = normalizeQueueActionType(action);
  const resultBase = { id: action.id || null, type: type || 'unknown' };

  try {
    if (type === 'wait') {
      const ms = typeof action.ms === 'number' ? action.ms : 500;
      await new Promise((resolve) => setTimeout(resolve, ms));
      return { ...resultBase, status: 'success', data: { waitedMs: ms } };
    }

    if (type === 'screenshot') {
      const screenshot = await captureScreenshotAsync();
      if (!screenshot) {
        return { ...resultBase, status: 'failed', error: 'Screenshot capture failed' };
      }
      // Extract base64 from data URL for vision model passthrough
      const base64Match = screenshot.match(/^data:[^;]+;base64,(.+)$/);
      const imageBase64 = base64Match ? base64Match[1] : null;
      return {
        ...resultBase,
        status: 'success',
        data: { screenshot: true, image_base64: imageBase64 },
      };
    }

    if (type === 'screen_capture') {
      // Capture a frame from the active screen share (getDisplayMedia stream)
      // This sees the full desktop/window, not just the Chrome tab
      const frameResult = await sendToSidePanel({ action: 'captureScreenShareFrame' });
      if (!frameResult || frameResult.error) {
        // Screen share not active — fall back to tab screenshot
        console.log('[Queue] No active screen share, falling back to tab screenshot');
        const tabScreenshot = await captureScreenshotAsync();
        if (!tabScreenshot) {
          return { ...resultBase, status: 'failed', error: frameResult?.error || 'No screen share active and tab screenshot failed' };
        }
        const tabB64 = tabScreenshot.match(/^data:[^;]+;base64,(.+)$/);
        return {
          ...resultBase,
          status: 'success',
          data: { screenshot: true, source: 'tab_fallback', image_base64: tabB64 ? tabB64[1] : null },
        };
      }
      const b64 = frameResult.dataUrl ? frameResult.dataUrl.match(/^data:[^;]+;base64,(.+)$/) : null;
      return {
        ...resultBase,
        status: 'success',
        data: { screenshot: true, source: 'screen_share', image_base64: b64 ? b64[1] : null },
      };
    }

    if (type === 'open_tab' || type === 'navigate') {
      if (!action.url) {
        return { ...resultBase, status: 'failed', error: 'Missing url' };
      }
      // Always open in a new tab to avoid navigating the tasking.tech tab away
      // (which would kill the content script and break subsequent actions)
      const newTab = await new Promise((resolve, reject) => {
        chrome.tabs.create({ url: action.url, active: true }, (tab) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(tab);
        });
      });
      // Track this tab so subsequent actions (screenshot, click, etc.) target it
      lastQueueActionTabId = newTab.id;

      // Wait for page to finish loading (up to 15s)
      await new Promise((resolve) => {
        const onUpdate = (tabId, info) => {
          if (tabId === newTab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(onUpdate);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(onUpdate);
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(onUpdate);
          resolve();
        }, 15000);
      });
      return { ...resultBase, status: 'success', data: { url: action.url, tabId: newTab.id } };
    }

    // All other actions (click, type, scroll, extract, submit, get_console_logs, get_network_logs)
    // Forward to content script — prefer the tab opened by a previous navigate/open_tab
    const response = lastQueueActionTabId
      ? await sendToTab(lastQueueActionTabId, { action: 'performActions', actions: [action] })
      : await sendToActiveTab({ action: 'performActions', actions: [action] });
    if (!response || response.error) {
      return {
        ...resultBase,
        status: 'failed',
        error: response?.error || 'No response from content script',
      };
    }
    const result = response.results && response.results[0] ? response.results[0] : null;
    if (!result) {
      return { ...resultBase, status: 'failed', error: 'No action result returned' };
    }
    if (!result.ok) {
      return {
        ...resultBase,
        status: 'failed',
        error: result.error || 'Action failed',
        data: result.data || null,
      };
    }
    return { ...resultBase, status: 'success', data: result.data || null };
  } catch (err) {
    return {
      ...resultBase,
      status: 'failed',
      error: err && err.message ? err.message : 'Action execution error',
    };
  }
}

function normalizeQueueActionType(action) {
  const raw = String(action?.type || action?.action || '').toLowerCase();
  if (raw === 'tap' || raw === 'press') return 'click';
  if (raw === 'input') return 'type';
  if (raw === 'goto' || raw === 'open') return 'navigate';
  if (raw === 'open_tab' || raw === 'open-tab' || raw === 'open_url' || raw === 'open_new_tab') return 'open_tab';
  if (raw === 'console_logs' || raw === 'get_console_log' || raw === 'console') return 'get_console_logs';
  if (raw === 'network_logs' || raw === 'get_network_log' || raw === 'network') return 'get_network_logs';
  if (raw === 'screen_capture' || raw === 'screen-capture' || raw === 'screencapture' || raw === 'capture_screen' || raw === 'full_screenshot' || raw === 'desktop_screenshot') return 'screen_capture';
  if (raw === 'select' || raw === 'select_option' || raw === 'choose') return 'select';
  if (raw === 'get_form_fields' || raw === 'get_form' || raw === 'read_form' || raw === 'form_fields') return 'get_form_fields';
  if (raw === 'get_page_info' || raw === 'page_info' || raw === 'read_page') return 'get_page_info';
  return raw;
}

function captureScreenshotAsync() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const windowId = tabs && tabs[0] ? tabs[0].windowId : chrome.windows.WINDOW_ID_CURRENT;
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.warn('[Queue] Screenshot failed:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(dataUrl || null);
      });
    });
  });
}

// Start polling when extension loads
function startQueuePolling() {
  if (queuePollTimer) return;
  queuePollTimer = setInterval(pollActionQueue, QUEUE_POLL_INTERVAL_MS);
  console.log('[Queue] Polling started');
}

function stopQueuePolling() {
  if (queuePollTimer) {
    clearInterval(queuePollTimer);
    queuePollTimer = null;
    console.log('[Queue] Polling stopped');
  }
}

// Start polling immediately
startQueuePolling();

// Also send heartbeat to register the extension session
async function sendHeartbeat() {
  try {
    const sessionToken = await getTaskingSessionToken();
    if (!sessionToken) return;

    const tabs = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve);
    });
    const activeTab = tabs && tabs[0];

    await fetch(`${QUEUE_API_BASE}/session`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        extension_id: chrome.runtime.id,
        capabilities: [
          'screenshot', 'screen_capture', 'navigate', 'open_tab',
          'click', 'type', 'select', 'submit', 'scroll', 'extract',
          'get_form_fields', 'get_page_info',
          'get_console_logs', 'get_network_logs', 'wait',
        ],
        tab_url: activeTab?.url || null,
        tab_title: activeTab?.title || null,
      }),
    });
  } catch (err) {
    // Non-critical
  }
}

// Heartbeat every 15 seconds to keep session alive
setInterval(sendHeartbeat, 15000);
sendHeartbeat(); // Send immediately on load

// ── Message Handlers ─────────────────────────────────────────────────

// Handle messages from sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreenshot') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const windowId = tabs && tabs[0] ? tabs[0].windowId : chrome.windows.WINDOW_ID_CURRENT;
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }
        if (!dataUrl) {
          sendResponse({ error: 'No screenshot data returned.' });
          return;
        }
        sendResponse({ screenshot: dataUrl });
      });
    });
    return true;
  }

  if (request.action === 'sendToAI') {
    console.log('background sendToAI payload', request.payload);
    const tryUrls = ['https://tasking.tech/api/bridge'];
    (async () => {
      let lastError;
      const sessionToken = await getTaskingSessionToken();
      const authHeader = sessionToken ? `Bearer ${sessionToken}` : '';

      // Inject current tab context so the bridge auto-registers the session
      // with the correct URL/title (AI needs this to know what page the user is on)
      const activeTabs = await new Promise((resolve) => {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve);
      });
      const currentTab = activeTabs && activeTabs[0];
      const enrichedPayload = {
        ...request.payload,
        tab_url: currentTab?.url || null,
        tab_title: currentTab?.title || null,
      };

      for (const url of tryUrls) {
        try {
          const resp = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              ...(authHeader ? { Authorization: authHeader } : {}),
            },
            body: JSON.stringify(enrichedPayload),
          });
          let data = null;
          try {
            data = await resp.json();
          } catch (err) {
            const text = await resp.text().catch(() => '');
            data = { error: text || 'Invalid response' };
          }
          console.log('background received response', url, data);
          sendResponse({ result: data, status: resp.status, ok: resp.ok });
          return;
        } catch (err) {
          console.warn('background fetch failed for', url, err);
          lastError = err;
        }
      }
      sendResponse({ error: lastError ? lastError.message : 'fetch failed' });
    })();
    return true;
  }

  if (request.action === 'performActions') {
    (async () => {
      try {
        const actions = request.actions || [];
        const results = [];
        // Handle each action — intercept navigate/open_tab to open new tabs
        for (const action of actions) {
          const type = normalizeQueueActionType(action);
          if (type === 'navigate' || type === 'open_tab') {
            if (!action.url) {
              results.push({ id: action.id, type, ok: false, error: 'Missing url' });
              continue;
            }
            const tab = await new Promise((resolve) => {
              chrome.tabs.create({ url: action.url, active: true }, resolve);
            });
            results.push({ id: action.id, type, ok: true, data: { url: action.url, tabId: tab.id } });
          } else {
            // Forward to content script on active tab
            const resp = await sendToActiveTab({ action: 'performActions', actions: [action] });
            if (resp && resp.results) {
              results.push(...resp.results);
            } else {
              results.push({ id: action.id, type, ok: false, error: resp?.error || 'No response' });
            }
          }
        }
        sendResponse({ results });
      } catch (err) {
        sendResponse({ error: err && err.message ? err.message : 'Failed to perform actions' });
      }
    })();
    return true;
  }

  if (request.action === 'getLogs') {
    sendToActiveTab({ action: 'getLogs' })
      .then((response) => sendResponse(response || {}))
      .catch((err) =>
        sendResponse({ error: err && err.message ? err.message : 'Failed to get logs' }),
      );
    return true;
  }

  if (request.action === 'openTab') {
    if (!request.url) {
      sendResponse({ error: 'Missing url' });
      return;
    }
    chrome.tabs.create({ url: request.url, active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ ok: true, tabId: tab?.id || null });
    });
    return true;
  }

  if (request.action === 'getActiveTabInfo') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) {
        sendResponse({ url: null, title: null });
        return;
      }
      sendResponse({ url: tab.url || null, title: tab.title || null });
    });
    return true;
  }

  if (request.action === 'getSessionToken') {
    getTaskingSessionToken().then((token) => {
      sendResponse({ token });
    });
    return true;
  }
});

async function getTaskingSessionToken() {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: 'https://tasking.tech', name: 'tasking_session' }, (cookie) => {
      resolve(cookie?.value || null);
    });
  });
}

function sendToActiveTab(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        reject(new Error('No active tab found.'));
        return;
      }
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  });
}

// Send message to a specific tab by ID
function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

// Send message to the sidepanel (extension page) via chrome.runtime.sendMessage.
// The sidepanel listens with chrome.runtime.onMessage.
function sendToSidePanel(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Queue] sendToSidePanel error:', chrome.runtime.lastError.message);
        resolve(null);
        return;
      }
      resolve(response || null);
    });
  });
}
