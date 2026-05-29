/**
 * shelf.js — Shelf screen: tabbed book list with progress bars.
 */

const ShelfScreen = (() => {
  const TABS = [
    { key: 'reading',      label: 'Reading' },
    { key: 'want-to-read', label: 'Want to Read' },
    { key: 'finished',     label: 'Finished' },
    { key: 'all',          label: 'All' },
  ];

  let _activeTab = 'reading';
  let _books     = [];
  let _loading   = false;

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    const screen = document.getElementById('screen');
    screen.innerHTML = `
      <div class="flex items-center justify-between px-4 pt-5 pb-2">
        <h1 class="text-2xl font-bold text-stone-900">My Shelf</h1>
        <button id="shelf-add-btn"
          class="w-9 h-9 rounded-full bg-yellow-400 text-stone-900 flex items-center justify-center shadow-sm active:opacity-80">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
          </svg>
        </button>
      </div>

      <!-- Connection warning -->
      <div id="conn-warn" class="mx-4 mb-2 rounded-lg text-sm px-3 py-2"></div>

      <!-- Tabs -->
      <div class="flex border-b border-blue-200 px-4 gap-1 overflow-x-auto no-scrollbar">
        ${TABS.map(t => `
          <button data-tab="${t.key}"
            class="tab-btn shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors
              ${_activeTab === t.key
                ? 'border-yellow-400 text-yellow-700'
                : 'border-transparent text-stone-500 hover:text-stone-700'}">
            ${t.label}
          </button>
        `).join('')}
      </div>

      <!-- Book list -->
      <div id="book-list" class="p-4 space-y-3">
        ${_loading ? renderLoading() : renderBooks()}
      </div>
    `;

    // Bind
    screen.querySelector('#shelf-add-btn').addEventListener('click', () => App.navigate('/add'));
    screen.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeTab = btn.dataset.tab;
        render();
      });
    });

    Toast.updateConnBanner();

    if (!_loading) {
      document.querySelectorAll('.book-card').forEach(card => {
        card.addEventListener('click', () => App.navigate(`/book/${card.dataset.slug}`));
      });
      loadVisibleImages();
      document.getElementById('book-list')?.addEventListener('scroll', loadVisibleImages);
    }
  }

  function renderLoading() {
    return `
      ${[1,2,3].map(() => `
        <div class="bg-white rounded-xl p-3 flex gap-3 shadow-sm animate-pulse">
          <div class="w-16 rounded-lg bg-stone-200" style="aspect-ratio:2/3"></div>
          <div class="flex-1 space-y-2 pt-1">
            <div class="h-4 bg-stone-200 rounded w-3/4"></div>
            <div class="h-3 bg-stone-200 rounded w-1/2"></div>
          </div>
        </div>
      `).join('')}
    `;
  }

  function renderBooks() {
    const filtered = _activeTab === 'all'
      ? _books
      : _books.filter(b => b.status === _activeTab);

    if (filtered.length === 0) return renderEmpty();

    return filtered.map(book => renderCard(book)).join('');
  }

  function renderEmpty() {
    const msgs = {
      'reading':      'No books in progress.<br>Tap + to start one.',
      'want-to-read': 'Your reading list is empty.<br>Tap + to add a book.',
      'finished':     'No finished books yet.<br>Keep reading!',
      'all':          'No books yet.<br>Tap + to add your first book.',
    };
    return `
      <div class="flex flex-col items-center justify-center py-16 text-stone-400">
        <svg class="w-16 h-16 mb-4 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
        <p class="text-sm text-center" style="line-height:1.7">${msgs[_activeTab]}</p>
      </div>
    `;
  }

  function renderCard(book) {
    const pct = calcPercent(book);
    const formatBadge = book.format && book.format !== 'paper'
      ? `<span class="text-xs bg-stone-100 text-stone-500 rounded px-1.5 py-0.5 font-medium">${fmtFormat(book.format)}</span>`
      : '';

    return `
      <div data-slug="${book.slug}"
        class="book-card bg-white rounded-xl shadow-sm flex gap-3 p-3 active:opacity-75 cursor-pointer">
        <div class="w-16 shrink-0 rounded-lg overflow-hidden shadow-sm">
          ${book.cover_thumb
            ? `<img data-src="${book.cover_thumb}" class="book-cover lazy-img w-full" />`
            : `<div class="cover-placeholder w-full"><svg class="w-7 h-7 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg></div>`
          }
        </div>
        <div class="flex-1 min-w-0 py-0.5">
          <div class="flex items-start gap-1.5 flex-wrap">
            <h3 class="font-semibold text-stone-900 text-sm leading-snug">${esc(book.title)}</h3>
            ${formatBadge}
          </div>
          <p class="text-xs text-stone-500 mt-0.5 truncate">${esc(book.author)}</p>
          ${book.status === 'reading' ? `
            <div class="mt-2">
              <div class="flex justify-between text-xs text-stone-400 mb-1">
                <span>${progressLabel(book)}</span>
                <span>${pct}%</span>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width:${pct}%"></div>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function fmtFormat(f) {
    return { paper: 'Paper', kindle: 'Kindle', ebook: 'eBook' }[f] || f;
  }

  function progressLabel(book) {
    if (book.progress_unit === 'percent') return `${book.current_page || 0}%`;
    return `p. ${book.current_page || 0} / ${book.total_pages || '?'}`;
  }

  function calcPercent(book) {
    if (book.progress_unit === 'percent') return Math.min(100, book.current_page || 0);
    if (!book.total_pages) return 0;
    return Math.round(Math.min(100, ((book.current_page || 0) / book.total_pages) * 100));
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Lazy-load images ──────────────────────────────────────────────────────

  async function loadVisibleImages() {
    const imgs = document.querySelectorAll('.lazy-img[data-src]');
    for (const img of imgs) {
      // simple visibility check
      const rect = img.getBoundingClientRect();
      if (rect.bottom < -200 || rect.top > window.innerHeight + 200) continue;
      const path = img.dataset.src;
      img.removeAttribute('data-src');
      try {
        img.src = await GitHub.loadImage(path);
      } catch {
        img.closest('.w-16').innerHTML = `<div class="cover-placeholder w-full" style="aspect-ratio:2/3"></div>`;
      }
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async function mount() {
    _loading = true;
    render();

    try {
      _books = await Store.listBooks();
    } catch (e) {
      Toast.error('Could not load books: ' + e.message);
      _books = [];
    }

    _loading = false;
    render();
  }

  return { mount };
})();
