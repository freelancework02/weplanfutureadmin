/**
 * Global notification and loading system
 * Provides consistent alerts and loading indicators across all pages
 */
(function() {
  'use strict';

  // Notification container (created on first use)
  let notificationContainer = null;

  function getContainer() {
    if (!notificationContainer) {
      notificationContainer = document.createElement('div');
      notificationContainer.id = 'global-notifications';
      notificationContainer.className = 'fixed top-4 right-4 z-50 space-y-2 max-w-md';
      document.body.appendChild(notificationContainer);
    }
    return notificationContainer;
  }

  /**
   * Show a notification toast
   * @param {string} message - Message to display
   * @param {string} type - 'success', 'error', 'info', 'warning'
   * @param {number} duration - Auto-close duration in ms (0 = no auto-close)
   */
  function showNotification(message, type = 'info', duration = 4000) {
    const container = getContainer();
    const notification = document.createElement('div');
    
    const typeClasses = {
      success: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-900/40 dark:text-emerald-100',
      error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-900/40 dark:text-red-100',
      info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-900/40 dark:text-blue-100',
      warning: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-900/40 dark:text-amber-100'
    };

    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ',
      warning: '⚠'
    };

    notification.className = `rounded-lg border p-4 shadow-lg flex items-start gap-3 animate-slide-in ${typeClasses[type] || typeClasses.info}`;
    notification.innerHTML = `
      <span class="text-lg font-bold flex-shrink-0">${icons[type] || icons.info}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium">${escapeHtml(message)}</p>
      </div>
      <button class="flex-shrink-0 text-current opacity-70 hover:opacity-100" onclick="this.parentElement.remove()" aria-label="Close">✕</button>
    `;

    container.appendChild(notification);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentElement) {
          notification.style.animation = 'slide-out 0.3s ease-out';
          setTimeout(() => notification.remove(), 300);
        }
      }, duration);
    }

    return notification;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Show success notification
   */
  function success(message, duration = 4000) {
    return showNotification(message, 'success', duration);
  }

  /**
   * Show error notification
   */
  function error(message, duration = 6000) {
    return showNotification(message, 'error', duration);
  }

  /**
   * Show info notification
   */
  function info(message, duration = 4000) {
    return showNotification(message, 'info', duration);
  }

  /**
   * Show warning notification
   */
  function warning(message, duration = 5000) {
    return showNotification(message, 'warning', duration);
  }

  // Loading overlay system
  let loadingOverlay = null;

  function getLoadingOverlay() {
    if (!loadingOverlay) {
      loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'global-loading-overlay';
      loadingOverlay.className = 'fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center hidden';
      loadingOverlay.innerHTML = `
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-xl flex flex-col items-center gap-4">
          <div class="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent"></div>
          <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Loading...</p>
        </div>
      `;
      document.body.appendChild(loadingOverlay);
    }
    return loadingOverlay;
  }

  /**
   * Show global loading overlay
   * @param {string} message - Optional loading message
   */
  function showLoading(message = 'Loading...') {
    const overlay = getLoadingOverlay();
    const messageEl = overlay.querySelector('p');
    if (messageEl) messageEl.textContent = message;
    overlay.classList.remove('hidden');
  }

  /**
   * Hide global loading overlay
   */
  function hideLoading() {
    const overlay = getLoadingOverlay();
    if (overlay) overlay.classList.add('hidden');
  }

  /**
   * Show loading on button
   * @param {HTMLElement} button - Button element
   * @param {string} loadingText - Text to show while loading
   * @returns {Function} - Function to restore button state
   */
  function showButtonLoading(button, loadingText = 'Loading...') {
    if (!button) return () => {};
    
    const originalText = button.textContent;
    const originalDisabled = button.disabled;
    
    button.disabled = true;
    button.innerHTML = `
      <span class="inline-flex items-center gap-2">
        <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        ${loadingText}
      </span>
    `;
    
    return function restore() {
      button.disabled = originalDisabled;
      button.textContent = originalText;
    };
  }

  // Expose to window
  window.Notify = {
    success,
    error,
    info,
    warning,
    show: showNotification,
    showLoading,
    hideLoading,
    showButtonLoading,
    // Aliases for backward compatibility
    showLoader: showLoading,
    hideLoader: hideLoading
  };

  // Add CSS animations if not already present
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slide-in {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slide-out {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
      .animate-slide-in {
        animation: slide-in 0.3s ease-out;
      }
    `;
    document.head.appendChild(style);
  }
})();
