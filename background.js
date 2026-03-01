// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Auth state management
let authState = {
  token: null,
  user: null,
  provider: null
};

// Load auth state from storage on startup
chrome.storage.local.get(['authToken', 'authUser', 'authProvider'], (result) => {
  if (result.authToken) {
    authState.token = result.authToken;
    authState.user = result.authUser;
    authState.provider = result.authProvider;
    console.log('Restored auth state:', authState.provider, authState.user?.email);
  }
});

// OAuth providers configuration
const oauthProviders = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    scopes: ['email', 'profile'],
    userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo'
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    clientId: 'YOUR_GITHUB_CLIENT_ID',
    scopes: ['user:email'],
    userInfoUrl: 'https://api.github.com/user'
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    clientId: 'YOUR_MICROSOFT_CLIENT_ID',
    scopes: ['openid', 'email', 'profile'],
    userInfoUrl: 'https://graph.microsoft.com/v1.0/me'
  }
};

// Handle OAuth sign-in
async function signIn(provider) {
  const config = oauthProviders[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const redirectUrl = chrome.identity.getRedirectURL();
  const authUrl = `${config.authUrl}?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=token&scope=${config.scopes.join(' ')}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, async (responseUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!responseUrl) {
        reject(new Error('No response URL'));
        return;
      }

      // Extract token from response URL
      const token = extractTokenFromUrl(responseUrl, provider);
      if (!token) {
        reject(new Error('Failed to extract token'));
        return;
      }

      // Fetch user info
      const user = await fetchUserInfo(config.userInfoUrl, token, provider);

      // Save auth state
      authState = { token, user, provider };
      await chrome.storage.local.set({
        authToken: token,
        authUser: user,
        authProvider: provider
      });

      resolve({ user, provider });
    });
  });
}

// Extract token from OAuth response URL
function extractTokenFromUrl(url, provider) {
  if (provider === 'google' || provider === 'microsoft') {
    const match = url.match(/access_token=([^&]+)/);
    return match ? match[1] : null;
  } else if (provider === 'github') {
    const match = url.match(/access_token=([^&]+)/);
    return match ? match[1] : null;
  }
  return null;
}

// Fetch user info from OAuth provider
async function fetchUserInfo(url, token, provider) {
  const headers = {
    'Authorization': provider === 'github' ? `token ${token}` : `Bearer ${token}`
  };

  const response = await fetch(url, { headers });
  const data = await response.json();

  return {
    email: data.email || data.mail,
    name: data.name || data.login,
    avatar: data.avatar_url || data.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || data.login)}&background=8b5cf6&color=fff`,
    id: data.id
  };
}

// Sign out
async function signOut() {
  authState = { token: null, user: null, provider: null };
  await chrome.storage.local.remove(['authToken', 'authUser', 'authProvider']);
}

// Handle messages from sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Screenshot capture
  if (request.action === 'captureScreenshot') {
    chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 }, (dataUrl) => {
      sendResponse({ screenshot: dataUrl });
    });
    return true;
  }

  // OAuth sign-in
  if (request.action === 'signIn') {
    signIn(request.provider)
      .then(result => sendResponse({ success: true, user: result.user }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  // Sign-out
  if (request.action === 'signOut') {
    signOut()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }

  // Get auth state
  if (request.action === 'getAuthState') {
    sendResponse(authState);
    return true;
  }

  // Send to AI with auth token
  if (request.action === 'sendToAI') {
    console.log('background: sending to AI', request.payload);
    const base = 'https://tasking.tech';
    const candidates = [
      '/api/bridge',
      '/api/chat',
      '/taskingbot/api/chat'
    ];

    (async function tryPaths(idx) {
      if (idx >= candidates.length) {
        sendResponse({ error: 'all endpoints failed' });
        return;
      }

      const url = base + candidates[idx];
      console.log('background: trying endpoint', url);

      try {
        const headers = {
          'Content-Type': 'application/json'
        };

        // Add auth token if available
        if (authState.token) {
          headers['Authorization'] = `Bearer ${authState.token}`;
        }

        const r = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(request.payload)
        });

        const text = await r.text();
        console.log('background: response from', url, r.status);

        if (r.status === 404) {
          return tryPaths(idx + 1);
        }

        if (!r.ok) {
          console.error('background failed status', r.status, text);
          sendResponse({ error: 'status ' + r.status + ' - ' + text });
          return;
        }

        try {
          const data = JSON.parse(text);
          sendResponse({ result: data });
        } catch (parseErr) {
          console.error('Background parse error, raw response:', text);
          sendResponse({ error: 'Invalid JSON response: ' + parseErr.message + ' - ' + text });
        }
      } catch (err) {
        console.error('background fetch error', err);
        sendResponse({ error: err.message });
      }
    })(0);

    return true;
  }

  // Browser automation: Fill form
  if (request.action === 'fillForm') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, request, sendResponse);
    });
    return true;
  }

  // Browser automation: Click element
  if (request.action === 'clickElement') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, request, sendResponse);
    });
    return true;
  }

  // Browser automation: Extract content
  if (request.action === 'extractContent') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, request, sendResponse);
    });
    return true;
  }

  // Browser automation: Navigate
  if (request.action === 'navigate') {
    chrome.tabs.update({ url: request.url }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});