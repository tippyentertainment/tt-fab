// Content script - runs on all pages

// Create FAB element
function createFAB() {
  const fab = document.createElement('div');
  fab.id = 'fab-button';
  fab.innerHTML = '+';
  fab.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 56px;
    height: 56px;
    background: #4285f4;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    z-index: 999999;
    transition: transform 0.2s, box-shadow 0.2s;
  `;
  
  fab.addEventListener('mouseenter', () => {
    fab.style.transform = 'scale(1.1)';
    fab.style.boxShadow = '0 6px 12px rgba(0,0,0,0.4)';
  });
  
  fab.addEventListener('mouseleave', () => {
    fab.style.transform = 'scale(1)';
    fab.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
  });
  
  fab.addEventListener('click', () => {
    alert('FAB clicked! Add your action here.');
  });
  
  document.body.appendChild(fab);
}

// Wait for page to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createFAB);
} else {
  createFAB();
}