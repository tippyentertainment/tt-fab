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
})();
