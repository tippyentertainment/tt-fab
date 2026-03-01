'use strict';

const USER_AVATAR = chrome.runtime.getURL('icons/user-icon.png');
const USER_AVATAR_FALLBACK = chrome.runtime.getURL('icons/icon32.png');
const TASKINGBOT_AVATAR = chrome.runtime.getURL('icons/taskingbot.png');
const TASKINGBOT_AVATAR_FALLBACK = chrome.runtime.getURL('icons/logo.png');

let conversationHistory = [];

const sendQueue = [];
let isSending = false;
const actionBatches = [];
let isProcessingActions = false;
const MAX_ACTION_LOGS = 50;

let chatContainer;
let messageInput;
let sendBtn;
let screenshotBtn;
let screenShareBtn;
let attachBtn;
let botToggle;
let botDisabledMsg;
let inputContainer;
let loginContainer;
let loginFrame;

const REQUEST_TIMEOUT_MS = 30000;
const TASKING_DOMAIN_HOSTS = ['tasking.tech'];
const TASKING_DOMAIN_SUFFIXES = ['.tasking.tech'];

document.addEventListener('DOMContentLoaded', () => {
  chatContainer = document.getElementById('chat');
  messageInput = document.getElementById('messageInput');
  sendBtn = document.getElementById('sendButton');
  screenshotBtn = document.getElementById('sidebar-screenshot');
  screenShareBtn = document.getElementById('sidebar-share-screen');
  attachBtn = document.getElementById('sidebar-attach');
  botToggle = document.getElementById('botToggle');
  botDisabledMsg = document.getElementById('botDisabledMsg');
  inputContainer = document.getElementById('inputContainer');
  initLoginFrame();
  removeLegacyPreviews();

  if (botToggle) {
    botToggle.addEventListener('change', () => {
      setBotEnabled(botToggle.checked);
    });
    setBotEnabled(botToggle.checked);
  }

  if (messageInput) {
    messageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        if (sendBtn) {
          sendBtn.click();
        }
      }
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      await sendMessage();
    });
  }

  if (screenshotBtn) {
    screenshotBtn.addEventListener('click', async () => {
      await takeScreenshot();
    });
  }

  if (screenShareBtn) {
    screenShareBtn.addEventListener('click', async () => {
      await startScreenShare();
    });
  }

  if (attachBtn) {
    attachBtn.addEventListener('click', () => {
      openFilePicker();
    });
  }

  document.addEventListener('paste', (event) => {
    if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length > 0) {
      const file = event.clipboardData.files[0];
      void handleAttachmentFile(file);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void takeScreenshot();
    }
  });
});

function setBotEnabled(enabled) {
  if (chatContainer) {
    chatContainer.style.display = enabled ? 'flex' : 'none';
  }
  if (inputContainer) {
    inputContainer.style.display = enabled ? 'block' : 'none';
  }
  if (botDisabledMsg) {
    botDisabledMsg.style.display = enabled ? 'none' : 'block';
  }
  if (!enabled) {
    hideLoginFrame();
  }
}

function initLoginFrame() {
  if (loginContainer || !inputContainer) {
    return;
  }
  loginContainer = document.createElement('div');
  loginContainer.id = 'loginContainer';
  loginContainer.style.display = 'none';
  loginContainer.style.flex = '1';
  loginContainer.style.width = '100%';
  loginContainer.style.background = '#0d0d0d';
  loginContainer.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';

  loginFrame = document.createElement('iframe');
  loginFrame.title = 'Tasking.tech Login';
  loginFrame.src = 'https://tasking.tech/login';
  loginFrame.style.border = '0';
  loginFrame.style.width = '100%';
  loginFrame.style.height = '100%';
  loginFrame.style.minHeight = '360px';
  loginFrame.style.background = '#0d0d0d';

  loginContainer.appendChild(loginFrame);

  const parent = inputContainer.parentElement || document.body;
  parent.insertBefore(loginContainer, inputContainer);
}

