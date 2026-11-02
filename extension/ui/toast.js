/**
 * Toast Notification System
 */
export function showToast(message, type = 'info', duration = 2400) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-pill ${type}`;

  const dot = document.createElement('span');
  dot.className = 'toast-dot';

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;

  toast.appendChild(dot);
  toast.appendChild(text);

  container.appendChild(toast);

  // Trigger entrance
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 250);
  }, duration);
}
