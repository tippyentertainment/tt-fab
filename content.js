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

  async function simulateRealClick(element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 100)); // Let scroll settle
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
    await new Promise(r => setTimeout(r, 80)); // Realistic click timing
    simulateMouseEvent(element, 'pointerup', coords);
    simulateMouseEvent(element, 'mouseup', coords);
    simulateMouseEvent(element, 'click', coords);
    // Fallback: element.click() produces isTrusted:true events that React respects
    await new Promise(r => setTimeout(r, 50));
    element.click();
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

  // Generate a unique CSS selector for any element, even without id/name
  function generateSelector(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    // Best: id
    if (el.id) return `#${CSS.escape(el.id)}`;
    // Good: name attribute (validate uniqueness)
    if (el.name) {
      const sel = `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
      try { if (document.querySelector(sel) === el) return sel; } catch {}
    }

    // Build a CSS path from the element up to the nearest ancestor with an id or body.
    // Try increasing depths (3→8) until we find a unique selector.
    // Adds meaningful CSS classes + nth-of-type for disambiguation.
    for (let maxDepth = 3; maxDepth <= 8; maxDepth++) {
      const parts = [];
      let current = el;
      while (current && current !== document.body && current !== document.documentElement && parts.length < maxDepth) {
        let seg = current.tagName.toLowerCase();
        if (current.id) {
          parts.unshift(`#${CSS.escape(current.id)}`);
          break;
        }
        // Add a meaningful class for specificity (skip framework state classes)
        if (current.className && typeof current.className === 'string') {
          const cls = current.className.split(/\s+/).find(c =>
            c && c.length > 1 && c.length < 40 &&
            !/^(ng-|is-|has-|js-|active|focus|hover|open|show|hide|disabled|selected|checked|error|valid|invalid|dirty|pristine|touched|untouched)/.test(c)
          );
          if (cls) seg += `.${CSS.escape(cls)}`;
        }
        // Use nth-of-type for uniqueness among siblings with same tag
        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            seg += `:nth-of-type(${idx})`;
          }
        }
        parts.unshift(seg);
        current = current.parentElement;
      }
      const selector = parts.join(' > ');
      try {
        const found = document.querySelector(selector);
        if (found === el) return selector;
      } catch { /* invalid selector */ }
    }

    // Fallback: stamp the element with a unique data attribute so it can always be found.
    // This works universally — even for deeply nested elements in repeated structures.
    const uid = 'tb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    el.setAttribute('data-tb-sel', uid);
    return `[data-tb-sel="${uid}"]`;
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
        const logs = getSafeLogs(consoleLogs);
        const errors = logs.filter(l => l.level === 'error').slice(-10);
        const warnings = logs.filter(l => l.level === 'warn').slice(-5);
        return { ok: true, data: {
          summary: `${logs.length} logs (${errors.length} errors, ${warnings.length} warnings)`,
          errors,
          warnings,
          recent: logs.slice(-10),
        }};
      }

      if (type === 'get_network_logs') {
        const logs = getSafeLogs(networkLogs);
        const failed = logs.filter(l => !l.ok).slice(-10);
        return { ok: true, data: {
          summary: `${logs.length} requests (${failed.length} failed)`,
          failed,
          recent: logs.slice(-10),
        }};
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
          if (!target) return { ok: false, error: `Scroll target not found: selector="${action.selector || ''}"` };
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
        if (!target) return { ok: false, error: `Extract target not found: selector="${action.selector || ''}"` };
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
        if (!target) return { ok: false, error: `Click target not found: selector="${action.selector || ''}" text="${action.text || ''}" x=${action.x ?? 'none'} y=${action.y ?? 'none'}` };

        // Walk UP to nearest interactive ancestor — findByText may match a <span> inside a
        // React/custom button. The click handler lives on the button/div wrapper, not the text node.
        const interactiveTags = new Set(['button', 'a', 'input', 'select', 'textarea']);
        let clickTarget = target;
        if (!interactiveTags.has(target.tagName.toLowerCase()) && !target.getAttribute('role')?.includes('button') && !target.onclick) {
          let parent = target.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const tag = parent.tagName.toLowerCase();
            if (interactiveTags.has(tag) || parent.getAttribute('role') === 'button' || parent.onclick
                || parent.getAttribute('tabindex') !== null || parent.classList.toString().match(/btn|button|click|submit|next|continue/i)) {
              clickTarget = parent;
              break;
            }
            parent = parent.parentElement;
          }
        }

        // Remove disabled state if present — form validation may have wrongly disabled it
        const wasDisabled = clickTarget.disabled || clickTarget.getAttribute('aria-disabled') === 'true';
        if (wasDisabled) {
          clickTarget.disabled = false;
          clickTarget.removeAttribute('aria-disabled');
          clickTarget.style.pointerEvents = 'auto';
        }

        await simulateRealClick(clickTarget);
        // If we walked up, also click the original target for frameworks that delegate differently
        if (clickTarget !== target) {
          await new Promise(r => setTimeout(r, 50));
          target.click();
        }
        return { ok: true, data: {
          selector: action.selector || null,
          tag: clickTarget.tagName.toLowerCase(),
          text: (clickTarget.innerText || clickTarget.value || '').substring(0, 80),
          id: clickTarget.id || null,
          walkedUp: clickTarget !== target,
          wasDisabled,
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
        if (!target) return { ok: false, error: `Hover/mouse_move target not found: selector="${action.selector || ''}" text="${action.text || ''}"` };
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
        if (!target) return { ok: false, error: `Type target not found: selector="${action.selector || ''}" text="${action.text || ''}"` };
        const text = action.text ?? action.value ?? '';
        if (target.isContentEditable) {
          target.focus();
          target.textContent = text;
        } else {
          target.focus();
          // Use correct prototype based on element type — HTMLInputElement setter throws on textarea
          const proto = target instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (action.clear !== false && 'value' in target) {
            if (nativeSetter) { nativeSetter.call(target, ''); }
            else { target.value = ''; }
          }
          if ('value' in target) {
            if (nativeSetter) { nativeSetter.call(target, text); }
            else { target.value = text; }
          }
        }
        // Full event sequence: input → change → blur/focusout
        // blur/focusout triggers form validation that many Next.js/React apps rely on
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
        target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
        target.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
        target.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        return { ok: true, data: { selector: action.selector || null, textLength: String(text).length } };
      }

      if (type === 'submit') {
        let target = null;
        if (action.selector) {
          target = action.waitFor ? await waitForSelector(action.selector, action.timeoutMs) : document.querySelector(action.selector);
        } else {
          target = findElement(action);
        }
        if (!target) return { ok: false, error: `Submit target not found: selector="${action.selector || ''}" text="${action.text || ''}"` };
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
        if (!target) return { ok: false, error: `Select target not found: selector="${action.selector || ''}" text="${action.text || ''}"` };
        const val = action.value ?? action.text ?? '';

        // ── Native <select> dropdown ──────────────────────────────────
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
          // Use native setter so React/Angular/Vue detect the change
          const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
          if (nativeSelectSetter) {
            nativeSelectSetter.call(target, match.value);
          } else {
            target.value = match.value;
          }
          // Also set selectedIndex directly as a fallback for Angular ngModel
          const matchIdx = options.indexOf(match);
          if (matchIdx >= 0) target.selectedIndex = matchIdx;
          // Fire full event sequence: focus → input → change (Angular listens on change, React on input)
          target.focus();
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          // Also fire the native click-style events on the option for frameworks that listen there
          try { match.selected = true; } catch(e) {}
          return { ok: true, data: { selected: match.textContent.trim(), value: match.value } };
        }

        // ── Radio button ──────────────────────────────────────────────
        if (target.type === 'radio') {
          target.checked = true;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, data: { selected: target.value } };
        }

        // ── Checkbox ──────────────────────────────────────────────────
        if (target.type === 'checkbox') {
          const shouldCheck = val === true || val === 'true' || val === '1' || val === 'on';
          target.checked = shouldCheck;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, data: { checked: target.checked } };
        }

        // ── Custom dropdown — click to open, find option, click it ───
        // Step 1: Click the trigger to open the dropdown
        await simulateRealClick(target);
        await new Promise(r => setTimeout(r, 500)); // Wait for dropdown animation

        // Step 2: Search everywhere for the option (portals may append to body)
        const customSelectors = [
          '[role="option"]', '[role="menuitem"]', '[role="listitem"]',
          'li[data-value]', '.option', '.dropdown-item', '.select-option',
          '[class*="option"]:not(select)', '[class*="menu-item"]', '[class*="listbox"]',
          '[class*="dropdown-option"]', '[class*="select__option"]', '[class*="Select-option"]',
          'li', 'div[data-value]', 'span[data-value]',
          // Material UI / Ant Design / Headless UI portals
          '.MuiMenuItem-root', '.ant-select-item', '[class*="menu"] > div',
        ];

        // Helper: check if an element is visible and part of an open dropdown
        const isVisibleOption = (el) => {
          if (!el || el.offsetParent === null) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        };

        const valStr = String(val);
        const valLower = valStr.toLowerCase().trim();

        // Pass 1: exact text match among visible option-like elements
        for (const sel of customSelectors) {
          try {
            const nodes = document.querySelectorAll(sel);
            for (const node of nodes) {
              if (!isVisibleOption(node)) continue;
              const text = (node.innerText || node.textContent || '').trim();
              if (text.toLowerCase() === valLower) {
                await simulateRealClick(node);
                return { ok: true, data: { clickedOption: text, method: 'custom_dropdown_exact' } };
              }
            }
          } catch(e) {}
        }

        // Pass 2: partial/contains match among visible elements
        for (const sel of customSelectors) {
          try {
            const nodes = document.querySelectorAll(sel);
            for (const node of nodes) {
              if (!isVisibleOption(node)) continue;
              const text = (node.innerText || node.textContent || node.getAttribute('data-value') || '').trim().toLowerCase();
              if (text && (text.includes(valLower) || valLower.includes(text))) {
                await simulateRealClick(node);
                return { ok: true, data: { clickedOption: text, method: 'custom_dropdown_partial' } };
              }
            }
          } catch(e) {}
        }

        // Pass 3: data-value attribute match
        const dataValNodes = document.querySelectorAll(`[data-value="${CSS.escape(valStr)}"], [data-value="${CSS.escape(valLower)}"]`);
        for (const node of dataValNodes) {
          if (isVisibleOption(node)) {
            await simulateRealClick(node);
            return { ok: true, data: { clickedOption: valStr, method: 'custom_dropdown_data_attr' } };
          }
        }

        // Pass 4: if nothing found, maybe the dropdown needs more time — wait and retry once
        await new Promise(r => setTimeout(r, 500));
        const retryNodes = document.querySelectorAll(customSelectors.join(','));
        for (const node of retryNodes) {
          if (!isVisibleOption(node)) continue;
          const text = (node.innerText || node.textContent || '').trim().toLowerCase();
          if (text && (text === valLower || text.includes(valLower) || valLower.includes(text))) {
            await simulateRealClick(node);
            return { ok: true, data: { clickedOption: text, method: 'custom_dropdown_retry' } };
          }
        }

        // Nothing worked — close the dropdown by clicking the trigger again and report failure
        await simulateRealClick(target);
        return { ok: false, error: `Could not select "${val}" — tried native <select>, radio, checkbox, and custom dropdown. No visible matching option found.` };
      }

      if (type === 'get_form_fields') {
        // Return all interactive form elements on the page with their current state
        const fields = [];
        // Scan native form elements + ARIA-role elements + common custom dropdown triggers
        const inputs = document.querySelectorAll(
          'input, textarea, select, [contenteditable="true"], ' +
          '[role="combobox"], [role="listbox"], [role="spinbutton"], ' +
          '[aria-haspopup="listbox"], [aria-haspopup="true"], [aria-haspopup="menu"]'
        );
        for (const el of inputs) {
          // Skip hidden/invisible elements
          if (el.offsetParent === null && el.type !== 'hidden') continue;
          const field = {
            tag: el.tagName.toLowerCase(),
            type: el.type || null,
            name: el.name || null,
            id: el.id || null,
            // ALWAYS generate a usable selector — even without id/name
            selector: generateSelector(el),
            placeholder: el.placeholder || null,
            label: null,
            value: el.value || null,
            disabled: el.disabled || false,
            checked: el.type === 'checkbox' || el.type === 'radio' ? el.checked : undefined,
          };
          // Find associated label — try multiple strategies
          if (el.id) {
            const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (label) field.label = label.textContent.trim();
          }
          if (!field.label && el.closest('label')) {
            field.label = el.closest('label').textContent.trim();
          }
          if (!field.label) {
            const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
            if (aria) field.label = aria;
          }
          // Check preceding sibling or parent for label-like text
          if (!field.label) {
            const prev = el.previousElementSibling;
            if (prev && prev.textContent && prev.textContent.trim().length < 80) {
              field.label = prev.textContent.trim();
            }
          }
          if (!field.label) {
            const parent = el.parentElement;
            if (parent) {
              const labelEl = parent.querySelector('.field-title, .label, .form-label, label, legend, [class*="label"]');
              if (labelEl && labelEl.textContent.trim().length < 80) {
                field.label = labelEl.textContent.trim();
              }
            }
          }
          // For select elements, include ALL available options with their values
          if (el.tagName === 'SELECT') {
            field.options = Array.from(el.options).map((o) => ({
              value: o.value,
              text: o.textContent.trim(),
              selected: o.selected,
              disabled: o.disabled,
            }));
          }
          fields.push(field);
        }
        // Also get buttons for context — with generated selectors
        const buttons = [];
        document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"], a.btn, a[class*="button"]').forEach((btn) => {
          if (btn.offsetParent === null) return; // Skip hidden
          buttons.push({
            tag: btn.tagName.toLowerCase(),
            type: btn.type || null,
            text: (btn.innerText || btn.value || '').trim().substring(0, 100),
            selector: generateSelector(btn),
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
        if (!target) return { ok: false, error: `set_value target not found: selector="${action.selector || ''}"` };
        const val = action.value ?? action.text ?? '';
        const inputType = (target.type || '').toLowerCase();
        // Handle native input types that need special setter (React/Vue controlled inputs)
        // Must use the correct prototype based on element type — HTMLInputElement setter throws on textarea
        const proto = target instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
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
        if (!target) return { ok: false, error: `upload_file target not found: selector="${action.selector || ''}"` };
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
        if (!target) return { ok: false, error: `Focus target not found: selector="${action.selector || ''}"` };
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
        if (!target) return { ok: false, error: `Clear target not found: selector="${action.selector || ''}"` };
        if (target.isContentEditable) {
          target.textContent = '';
        } else if ('value' in target) {
          const proto = target instanceof HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
          const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
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

  injectMonitorScript();

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
