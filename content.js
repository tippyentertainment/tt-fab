// TaskingBot FAB - Content Script
(function () {
  'use strict';

  const MAX_LOGS = 200;
  const MAX_RETURN_LOGS = 50;
  const consoleLogs = [];
  const networkLogs = [];

  function pushLog(buffer, entry) {
    buffer.push(entry);
    if (buffer.length > MAX_LOGS) {
      buffer.splice(0, buffer.length - MAX_LOGS);
    }
  }

  function injectMonitorScript() {
    if (window.__taskingbotInjected) {
      return;
    }
    window.__taskingbotInjected = true;

    const script = document.createElement('script');
    script.textContent = `
(function () {
  if (window.__taskingbotMonitorInjected) return;
  window.__taskingbotMonitorInjected = true;
  function post(type, payload) {
    try {
      window.postMessage({ source: 'taskingbot-monitor', type: type, payload: payload }, '*');
    } catch (e) {}
  }
  var methods = ['log', 'info', 'warn', 'error', 'debug'];
  var original = {};
  methods.forEach(function (method) {
    original[method] = console[method];
    console[method] = function () {
      try {
        post('console', { level: method, args: Array.prototype.slice.call(arguments), ts: Date.now() });
      } catch (e) {}
      return original[method].apply(console, arguments);
    };
  });
  window.addEventListener('error', function (event) {
    post('console', { level: 'error', args: [event.message || 'Script error'], ts: Date.now(), source: 'error' });
  });
  window.addEventListener('unhandledrejection', function (event) {
    post('console', { level: 'error', args: [String(event.reason || 'Unhandled rejection')], ts: Date.now(), source: 'unhandledrejection' });
  });
  var originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = function () {
      var start = Date.now();
      var input = arguments[0];
      var init = arguments[1] || {};
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
      var method = (init && init.method) || (input && input.method) || 'GET';
      return originalFetch.apply(this, arguments)
        .then(function (res) {
          post('network', {
            type: 'fetch',
            url: url,
            method: method,
            status: res.status,
            ok: res.ok,
            duration: Date.now() - start,
            ts: Date.now()
          });
          return res;
        })
        .catch(function (err) {
          post('network', {
            type: 'fetch',
            url: url,
            method: method,
            status: 0,
            ok: false,
            error: String(err || 'fetch error'),
            duration: Date.now() - start,
            ts: Date.now()
          });
          throw err;
        });
    };
  }
  var open = XMLHttpRequest.prototype.open;
  var send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__taskingbotMeta = { method: method || 'GET', url: url || '', start: 0 };
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var meta = this.__taskingbotMeta || { method: 'GET', url: '', start: 0 };
    meta.start = Date.now();
    this.__taskingbotMeta = meta;
    this.addEventListener('loadend', function () {
      post('network', {
        type: 'xhr',
        url: meta.url,
        method: meta.method,
        status: this.status,
        ok: this.status >= 200 && this.status < 400,
        duration: Date.now() - meta.start,
        ts: Date.now()
      });
    });
    return send.apply(this, arguments);
  };
})();`;
    (document.documentElement || document.head || document.body).appendChild(script);
    script.remove();
  }

  function getSafeLogs(buffer) {
    return buffer.slice(-MAX_RETURN_LOGS);
  }

  function normalizeActionType(action) {
    if (!action) return '';
    const raw = String(action.type || action.action || action.kind || '').toLowerCase();
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

  function findByText(text, selectorList) {
    if (!text) return null;
    const needle = String(text).trim().toLowerCase();
    if (!needle) return null;
    const selectors = selectorList || ['button', 'a', 'input', 'textarea', '[role="button"]'];
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        const content = (node.innerText || node.value || '').trim().toLowerCase();
        if (content && content === needle) return node;
      }
    }
    return null;
  }

  function findElement(action) {
    if (!action) return null;
    if (action.selector) {
      try {
        const el = document.querySelector(action.selector);
        if (el) return el;
      } catch (e) {}
    }
    if (action.text) {
      return findByText(action.text);
    }
    return null;
  }

  async function waitForSelector(selector, timeoutMs) {
    const timeout = typeof timeoutMs === 'number' ? timeoutMs : 0;
    const start = Date.now();
    while (true) {
      const el = document.querySelector(selector);
      if (el) return el;
      if (!timeout || Date.now() - start > timeout) return null;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  async function executeAction(action) {
    const type = normalizeActionType(action);

    try {
      if (type === 'wait') {
        const ms = typeof action.ms === 'number' ? action.ms : 500;
        await new Promise((resolve) => setTimeout(resolve, ms));
        return { ok: true, data: { waitedMs: ms } };
      }

      if (type === 'get_console_logs') {
        return { ok: true, data: getSafeLogs(consoleLogs) };
      }

      if (type === 'get_network_logs') {
        return { ok: true, data: getSafeLogs(networkLogs) };
      }

      if (type === 'navigate') {
        const url = action.url || action.href;
        if (!url) return { ok: false, error: 'Missing url for navigate' };
        window.location.href = url;
        return { ok: true, data: { url: url } };
      }

      if (type === 'scroll') {
        if (action.selector) {
          const target = document.querySelector(action.selector);
          if (!target) return { ok: false, error: 'Scroll target not found' };
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return { ok: true, data: { selector: action.selector } };
        }
        const dx = typeof action.x === 'number' ? action.x : 0;
        const dy = typeof action.y === 'number' ? action.y : 300;
        window.scrollBy(dx, dy);
        return { ok: true, data: { x: dx, y: dy } };
      }

      if (type === 'extract') {
        let target = null;
        if (action.selector) {
          target = document.querySelector(action.selector);
        }
        if (!target) return { ok: false, error: 'Extract target not found' };
        const attribute = action.attribute;
        if (action.all) {
          const nodes = Array.from(document.querySelectorAll(action.selector));
          const values = nodes.map((node) => {
            if (attribute) return node.getAttribute(attribute);
            return node.innerText || node.textContent || '';
          });
          return { ok: true, data: values };
        }
        if (attribute) return { ok: true, data: target.getAttribute(attribute) };
        return { ok: true, data: target.innerText || target.textContent || '' };
      }

      if (type === 'click') {
        let target = null;
        if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'Click target not found' };
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.click();
        return { ok: true, data: { selector: action.selector || null } };
      }

      if (type === 'type') {
        let target = null;
        if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'Type target not found' };
        const text = action.text ?? action.value ?? '';
        if (target.isContentEditable) {
          target.focus();
          target.textContent = text;
        } else {
          target.focus();
          if (action.clear !== false && 'value' in target) {
            target.value = '';
          }
          if ('value' in target) {
            target.value = text;
          }
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, data: { selector: action.selector || null, textLength: String(text).length } };
      }

      if (type === 'submit') {
        let target = null;
        if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'Submit target not found' };
        const form = target.tagName === 'FORM' ? target : target.form;
        if (form && typeof form.requestSubmit === 'function') {
          form.requestSubmit();
          return { ok: true, data: { selector: action.selector || null } };
        }
        if (form && typeof form.submit === 'function') {
          form.submit();
          return { ok: true, data: { selector: action.selector || null } };
        }
        target.click();
        return { ok: true, data: { selector: action.selector || null } };
      }

      return { ok: false, error: `Unknown action type: ${type}` };
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    }
  }

  async function runActions(actions) {
    const results = [];
    for (const action of actions || []) {
      const actionResult = await executeAction(action);
      results.push({
        id: action.id || null,
        type: normalizeActionType(action),
        ok: actionResult.ok,
        data: actionResult.data || null,
        error: actionResult.error || null,
      });
    }
    return results;
  }

  function initFab() {
    let isOpen = false;

    const fab = document.createElement('div');
    fab.id = 'taskingbot-fab';
    fab.innerHTML = `
      <button id="fab-button" aria-label="TaskingBot"></button>
    `;
    document.body.appendChild(fab);

    document.getElementById('fab-button').addEventListener('click', () => {
      isOpen = !isOpen;
      if (isOpen) {
        chrome.runtime.sendMessage({ action: 'openSidePanel' });
      } else {
        chrome.runtime.sendMessage({ action: 'closeSidePanel' });
      }
    });
  }

  injectMonitorScript();
  initFab();

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== 'taskingbot-monitor') return;
    if (data.type === 'console') {
      pushLog(consoleLogs, data.payload);
    } else if (data.type === 'network') {
      pushLog(networkLogs, data.payload);
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
      sendResponse({ ok: true });
      return;
    }

    if (request.action === 'getLogs') {
      sendResponse({
        consoleLogs: getSafeLogs(consoleLogs),
        networkLogs: getSafeLogs(networkLogs),
        url: window.location.href,
        title: document.title,
      });
      return;
    }

    if (request.action === 'performActions') {
      runActions(request.actions || [])
        .then((results) => sendResponse({ results }))
        .catch((err) => sendResponse({ error: String(err && err.message ? err.message : err) }));
      return true;
    }
  });
})();