function showLoginFrame() {
  if (!loginContainer) {
    initLoginFrame();
  }
  if (chatContainer) {
    chatContainer.style.display = 'none';
  }
  if (inputContainer) {
    inputContainer.style.display = 'none';
  }
  if (botDisabledMsg) {
    botDisabledMsg.style.display = 'none';
  }
  if (loginContainer) {
    loginContainer.style.display = 'flex';
  }
}

function hideLoginFrame() {
  if (loginContainer) {
    loginContainer.style.display = 'none';
  }
  if (botToggle && !botToggle.checked) {
    if (botDisabledMsg) botDisabledMsg.style.display = 'block';
    if (chatContainer) chatContainer.style.display = 'none';
    if (inputContainer) inputContainer.style.display = 'none';
    return;
  }
  if (chatContainer) {
    chatContainer.style.display = 'flex';
  }
  if (inputContainer) {
    inputContainer.style.display = 'block';
  }
}

function extractAssistantText(data) {
  if (!data) {
    return 'No response received.';
  }
  if (typeof data === 'string') {
    return data;
  }
  return data.response || data.message || data.text || JSON.stringify(data);
}

async function getUserInfo() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['userId', 'userAvatar'], (result) => {
      resolve({
        userId: result.userId || 'anonymous',
        userAvatar: result.userAvatar || null,
      });
    });
  });
}

async function sendToAI(message, attachment = null) {
  const userInfo = await getUserInfo();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      reject(new Error('Request timed out while sending attachment.'));
    }, REQUEST_TIMEOUT_MS);
    chrome.runtime.sendMessage(
      {
        action: 'sendToAI',
        payload: {
          message,
          history: conversationHistory,
          attachment: attachment || undefined,
          userId: userInfo.userId,
        },
      },
      (response) => {
        if (settled) {
          return;
        }
        clearTimeout(timeoutId);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response && response.result) {
          resolve({
            data: response.result,
            status: typeof response.status === 'number' ? response.status : 200,
            ok: typeof response.ok === 'boolean' ? response.ok : true,
          });
          return;
        }

        reject(new Error(response && response.error ? response.error : 'Unknown error'));
      }
    );
  });
}

function recordConversation(userText, assistantText, hadAttachment = false) {
  const userContent = hadAttachment
    ? `${userText}\n[Image/file was attached with this message]`
    : userText;
  conversationHistory.push({ role: 'user', content: userContent });
  conversationHistory.push({ role: 'assistant', content: assistantText });
}

function enqueueOutgoing(item) {
  if (!item || !item.text) {
    return;
  }
  sendQueue.push(item);
  if (!isSending) {
    void processSendQueue();
  }
}

function dequeueNextItem() {
  const priorityIndex = sendQueue.findIndex((entry) => entry.priority);
  if (priorityIndex >= 0) {
    return sendQueue.splice(priorityIndex, 1)[0];
  }
  return sendQueue.shift();
}

async function processSendQueue() {
  if (isSending) {
    return;
  }
  const nextItem = dequeueNextItem();
  if (!nextItem) {
    return;
  }
  isSending = true;
  showTypingIndicator();

  try {
    const aiResponse = await sendToAI(nextItem.text, nextItem.attachment || null);
    const handled = await handleAiResult(aiResponse, nextItem);
    if (!handled) {
      // noop
    }
  } catch (err) {
    hideTypingIndicator();
    addMessage(`Error: ${err.message}`, false);
  } finally {
    isSending = false;
    if (sendQueue.length > 0) {
      void processSendQueue();
    }
  }
}

