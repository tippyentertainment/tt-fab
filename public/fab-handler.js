// FAB Extension Handler - Auto-fills chat input from URL parameter
(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const message = urlParams.get('message');
  
  if (message) {
    // Wait for the chat input to be available
    const checkInterval = setInterval(() => {
      const chatInput = document.querySelector('textarea') || 
                        document.querySelector('input[type="text"]');
      
      if (chatInput) {
        clearInterval(checkInterval);
        
        // Set the message value
        chatInput.value = message;
        chatInput.focus();
        
        // Trigger input event to activate send button
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }, 100);
    
    // Stop checking after 5 seconds
    setTimeout(() => clearInterval(checkInterval), 5000);
  }
})();