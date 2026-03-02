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

    // Load monitor.js from the extension's own URL — CSP always allows chrome-extension:// scripts
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('monitor.js');
      script.onload = () => script.remove();
      script.onerror = () => script.remove();
      (document.documentElement || document.head || document.body).appendChild(script);
    } catch (e) {
      // Non-critical — console/network logging won't work but actions still function
      console.warn('[TaskingBot] Monitor injection failed:', e);
    }
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
    if (raw === 'select' || raw === 'select_option' || raw === 'choose') return 'select';
    if (raw === 'set_value' || raw === 'set' || raw === 'set_range' || raw === 'set_date' || raw === 'set_number') return 'set_value';
    if (raw === 'upload_file' || raw === 'upload' || raw === 'file_upload' || raw === 'attach') return 'upload_file';
    if (raw === 'get_form_fields' || raw === 'get_form' || raw === 'read_form' || raw === 'form_fields') return 'get_form_fields';
    if (raw === 'get_page_info' || raw === 'page_info' || raw === 'read_page') return 'get_page_info';
    if (raw === 'focus') return 'focus';
    if (raw === 'clear') return 'clear';
    if (raw === 'hover' || raw === 'mouseover' || raw === 'mouse_over') return 'hover';
    if (raw === 'mouse_move' || raw === 'mousemove' || raw === 'move_mouse' || raw === 'move') return 'mouse_move';
    return raw;
  }

  function findByText(text, selectorList) {
    if (!text) return null;
    const needle = String(text).trim().toLowerCase();
    if (!needle) return null;
    const selectors = selectorList || [
      'button', 'a', 'input', 'textarea', 'select', 'label',
      '[role="button"]', '[role="option"]', '[role="menuitem"]',
      '[role="tab"]', '[role="listbox"]', 'li', 'span', 'div',
    ];
    // First pass: exact match
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        const content = (node.innerText || node.value || node.getAttribute('aria-label') || '').trim().toLowerCase();
        if (content && content === needle) return node;
      }
    }
    // Second pass: partial/contains match
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        const content = (node.innerText || node.value || node.getAttribute('aria-label') || '').trim().toLowerCase();
        if (content && content.includes(needle)) return node;
      }
    }
    // Third pass: match by placeholder, title, or aria-label attributes
    const allInputs = document.querySelectorAll('input, textarea, select, [contenteditable]');
    for (const el of allInputs) {
      const ph = (el.placeholder || el.title || el.getAttribute('aria-label') || '').toLowerCase();
      if (ph && ph.includes(needle)) return el;
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

  // ── Real Mouse Event Simulation ──────────────────────────────────
  // Dispatches proper MouseEvent/PointerEvent sequences with real coordinates.
  // This makes React/Vue/Angular custom components respond correctly,
  // unlike basic .click() which many custom widgets ignore.
  function simulateMouseEvent(element, eventType, opts) {
    const rect = element.getBoundingClientRect();
    const x = opts?.clientX ?? (rect.left + rect.width / 2);
    const y = opts?.clientY ?? (rect.top + rect.height / 2);
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: x + (window.screenX || 0),
      screenY: y + (window.screenY || 0),
      button: 0,
      buttons: (eventType === 'mousedown' || eventType === 'pointerdown') ? 1 : 0,
    };
    if (eventType.startsWith('pointer')) {
      try {
        element.dispatchEvent(new PointerEvent(eventType, { ...eventInit, pointerId: 1, pointerType: 'mouse' }));
      } catch (e) {
        element.dispatchEvent(new MouseEvent(eventType.replace('pointer', 'mouse'), eventInit));
      }
    } else {
      element.dispatchEvent(new MouseEvent(eventType, eventInit));
    }
  }

  function simulateRealClick(element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const coords = { clientX: x, clientY: y };
    // Full event sequence — triggers all framework event handlers
    simulateMouseEvent(element, 'pointerenter', coords);
    simulateMouseEvent(element, 'mouseenter', coords);
    simulateMouseEvent(element, 'pointerover', coords);
    simulateMouseEvent(element, 'mouseover', coords);
    simulateMouseEvent(element, 'pointermove', coords);
    simulateMouseEvent(element, 'mousemove', coords);
    simulateMouseEvent(element, 'pointerdown', coords);
    simulateMouseEvent(element, 'mousedown', coords);
    element.focus();
    simulateMouseEvent(element, 'pointerup', coords);
    simulateMouseEvent(element, 'mouseup', coords);
    simulateMouseEvent(element, 'click', coords);
  }

  function simulateHover(element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const coords = { clientX: x, clientY: y };
    simulateMouseEvent(element, 'pointerenter', coords);
    simulateMouseEvent(element, 'mouseenter', coords);
    simulateMouseEvent(element, 'pointerover', coords);
    simulateMouseEvent(element, 'mouseover', coords);
    simulateMouseEvent(element, 'pointermove', coords);
    simulateMouseEvent(element, 'mousemove', coords);
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
        // Coordinate-based click — find element at (x, y) viewport coordinates
        if (typeof action.x === 'number' && typeof action.y === 'number') {
          target = document.elementFromPoint(action.x, action.y);
          if (!target) return { ok: false, error: `No element at coordinates (${action.x}, ${action.y})` };
        } else if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'Click target not found' };
        simulateRealClick(target);
        return { ok: true, data: {
          selector: action.selector || null,
          tag: target.tagName.toLowerCase(),
          text: (target.innerText || target.value || '').substring(0, 80),
          id: target.id || null,
        }};
      }

      if (type === 'hover' || type === 'mouse_move') {
        let target = null;
        if (typeof action.x === 'number' && typeof action.y === 'number') {
          target = document.elementFromPoint(action.x, action.y);
        } else if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'Hover/mouse_move target not found' };
        simulateHover(target);
        const rect = target.getBoundingClientRect();
        return { ok: true, data: {
          selector: action.selector || null,
          tag: target.tagName.toLowerCase(),
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
        }};
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
          // Use native value setter for React/Vue controlled input compatibility
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
            || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (action.clear !== false && 'value' in target) {
            if (nativeSetter) { nativeSetter.call(target, ''); }
            else { target.value = ''; }
          }
          if ('value' in target) {
            if (nativeSetter) { nativeSetter.call(target, text); }
            else { target.value = text; }
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

      if (type === 'select') {
        // Select a dropdown/radio/checkbox option by value or text
        let target = null;
        if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'Select target not found' };
        const val = action.value ?? action.text ?? '';

        // <select> dropdown
        if (target.tagName === 'SELECT') {
          const options = Array.from(target.options);
          // Try exact value match first
          let match = options.find((o) => o.value === val);
          // Then exact text match
          if (!match) match = options.find((o) => o.textContent.trim().toLowerCase() === String(val).toLowerCase());
          // Then partial text match
          if (!match) match = options.find((o) => o.textContent.trim().toLowerCase().includes(String(val).toLowerCase()));
          if (!match) {
            const optTexts = options.map((o) => `"${o.textContent.trim()}" (value=${o.value})`).join(', ');
            return { ok: false, error: `No matching option for "${val}". Available: ${optTexts}` };
          }
          target.value = match.value;
          target.dispatchEvent(new Event('change', { bubbles: true }));
          target.dispatchEvent(new Event('input', { bubbles: true }));
          return { ok: true, data: { selected: match.textContent.trim(), value: match.value } };
        }

        // Radio button
        if (target.type === 'radio') {
          target.checked = true;
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, data: { selected: target.value } };
        }

        // Checkbox
        if (target.type === 'checkbox') {
          const shouldCheck = val === true || val === 'true' || val === '1' || val === 'on';
          target.checked = shouldCheck;
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, data: { checked: target.checked } };
        }

        // Custom dropdown — click trigger to open, wait for options, then click match
        simulateRealClick(target);
        await new Promise(r => setTimeout(r, 400)); // Wait for dropdown animation

        // Search for the option in expanded dropdown/menu
        const customSelectors = [
          '[role="option"]', '[role="menuitem"]', '[role="listitem"]',
          'li[data-value]', '.option', '.dropdown-item', '.select-option',
          '[class*="option"]', '[class*="menu-item"]', '[class*="listbox"]',
          '[class*="dropdown-option"]', 'li', 'div[data-value]', 'span[data-value]',
        ];
        const optionEl = findByText(String(val), customSelectors);
        if (optionEl) {
          simulateRealClick(optionEl);
          return { ok: true, data: { clickedOption: String(val), method: 'custom_dropdown' } };
        }

        // Second attempt — scan ALL matching elements for partial text match
        const allOptions = document.querySelectorAll(customSelectors.join(','));
        const needle = String(val).toLowerCase();
        for (const opt of allOptions) {
          const optText = (opt.innerText || opt.textContent || opt.getAttribute('data-value') || '').trim().toLowerCase();
          if (optText && (optText.includes(needle) || needle.includes(optText))) {
            simulateRealClick(opt);
            return { ok: true, data: { clickedOption: optText, method: 'custom_dropdown_scan' } };
          }
        }

        return { ok: false, error: `Could not select "${val}" — not a <select>/radio/checkbox and no matching option in custom dropdown` };
      }

      if (type === 'get_form_fields') {
        // Return all interactive form elements on the page with their current state
        const fields = [];
        const inputs = document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]');
        for (const el of inputs) {
          const field = {
            tag: el.tagName.toLowerCase(),
            type: el.type || null,
            name: el.name || null,
            id: el.id || null,
            selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : null,
            placeholder: el.placeholder || null,
            label: null,
            value: el.value || null,
            checked: el.type === 'checkbox' || el.type === 'radio' ? el.checked : undefined,
          };
          // Find associated label
          if (el.id) {
            const label = document.querySelector(`label[for="${el.id}"]`);
            if (label) field.label = label.textContent.trim();
          }
          if (!field.label && el.closest('label')) {
            field.label = el.closest('label').textContent.trim();
          }
          if (!field.label) {
            const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
            if (aria) field.label = aria;
          }
          // For select elements, include available options
          if (el.tagName === 'SELECT') {
            field.options = Array.from(el.options).map((o) => ({ value: o.value, text: o.textContent.trim(), selected: o.selected }));
          }
          fields.push(field);
        }
        // Also get buttons for context
        const buttons = [];
        document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').forEach((btn) => {
          buttons.push({
            tag: btn.tagName.toLowerCase(),
            type: btn.type || null,
            text: (btn.innerText || btn.value || '').trim().substring(0, 100),
            selector: btn.id ? `#${btn.id}` : null,
          });
        });
        return { ok: true, data: { fields, buttons, url: window.location.href, title: document.title } };
      }

      if (type === 'get_page_info') {
        // Return a structured summary of the page for AI decision-making
        const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => ({
          level: h.tagName, text: h.textContent.trim().substring(0, 200),
        }));
        const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 30).map((a) => ({
          text: (a.textContent || '').trim().substring(0, 100),
          href: a.href,
        }));
        const images = Array.from(document.querySelectorAll('img[alt]')).slice(0, 20).map((img) => ({
          alt: img.alt, src: img.src?.substring(0, 200),
        }));
        return {
          ok: true,
          data: {
            url: window.location.href,
            title: document.title,
            headings,
            links: links.length,
            images: images.length,
            bodyTextLength: (document.body?.innerText || '').length,
          },
        };
      }

      if (type === 'set_value') {
        // Set value on range sliders, date/time pickers, number fields, color pickers
        let target = null;
        if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'set_value target not found' };
        const val = action.value ?? action.text ?? '';
        const inputType = (target.type || '').toLowerCase();
        // Handle native input types that need special setter (React/Vue controlled inputs)
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(target, val);
        } else {
          target.value = val;
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        // For range inputs, also dispatch a pointerdown/pointerup to trigger visual updates
        if (inputType === 'range') {
          target.dispatchEvent(new Event('pointerdown', { bubbles: true }));
          target.dispatchEvent(new Event('pointerup', { bubbles: true }));
        }
        return { ok: true, data: { value: target.value, type: inputType } };
      }

      if (type === 'upload_file') {
        // Upload a file to a file input — accepts base64 data + filename + mimeType
        let target = null;
        if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'upload_file target not found' };
        if (target.tagName !== 'INPUT' || target.type !== 'file') {
          return { ok: false, error: 'Target is not a file input' };
        }
        if (!action.base64 && !action.url) {
          return { ok: false, error: 'upload_file requires base64 data or url' };
        }
        try {
          let blob;
          if (action.base64) {
            const mimeType = action.mimeType || action.mime_type || 'application/octet-stream';
            const byteChars = atob(action.base64);
            const byteArr = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
            blob = new Blob([byteArr], { type: mimeType });
          } else {
            const resp = await fetch(action.url);
            blob = await resp.blob();
          }
          const fileName = action.filename || action.file_name || 'file';
          const file = new File([blob], fileName, { type: blob.type });
          const dt = new DataTransfer();
          dt.items.add(file);
          target.files = dt.files;
          target.dispatchEvent(new Event('change', { bubbles: true }));
          target.dispatchEvent(new Event('input', { bubbles: true }));
          return { ok: true, data: { filename: fileName, size: blob.size, type: blob.type } };
        } catch (err) {
          return { ok: false, error: `upload_file failed: ${err.message || err}` };
        }
      }

      if (type === 'focus') {
        let target = null;
        if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'Focus target not found' };
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.focus();
        return { ok: true, data: { selector: action.selector || null } };
      }

      if (type === 'clear') {
        let target = null;
        if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: 'Clear target not found' };
        if (target.isContentEditable) {
          target.textContent = '';
        } else if ('value' in target) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
            || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(target, '');
          } else {
            target.value = '';
          }
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
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
