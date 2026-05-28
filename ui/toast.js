/**
 * toast.js — Lightweight toast notifications and connection warning banner.
 */

const Toast = (() => {
  const container = () => document.getElementById('toast-container');

  function show(message, type = 'success', duration = 3000) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container().appendChild(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('show'));
    });
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, duration);
  }

  const success = (msg, dur) => show(msg, 'success', dur);
  const error   = (msg, dur) => show(msg, 'error', dur || 4000);
  const warn    = (msg, dur) => show(msg, 'warn', dur || 4000);

  /** Show or hide the connection warning banner. */
  function updateConnBanner() {
    const state = Images.connectionState();
    const banner = document.getElementById('conn-warn');
    if (!banner) return;
    if (state === 'offline') {
      banner.textContent = 'You\'re offline — uploads and saves will fail.';
      banner.style.display = 'block';
    } else if (state === 'slow') {
      banner.textContent = 'Slow connection detected — uploads may take longer.';
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  }

  /** Check connection before a write action. Returns false if we should abort. */
  function checkConn() {
    const state = Images.connectionState();
    if (state === 'offline') {
      error('You\'re offline. Connect to the internet and try again.');
      return false;
    }
    if (state === 'slow') {
      warn('Slow connection — upload may take a while.');
    }
    return true;
  }

  return { success, error, warn, checkConn, updateConnBanner };
})();
