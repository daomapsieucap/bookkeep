/**
 * app.js — Hash-based router and app bootstrap.
 *
 * Routes:
 *   #/shelf          → ShelfScreen
 *   #/book/<slug>    → BookDetailScreen
 *   #/add            → AddEditScreen (add mode)
 *   #/edit/<slug>    → AddEditScreen (edit mode)
 *   #/settings       → SettingsScreen
 */

const App = (() => {

  function navigate(path) {
    window.location.hash = path;
  }

  function showNav(visible) {
    const nav = document.getElementById('bottom-nav');
    if (nav) nav.classList.toggle('hidden', !visible);
  }

  function setActiveNav(key) {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.nav === key);
    });
  }

  function route() {
    const hash  = window.location.hash || '#/shelf';
    const path  = hash.slice(1); // strip leading #

    const configured = GitHub.isConfigured();

    // Always allow settings
    if (path === '/settings' || path === '') {
      setActiveNav('settings');
      SettingsScreen.mount();
      showNav(configured);
      return;
    }

    // If not configured, redirect to settings
    if (!configured) {
      navigate('/settings');
      return;
    }

    showNav(true);

    if (path === '/shelf' || path === '/') {
      setActiveNav('shelf');
      ShelfScreen.mount();
    } else if (path === '/add') {
      setActiveNav('add');
      AddEditScreen.mount(null);
    } else if (path.startsWith('/edit/')) {
      setActiveNav(null);
      const slug = path.slice('/edit/'.length);
      AddEditScreen.mount(slug);
    } else if (path.startsWith('/book/')) {
      setActiveNav(null);
      const slug = path.slice('/book/'.length);
      BookDetailScreen.mount(slug);
    } else {
      // Unknown route → shelf
      navigate('/shelf');
    }
  }

  function init() {
    // Wire bottom nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.nav;
        if (key === 'shelf')    navigate('/shelf');
        else if (key === 'add') navigate('/add');
        else if (key === 'settings') navigate('/settings');
      });
    });

    // Initial show/hide of nav
    showNav(GitHub.isConfigured());

    // Route on hash change
    window.addEventListener('hashchange', route);

    // Initial route
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = GitHub.isConfigured() ? '#/shelf' : '#/settings';
    }
    route();
  }

  return { navigate, showNav, setActiveNav, init };
})();

// Bootstrap on DOMContentLoaded
document.addEventListener('DOMContentLoaded', App.init);