async function handleAiResult(aiResponse, nextItem) {
  const rawText = extractAssistantText(aiResponse?.data);
  if (isAuthError(aiResponse, rawText)) {
    const authed = await ensureAuthenticatedFlow();
    if (authed && !nextItem.authRetried) {
      nextItem.authRetried = true;
      const retryResponse = await sendToAI(nextItem.text, nextItem.attachment || null);
      return handleAiResult(retryResponse, nextItem);
    }
    hideTypingIndicator();
    addMessage('Login required. Please sign in at tasking.tech and retry.', false);
    return false;
  }

  const { cleanText, actions } = extractActionsFromResponse(rawText);
  const assistantTextForHistory =
    cleanText && cleanText.trim().length > 0
      ? cleanText.trim()
      : actions.length > 0
        ? '[Actions requested]'
        : rawText;
  recordConversation(nextItem.text, assistantTextForHistory, !!nextItem.attachment);
  hideTypingIndicator();

  if (cleanText && cleanText.trim().length > 0) {
    addMessage(cleanText, false);
  } else if (!actions || actions.length === 0) {
    addMessage(rawText, false);
  } else {
    addMessage('Executing requested actions...', false);
  }

  if (actions && actions.length > 0) {
    queueActionBatch(actions, rawText);
  }
  return true;
}

function isAuthError(aiResponse, rawText) {
  if (!aiResponse) return false;
  if (aiResponse.status === 401) return true;
  if (typeof rawText === 'string' && /not authenticated|unauthorized|login required/i.test(rawText)) {
    return true;
  }
  const data = aiResponse.data || {};
  if (data && typeof data.error === 'string' && /not authenticated|unauthorized/i.test(data.error)) {
    return true;
  }
  return false;
}

function extractActionsFromResponse(text) {
  if (!text || typeof text !== 'string') {
    return { cleanText: '', actions: [] };
  }

  let cleanText = text;
  let actions = [];

  const tagMatch = cleanText.match(/\[ACTIONS\]([\s\S]*?)\[\/ACTIONS\]/i);
  if (tagMatch) {
    actions = parseActionJson(tagMatch[1]);
    cleanText = cleanText.replace(tagMatch[0], '').trim();
  }

  if (actions.length === 0) {
    const codeMatch = cleanText.match(/```json([\s\S]*?)```/i);
    if (codeMatch && codeMatch[1] && codeMatch[1].includes('"actions"')) {
      actions = parseActionJson(codeMatch[1]);
      cleanText = cleanText.replace(codeMatch[0], '').trim();
    }
  }

  return { cleanText, actions };
}

function parseActionJson(rawJson) {
  if (!rawJson || typeof rawJson !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(rawJson.trim());
    return normalizeActions(parsed);
  } catch (err) {
    return [];
  }
}

function normalizeActions(parsed) {
  if (!parsed) {
    return [];
  }
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed.actions)) {
    return parsed.actions;
  }
  return [];
}

async function sendMessage() {
  if (botToggle && !botToggle.checked) {
    addMessage('Bot is turned off.', false);
    return;
  }
  if (!messageInput) {
    return;
  }
  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  addMessage(text, true);
  messageInput.value = '';

  enqueueOutgoing({ text });
}

function queueActionBatch(actions, sourceText) {
  const normalized = normalizeActions(actions).map((action, index) => ({
    ...action,
    id: action.id || `action_${Date.now()}_${index}`,
    type: normalizeActionType(action),
    __sourceText: sourceText || '',
  }));

  if (normalized.length === 0) {
    return;
  }

  actionBatches.push({
    id: `batch_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    createdAt: new Date().toISOString(),
    actions: normalized,
  });

  if (!isProcessingActions) {
    void processActionBatches();
  }
}

async function processActionBatches() {
  if (isProcessingActions) {
    return;
  }
  isProcessingActions = true;

  while (actionBatches.length > 0) {
    const batch = actionBatches.shift();
    if (!batch) {
      continue;
    }
    const results = [];
    for (const action of batch.actions) {
      const result = await executeActionWithPolicy(action);
      results.push(result);
    }
    if (results.length > 0) {
      await sendActionReport(batch, results);
    }
  }

  isProcessingActions = false;
}

function normalizeActionType(action) {
  const raw = String(action?.type || action?.action || action?.kind || '').toLowerCase();
  if (raw === 'tap') return 'click';
  if (raw === 'press') return 'click';
  if (raw === 'input') return 'type';
  if (raw === 'goto') return 'navigate';
  if (raw === 'open') return 'navigate';
  if (raw === 'open_tab' || raw === 'open-tab' || raw === 'open_url' || raw === 'open-url' || raw === 'open_new_tab') {
    return 'open_tab';
  }
  if (raw === 'console_logs' || raw === 'get_console_log' || raw === 'get_console' || raw === 'console') {
    return 'get_console_logs';
  }
  if (raw === 'network_logs' || raw === 'get_network_log' || raw === 'get_network' || raw === 'network') {
    return 'get_network_logs';
  }
  return raw;
}

function shouldBlockAction(action) {
  const type = normalizeActionType(action);
  return /(delete|destroy|remove|clear|erase|drop)/i.test(type);
}

function isSensitiveAction(action) {
  if (action?.confirm === true) return true;
  const type = normalizeActionType(action);
  if (
    /(login|sign[_-]?in|signin|signup|register|create[_-]?account|payment|purchase|checkout|billing|email)/i.test(
      type,
    )
  ) {
    return true;
  }
  const url = String(action?.url || action?.href || '');
  if (/mail\.google\.com|gmail\.com|accounts\.google\.com/i.test(url)) {
    return true;
  }
  const selector = String(action?.selector || '');
  if (/password|passcode|credit-card|card-number/i.test(selector)) {
    return true;
  }
  return false;
}

function formatActionSummary(action) {
  const type = normalizeActionType(action) || 'action';
  const parts = [`${type}`];
  if (action?.url) parts.push(`url=${action.url}`);
  if (action?.selector) parts.push(`selector=${action.selector}`);
  if (action?.text) parts.push(`text="${String(action.text).slice(0, 80)}"`);
  return parts.join(' ');
}

async function executeActionWithPolicy(action) {
  const normalized = { ...action, type: normalizeActionType(action) };
  const resultBase = {
    id: normalized.id || null,
    type: normalized.type || 'unknown',
  };

  const domainCheck = await ensureAllowedDomain(normalized);
  if (!domainCheck.ok) {
    return { ...resultBase, status: 'blocked', error: domainCheck.error || 'Domain blocked.' };
  }

  if (shouldBlockAction(normalized)) {
    return { ...resultBase, status: 'blocked', error: 'Destructive actions are blocked.' };
  }

  if (isSensitiveAction(normalized)) {
    const approved = window.confirm(
      `Allow TaskingBot to perform this action?\n\n${formatActionSummary(normalized)}`,
    );
    if (!approved) {
      return { ...resultBase, status: 'skipped', error: 'User denied confirmation.' };
    }
  }

  const actionResult = await runBrowserAction(normalized);
  if (actionResult.ok) {
    return { ...resultBase, status: 'success', data: actionResult.data || null };
  }
  return {
    ...resultBase,
    status: 'failed',
    error: actionResult.error || 'Unknown error',
    data: actionResult.data || null,
  };
}

async function runBrowserAction(action) {
  if (!action || !action.type) {
    return { ok: false, error: 'Invalid action' };
  }

  if (action.type === 'wait') {
    const ms = typeof action.ms === 'number' ? action.ms : 500;
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { ok: true, data: { waitedMs: ms } };
  }

  if (action.type === 'screenshot') {
    const capture = await captureScreenshot();
    if (!capture || !capture.dataUrl) {
      return { ok: false, error: capture?.error || 'Screenshot failed' };
    }
    const uploadDataUrl = await prepareImageForSend(capture.dataUrl);
    addAttachmentMessage(capture.dataUrl, 'Action Screenshot', true);
    const attachment = buildAttachment(uploadDataUrl, 'Action Screenshot', 'image/jpeg', null);
    enqueueOutgoing({
      text: `Action Screenshot (${action.id || 'screenshot'})`,
      attachment,
      priority: true,
    });
    // Return the base64 image data so the autonomous runner can pass it to a vision model
    const base64Match = uploadDataUrl.match(/^data:[^;]+;base64,(.+)$/);
    const imageBase64 = base64Match ? base64Match[1] : null;
    return { ok: true, data: { screenshot: true, image_base64: imageBase64 } };
  }

  if (action.type === 'open_tab') {
    if (!action.url) {
      return { ok: false, error: 'Missing url for open_tab' };
    }
    return sendRuntimeMessage({ action: 'openTab', url: action.url });
  }

  if (action.type === 'navigate' && action.newTab) {
    return sendRuntimeMessage({ action: 'openTab', url: action.url });
  }

  const response = await sendRuntimeMessage({ action: 'performActions', actions: [action] });
  if (!response || response.error) {
    return { ok: false, error: response?.error || 'No response from content script' };
  }
  const result = response.results && response.results[0] ? response.results[0] : null;
  if (!result) {
    return { ok: false, error: 'No action result returned' };
  }
  if (!result.ok) {
    return { ok: false, error: result.error || 'Action failed', data: result.data || null };
  }
  return { ok: true, data: result.data || null };
}

async function sendActionReport(batch, results) {
  const report = buildActionReport(batch, results);
  enqueueOutgoing({ text: report, priority: true });
}

function buildActionReport(batch, results) {
  const lines = [];
  lines.push('[ACTION_REPORT]');
  lines.push(`timestamp: ${new Date().toISOString()}`);
  lines.push(`batch: ${batch?.id || 'unknown'}`);
  lines.push(`count: ${results.length}`);
  for (const result of results) {
    const detail = summarizeActionData(result);
    const summary = [
      `- id=${result.id || 'n/a'}`,
      `type=${result.type || 'unknown'}`,
      `status=${result.status || 'unknown'}`,
      result.error ? `error="${result.error}"` : null,
      detail ? `data=${detail}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(summary);
  }
  lines.push('[/ACTION_REPORT]');
  return lines.join('\n');
}

function summarizeActionData(result) {
  if (!result || result.data == null) {
    return '';
  }
  let data = result.data;
  if (Array.isArray(data)) {
    data = data.slice(-MAX_ACTION_LOGS);
  }
  const serialized = safeStringify(data);
  return truncateText(serialized, 2000);
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

function truncateText(text, limit) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}...`;
}

function sendRuntimeMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

async function getSessionToken() {
  const response = await sendRuntimeMessage({ action: 'getSessionToken' });
  if (response && response.ok === false) {
    return null;
  }
  return response?.token || null;
}

async function ensureAuthenticatedFlow() {
  hideTypingIndicator();
  addMessage('Login required. Opening tasking.tech login…', false);
  showLoginFrame();
  const start = Date.now();
  const timeoutMs = 2 * 60 * 1000;
  while (Date.now() - start < timeoutMs) {
    const token = await getSessionToken();
    if (token) {
      hideLoginFrame();
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  hideLoginFrame();
  await sendRuntimeMessage({ action: 'openTab', url: 'https://tasking.tech/login' });
  return false;
}

async function getActiveTabInfo() {
  const response = await sendRuntimeMessage({ action: 'getActiveTabInfo' });
  if (response && response.ok === false) {
    return { url: null, title: null, error: response.error || 'Failed to get active tab' };
  }
  return response || { url: null, title: null };
}

function isAllowedTaskingDomain(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (TASKING_DOMAIN_HOSTS.includes(host)) return true;
    return TASKING_DOMAIN_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch (err) {
    return false;
  }
}

async function ensureAllowedDomain(action) {
  const type = normalizeActionType(action);

  // Allow all action types — the AI operates on any domain.
  // Security is handled by shouldBlockAction() (destructive actions)
  // and isSensitiveAction() (login, payment, etc. require user confirm).

  if (type === 'wait' || type === 'screenshot' || type === 'get_console_logs' || type === 'get_network_logs') {
    return { ok: true };
  }

  if (type === 'navigate' || type === 'open_tab') {
    const targetUrl = action?.url || action?.href;
    if (!targetUrl) {
      return { ok: false, error: 'Missing url for navigation.' };
    }
    // Block obviously dangerous URLs (javascript:, data:, file:, chrome:)
    const lower = targetUrl.toLowerCase().trim();
    if (lower.startsWith('javascript:') || lower.startsWith('file:') || lower.startsWith('chrome:')) {
      return { ok: false, error: 'Blocked: unsafe URL scheme.' };
    }
    return { ok: true };
  }

  // For click/type/scroll/extract/submit — allow on any page
  return { ok: true };
}

async function sendAttachment(
  dataUrl,
  filename,
  displayDataUrl = null,
  isImage = false,
  attachmentType = null,
  attachmentSize = null,
) {
  if (botToggle && !botToggle.checked) {
    addMessage('Bot is turned off.', false);
    return;
  }

  const label = filename ? `Attachment: ${filename}` : 'Attachment';
  addAttachmentMessage(displayDataUrl || dataUrl, filename, isImage);
  removeLegacyPreviews();

  const attachment = buildAttachment(dataUrl, filename, attachmentType, attachmentSize);
  enqueueOutgoing({ text: label, attachment });
}

function addMessage(text, isUser = true) {
  if (!chatContainer) {
    return;
  }

  const msg = document.createElement('div');
  msg.className = `message ${isUser ? 'user' : 'assistant'}`;

  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  avatar.src = isUser ? USER_AVATAR : TASKINGBOT_AVATAR;
  avatar.onerror = () => {
    avatar.src = isUser ? USER_AVATAR_FALLBACK : TASKINGBOT_AVATAR_FALLBACK;
  };

  const content = document.createElement('span');
  content.textContent = text;

  msg.appendChild(avatar);
  msg.appendChild(content);

  if (!isUser) {
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '⧉';
    copyBtn.title = 'Copy';
    copyBtn.style.marginLeft = '8px';
    copyBtn.style.border = 'none';
    copyBtn.style.background = 'transparent';
    copyBtn.style.cursor = 'pointer';
    copyBtn.style.color = '#FF8C00';
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(text);
    });
    msg.appendChild(copyBtn);
  }

  chatContainer.appendChild(msg);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addAttachmentMessage(dataUrl, filename, isImage = false) {
  if (!chatContainer) {
    return;
  }

  const msg = document.createElement('div');
  msg.className = 'message user';

  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  avatar.src = USER_AVATAR;
  avatar.onerror = () => {
    avatar.src = USER_AVATAR_FALLBACK;
  };

  const content = document.createElement('div');
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = '6px';

  if (isImage && isImageDataUrl(dataUrl)) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.maxWidth = '180px';
    img.style.maxHeight = '180px';
    img.style.borderRadius = '8px';
    img.style.objectFit = 'cover';
    content.appendChild(img);
  }

  const label = document.createElement('span');
  label.textContent = filename || 'Attachment';
  content.appendChild(label);

  msg.appendChild(avatar);
  msg.appendChild(content);
  chatContainer.appendChild(msg);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTypingIndicator() {
  if (!chatContainer) {
    return;
  }
  const existing = document.getElementById('typingIndicator');
  if (existing) {
    return;
  }
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typingIndicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  chatContainer.appendChild(indicator);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) {
    indicator.remove();
  }
}

async function takeScreenshot() {
  const result = await captureScreenshot();
  if (!result || !result.dataUrl) {
    const message = result && result.error ? `Screenshot failed: ${result.error}` : 'Screenshot failed.';
    addMessage(message, false);
    return;
  }
  removeLegacyPreviews();
  const uploadDataUrl = await prepareImageForSend(result.dataUrl);
  await sendAttachment(uploadDataUrl, 'Screenshot', result.dataUrl, true, 'image/jpeg');
}

function captureScreenshot() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'captureScreenshot' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ error: chrome.runtime.lastError.message, dataUrl: null });
        return;
      }
      if (!response) {
        resolve({ error: 'No response from background.', dataUrl: null });
        return;
      }
      if (response.error) {
        resolve({ error: response.error, dataUrl: null });
        return;
      }
      resolve({ dataUrl: response.screenshot || null, error: null });
    });
  });
}

async function startScreenShare() {
  const stream = await requestScreenShare();
  if (!stream) {
    addMessage('Screen share permission denied or failed.', false);
    return;
  }

  const video = document.createElement('video');
  video.srcObject = stream;
  video.autoplay = true;
  video.muted = true;
  video.style.maxWidth = '200px';
  video.style.maxHeight = '140px';
  video.style.margin = '10px 0';
  video.style.borderRadius = '10px';
  video.style.display = 'block';

  const stopBtn = document.createElement('button');
  stopBtn.textContent = 'Stop';
  stopBtn.style.marginTop = '8px';
  stopBtn.addEventListener('click', () => {
    stream.getTracks().forEach((track) => track.stop());
    stopBtn.remove();
    video.remove();
  });

  const message = document.createElement('div');
  message.className = 'message assistant';
  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  avatar.src = TASKINGBOT_AVATAR;
  avatar.onerror = () => {
    avatar.src = TASKINGBOT_AVATAR_FALLBACK;
  };
  message.appendChild(avatar);
  message.appendChild(video);
  message.appendChild(stopBtn);

  if (chatContainer) {
    chatContainer.appendChild(message);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

async function requestScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    return stream;
  } catch (err) {
    console.error('Screen share denied:', err);
    return null;
  }
}

function openFilePicker() {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*,.pdf,.txt,.doc,.docx';
  fileInput.onchange = (event) => {
    const file = event.target && event.target.files ? event.target.files[0] : null;
    if (!file) {
      return;
    }
    void handleAttachmentFile(file);
  };
  fileInput.click();
}

function handleAttachmentFile(file) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (!ev.target || typeof ev.target.result !== 'string') {
      return;
    }
    void handleAttachmentData(ev.target.result, file);
  };
  reader.readAsDataURL(file);
}

async function handleAttachmentData(dataUrl, file) {
  const filename = file && file.name ? file.name : 'Attachment';
  const isImage = (file && file.type ? file.type.startsWith('image/') : false) || isImageDataUrl(dataUrl);
  const attachmentType = file && file.type ? file.type : inferDataUrlMimeType(dataUrl);
  const attachmentSize = file && typeof file.size === 'number' ? file.size : null;
  const uploadDataUrl = isImage ? await prepareImageForSend(dataUrl) : dataUrl;
  await sendAttachment(uploadDataUrl, filename, dataUrl, isImage, attachmentType, attachmentSize);
}

function prepareImageForSend(dataUrl) {
  return resizeImageDataUrl(dataUrl, 1024, 0.8).catch(() => dataUrl);
}

function resizeImageDataUrl(dataUrl, maxWidth = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const targetWidth = Math.max(1, Math.round(img.width * scale));
      const targetHeight = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

function isImageDataUrl(dataUrl) {
  return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/');
}

function inferDataUrlMimeType(dataUrl) {
  if (typeof dataUrl !== 'string') return 'application/octet-stream';
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'application/octet-stream';
}

function buildAttachment(dataUrl, name, type, size) {
  if (!dataUrl) return null;
  return {
    name: name || 'attachment',
    type: type || inferDataUrlMimeType(dataUrl),
    content: dataUrl,
    size: typeof size === 'number' ? size : undefined,
  };
}

function removeLegacyPreviews() {
  const screenshotPreview = document.getElementById('screenshotPreview');
  const attachmentPreview = document.getElementById('attachmentPreview');
  if (screenshotPreview) {
    screenshotPreview.remove();
  }
  if (attachmentPreview) {
    attachmentPreview.remove();
  }
}
