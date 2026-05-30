/**
 * book-detail.js — Book Detail screen.
 * Shows cover, metadata, progress control, notes editor, highlights gallery.
 */

const BookDetailScreen = (() => {
  let _slug      = null;
  let _meta      = null;
  let _body      = '';
  let _sha       = null;
  let _coverUrl  = null;
  let _editingNotes  = false;
  let _savingProgress = false;
  let _notesDebounce  = null;
  let _openMenuId     = null; // highlight id with open menu
  let _notesSaveTimer = null;

  // ── Mount ────────────────────────────────────────────────────────────────

  async function mount(slug) {
    _slug     = slug;
    _meta     = null;
    _body     = '';
    _sha      = null;
    _coverUrl = null;
    _editingNotes   = false;
    _openMenuId     = null;
    _savingProgress = false;
    clearTimeout(_notesDebounce);
    clearTimeout(_notesSaveTimer);

    renderLoading();
    try {
      const data = await Store.getBookNotes(_slug);
      if (!data) { Toast.error('Book not found.'); App.navigate('/shelf'); return; }
      _meta = data.meta;
      _body = data.body || '';
      _sha  = data.sha;
    } catch (e) {
      Toast.error('Failed to load book: ' + e.message);
      App.navigate('/shelf');
      return;
    }
    render();
    loadCover();
    loadHighlightThumbs();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function renderLoading() {
    document.getElementById('screen').innerHTML = `
      <div class="flex items-center justify-center h-64">
        <div class="spinner" style="border-color:rgba(120,113,108,0.3);border-top-color:#78716c"></div>
      </div>`;
  }

  function render() {
    const m = _meta;
    document.getElementById('screen').innerHTML = `
      <div id="conn-warn" class="text-sm px-4 py-2" style="display:none"></div>

      <!-- Header -->
      <div class="flex items-center gap-2 px-4 pt-5 pb-2">
        <button id="back-btn" class="w-9 h-9 flex items-center justify-center text-stone-500 active:opacity-60 shrink-0">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-stone-400 uppercase tracking-widest">Bookkeep</p>
          <h1 class="text-lg font-bold text-stone-900 truncate">${esc(m.title)}</h1>
        </div>
        <button id="edit-btn"
          class="text-sm text-stone-500 font-medium active:opacity-60 shrink-0">Edit</button>
      </div>

      <!-- Book info card -->
      <div class="mx-4 mb-4 bg-white rounded-2xl shadow-sm p-4 flex gap-4">
        <div class="w-24 shrink-0 rounded-lg overflow-hidden shadow-sm">
          <div id="cover-wrap">
            <div class="cover-placeholder w-full" style="min-height:9rem">
              <div class="spinner" style="border-color:rgba(120,113,108,0.3);border-top-color:#78716c;width:24px;height:24px"></div>
            </div>
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <h2 class="font-semibold text-stone-900 text-base leading-snug">${esc(m.title)}</h2>
          <p class="text-sm text-stone-500 mt-0.5">${esc(m.author || '')}</p>
          ${m.isbn ? `<p class="text-xs text-stone-400 mt-1">ISBN ${esc(m.isbn)}</p>` : ''}
          <div class="flex items-center gap-2 mt-2 flex-wrap">
            ${statusBadge(m.status)}
            ${formatBadge(m.format)}
          </div>
          ${m.started_date  ? `<p class="text-xs text-stone-400 mt-1">Started ${m.started_date}</p>` : ''}
          ${m.finished_date ? `<p class="text-xs text-stone-400">Finished ${m.finished_date}</p>` : ''}
        </div>
      </div>

      <!-- Progress section (only when reading) -->
      ${m.status === 'reading' ? renderProgressSection() : ''}

      <!-- Status quick-change (when not reading) -->
      ${m.status !== 'reading' ? renderStatusButtons() : ''}

      <!-- Notes section -->
      <div class="mx-4 mb-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-semibold text-stone-700 text-sm uppercase tracking-wide">Notes</h3>
          <button id="toggle-notes-edit" class="text-sm text-stone-500 font-medium active:opacity-60">
            ${_editingNotes ? 'Preview' : 'Edit'}
          </button>
        </div>
        <div id="notes-content" class="bg-white rounded-xl shadow-sm p-4">
          ${renderNotesContent()}
        </div>
      </div>

      <!-- Highlights section -->
      <div class="mx-4 mb-6">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-stone-700 text-sm uppercase tracking-wide">Highlights</h3>
        </div>
        <div class="flex gap-2 mb-3">
          <button type="button" id="hl-camera-btn"
            class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-stone-300 text-stone-500 text-sm font-medium active:opacity-60">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            Camera
          </button>
          <button type="button" id="hl-gallery-btn"
            class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-stone-300 text-stone-500 text-sm font-medium active:opacity-60">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            Gallery
          </button>
        </div>
        <input id="hl-camera-input" type="file" accept="image/*" capture="environment" class="hidden" />
        <input id="hl-gallery-input" type="file" accept="image/*" multiple class="hidden" />
        <div id="highlights-grid" class="highlight-grid">
          ${renderHighlightGrid()}
        </div>
      </div>
    `;

    bindEvents();
    Toast.updateConnBanner();
  }

  function renderProgressSection() {
    const m   = _meta;
    const pct = calcPercent(m);
    const isPercent = m.progress_unit === 'percent';

    return `
      <div class="mx-4 mb-4 bg-white rounded-2xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-stone-700 text-sm">Progress</h3>
          <span id="pct-display" class="text-sm font-semibold text-stone-600">${pct}%</span>
        </div>
        <div class="progress-bar-track mb-4">
          <div id="progress-fill" class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        ${isPercent ? `
          <div class="flex items-center gap-2">
            <input id="prog-input" type="number" inputmode="numeric" min="0" max="100"
              value="${m.current_page || 0}"
              class="form-input text-right" style="width:5.5rem" />
            <span class="text-stone-500 font-medium">%</span>
            <span id="prog-save-indicator" class="text-xs text-stone-400 ml-auto"></span>
          </div>` : `
          <div class="flex items-center gap-2">
            <input id="prog-input" type="number" inputmode="numeric" min="0"
              value="${m.current_page || 0}"
              class="form-input text-right" style="width:5.5rem" />
            <span class="text-stone-400">/</span>
            <span class="text-stone-600 font-medium">${m.total_pages || '?'} pages</span>
            <span id="prog-save-indicator" class="text-xs text-stone-400 ml-auto"></span>
          </div>`}
        <div class="flex gap-2 mt-3">
          <button id="mark-finished-btn"
            class="flex-1 py-2 rounded-xl bg-stone-100 text-stone-600 text-sm font-medium active:opacity-60">
            Mark Finished
          </button>
        </div>
      </div>`;
  }

  function renderStatusButtons() {
    const m = _meta;
    if (m.status === 'want-to-read') {
      return `
        <div class="mx-4 mb-4">
          <button id="start-reading-btn"
            class="w-full py-3 rounded-xl bg-stone-800 text-white font-bold active:opacity-80">
            Start Reading
          </button>
        </div>`;
    }
    if (m.status === 'finished') {
      return `
        <div class="mx-4 mb-4">
          <button id="re-read-btn"
            class="w-full py-3 rounded-xl border border-stone-300 text-stone-600 font-semibold text-sm active:opacity-60">
            Re-read
          </button>
        </div>`;
    }
    return '';
  }

  function renderNotesContent() {
    if (_editingNotes) {
      return `<textarea id="notes-editor"
        class="w-full min-h-48 text-sm text-stone-700 leading-relaxed resize-none outline-none font-mono"
        placeholder="Add your notes in markdown…">${escHtml(_body)}</textarea>`;
    }
    if (!_body.trim()) {
      return `<p class="text-stone-400 text-sm italic">No notes yet — add them as you read.</p>`;
    }
    return `<div class="prose-notes text-sm">${marked.parse(_body)}</div>`;
  }

  function renderHighlightGrid() {
    const highlights = _meta.highlights || [];
    if (highlights.length === 0) {
      return `<p class="text-stone-400 text-sm col-span-2 text-center py-4 italic">No highlights yet.</p>`;
    }
    return highlights.map(h => `
      <div class="relative" data-hid="${h.id}">
        <div class="highlight-thumb-wrap">
          <img class="hl-lazy" data-src="${h.thumb}" style="opacity:0;transition:opacity 0.2s" />
          <div class="upload-overlay hl-upload-overlay" data-hid="${h.id}" style="display:none"></div>
          <button class="highlight-menu-btn hl-menu-btn" data-hid="${h.id}" title="Options">⋯</button>
        </div>
        ${h.caption ? `<div class="highlight-caption">${esc(h.caption)}</div>` : ''}
      </div>
    `).join('');
  }

  // ── Load images ───────────────────────────────────────────────────────────

  async function loadCover() {
    if (!_meta.cover_thumb) return;
    const wrap = document.getElementById('cover-wrap');
    if (!wrap) return;
    try {
      const url = await GitHub.loadImage(_meta.cover_thumb);
      if (url) {
        _coverUrl = url;
        wrap.innerHTML = `<img src="${url}" class="book-cover w-full" />`;
      } else {
        wrap.innerHTML = `<div class="cover-placeholder w-full" style="min-height:9rem"></div>`;
      }
    } catch {
      wrap.innerHTML = `<div class="cover-placeholder w-full" style="min-height:9rem"></div>`;
    }
  }

  async function loadHighlightThumbs() {
    const imgs = document.querySelectorAll('.hl-lazy[data-src]');
    for (const img of imgs) {
      const src = img.dataset.src;
      img.removeAttribute('data-src');
      try {
        const url = await GitHub.loadImage(src);
        if (url) {
          img.src = url;
          img.style.opacity = '1';
          img.style.cursor = 'pointer';
          const hid = img.closest('[data-hid]')?.dataset.hid;
          if (hid) {
            img.addEventListener('click', () => openHighlightFullRes(hid));
          }
        } else {
          img.closest('.highlight-thumb-wrap').innerHTML =
            `<div class="w-full h-full bg-stone-200 flex items-center justify-center text-xs text-stone-400">No image</div>`;
        }
      } catch {
        img.closest('.highlight-thumb-wrap').innerHTML =
          `<div class="w-full h-full bg-stone-200 flex items-center justify-center text-xs text-stone-400">Error</div>`;
      }
    }
  }

  async function openHighlightFullRes(hid) {
    const h = (_meta.highlights || []).find(x => x.id === hid);
    if (!h) return;
    try {
      const url = await GitHub.loadImage(h.image);
      window.open(url, '_blank');
    } catch (e) {
      Toast.error('Could not load image: ' + e.message);
    }
  }

  // ── Bind events ───────────────────────────────────────────────────────────

  function bindEvents() {
    const screen = document.getElementById('screen');

    screen.querySelector('#back-btn').addEventListener('click', () => history.back());
    screen.querySelector('#edit-btn').addEventListener('click', () => App.navigate(`/edit/${_slug}`));

    // Progress input
    const progInput = screen.querySelector('#prog-input');
    if (progInput) {
      progInput.addEventListener('input', () => updateProgressDisplay());
      progInput.addEventListener('change', () => scheduleProgressSave());
      progInput.addEventListener('blur',   () => scheduleProgressSave());
    }

    screen.querySelector('#mark-finished-btn')?.addEventListener('click', markFinished);
    screen.querySelector('#start-reading-btn')?.addEventListener('click', () => changeStatus('reading'));
    screen.querySelector('#re-read-btn')?.addEventListener('click', () => changeStatus('reading'));

    // Notes toggle
    screen.querySelector('#toggle-notes-edit').addEventListener('click', toggleNotesEdit);

    // Notes editor autosave
    screen.querySelector('#notes-editor')?.addEventListener('input', scheduleNotesSave);

    // Highlight camera/gallery
    screen.querySelector('#hl-camera-btn').addEventListener('click', () => {
      screen.querySelector('#hl-camera-input').click();
    });
    screen.querySelector('#hl-gallery-btn').addEventListener('click', () => {
      screen.querySelector('#hl-gallery-input').click();
    });
    screen.querySelector('#hl-camera-input').addEventListener('change', e => {
      if (e.target.files.length) handleHighlightFiles(Array.from(e.target.files));
    });
    screen.querySelector('#hl-gallery-input').addEventListener('change', e => {
      if (e.target.files.length) handleHighlightFiles(Array.from(e.target.files));
    });

    // Highlight menus
    screen.querySelectorAll('.hl-menu-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        showHighlightMenu(btn.dataset.hid, btn);
      });
    });

    // Close menu on outside click
    document.addEventListener('click', closeAllMenus);
  }

  // ── Progress ──────────────────────────────────────────────────────────────

  function updateProgressDisplay() {
    const input = document.getElementById('prog-input');
    if (!input) return;
    const val = parseInt(input.value) || 0;
    let pct;
    if (_meta.progress_unit === 'percent') {
      pct = Math.min(100, val);
    } else {
      pct = _meta.total_pages ? Math.round(Math.min(100, (val / _meta.total_pages) * 100)) : 0;
    }
    const fill = document.getElementById('progress-fill');
    const disp = document.getElementById('pct-display');
    if (fill) fill.style.width = `${pct}%`;
    if (disp) disp.textContent = `${pct}%`;
  }

  function scheduleProgressSave() {
    clearTimeout(_notesDebounce);
    _notesDebounce = setTimeout(saveProgress, 800);
  }

  async function saveProgress() {
    if (_savingProgress) return;
    const input = document.getElementById('prog-input');
    if (!input) return;
    const val = parseInt(input.value) || 0;
    const indicator = document.getElementById('prog-save-indicator');

    _savingProgress = true;
    if (indicator) indicator.textContent = 'Saving…';

    try {
      await Store.updateBook(_slug, {
        current_page: val,
        progress_unit: _meta.progress_unit,
      });
      _meta.current_page = val;
      if (indicator) indicator.textContent = 'Saved';
      setTimeout(() => { if (indicator) indicator.textContent = ''; }, 2000);
    } catch (e) {
      Toast.error('Save failed: ' + e.message);
      if (indicator) indicator.textContent = 'Error';
    } finally {
      _savingProgress = false;
    }
  }

  async function markFinished() {
    if (!Toast.checkConn()) return;
    const btn = document.getElementById('mark-finished-btn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await Store.updateBook(_slug, { status: 'finished' });
      Store.invalidateIndex();
      // Reload the screen to reflect the new state
      await mount(_slug);
      Toast.success('Marked as finished!');
    } catch (e) {
      Toast.error('Failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Mark Finished';
    }
  }

  async function changeStatus(status) {
    if (!Toast.checkConn()) return;
    try {
      await Store.updateBook(_slug, { status });
      Store.invalidateIndex();
      await mount(_slug);
    } catch (e) {
      Toast.error('Failed: ' + e.message);
    }
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  function toggleNotesEdit() {
    if (_editingNotes) {
      // Switching to preview — capture current text
      const ta = document.getElementById('notes-editor');
      if (ta) _body = ta.value;
    }
    _editingNotes = !_editingNotes;
    document.getElementById('notes-content').innerHTML = renderNotesContent();
    document.getElementById('toggle-notes-edit').textContent = _editingNotes ? 'Preview' : 'Edit';
    document.querySelector('#notes-editor')?.addEventListener('input', scheduleNotesSave);
  }

  function scheduleNotesSave() {
    const ta = document.getElementById('notes-editor');
    if (!ta) return;
    _body = ta.value;
    clearTimeout(_notesSaveTimer);
    _notesSaveTimer = setTimeout(saveNotes, 1500);
  }

  async function saveNotes() {
    try {
      await Store.updateNotes(_slug, _body);
    } catch (e) {
      Toast.error('Notes save failed: ' + e.message);
    }
  }

  // ── Highlights ────────────────────────────────────────────────────────────

  async function handleHighlightFiles(files) {
    if (!Toast.checkConn()) return;

    // Acquire wake lock to prevent screen sleeping during multi-image upload
    let wakeLock = null;
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* not critical */ }

    for (const file of files) {
      const id = `${_slug}-h-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
      await uploadNewHighlight(file, id);
      // Small delay between sequential uploads
      if (files.indexOf(file) < files.length - 1) await sleep(200);
    }

    if (wakeLock) wakeLock.release().catch(() => {});
  }

  async function uploadNewHighlight(file, id) {
    // Add a placeholder tile immediately
    const grid = document.getElementById('highlights-grid');
    // Remove empty message if present
    const empty = grid.querySelector('p');
    if (empty) empty.remove();

    const placeholder = document.createElement('div');
    placeholder.className = 'relative';
    placeholder.dataset.hid = id;
    placeholder.innerHTML = `
      <div class="highlight-thumb-wrap bg-stone-100">
        <div class="upload-overlay" style="display:flex">
          <div class="spinner"></div>
        </div>
      </div>`;
    grid.appendChild(placeholder);

    try {
      const { displayPath, thumbPath } = await Images.uploadHighlight(
        file, _slug, id,
        (stage) => {
          const overlay = placeholder.querySelector('.upload-overlay');
          if (overlay) overlay.innerHTML = `<div class="spinner"></div>`;
        }
      );

      const today = new Date().toISOString().slice(0, 10);
      const highlight = {
        id,
        image: displayPath,
        thumb: thumbPath,
        caption: '',
        added_date: today,
      };
      await Store.addHighlight(_slug, highlight);
      _meta.highlights = [...(_meta.highlights || []), highlight];

      // Replace placeholder with real thumbnail
      const url = await GitHub.loadImage(thumbPath);
      placeholder.innerHTML = `
        <div class="highlight-thumb-wrap">
          <img src="${url}" style="cursor:pointer" />
          <div class="upload-overlay hl-upload-overlay" data-hid="${id}" style="display:none"></div>
          <button class="highlight-menu-btn hl-menu-btn" data-hid="${id}">⋯</button>
        </div>`;

      placeholder.querySelector('img').addEventListener('click', () => openHighlightFullRes(id));
      placeholder.querySelector('.hl-menu-btn').addEventListener('click', e => {
        e.stopPropagation();
        showHighlightMenu(id, e.currentTarget);
      });

    } catch (e) {
      const msg = e instanceof Error
        ? e.message
        : e instanceof Event
          ? `${e.type}${e.target?.error ? ': ' + e.target.error.message : ''}`
          : String(e);
      placeholder.innerHTML = `
        <div class="highlight-thumb-wrap bg-red-50 flex items-center justify-center">
          <span class="text-xs text-red-400 p-2 text-center">Upload failed</span>
        </div>`;
      Toast.error('Upload failed: ' + msg);
    }
  }

  // ── Highlight menu ────────────────────────────────────────────────────────

  function showHighlightMenu(hid, anchor) {
    closeAllMenus();
    _openMenuId = hid;

    const menu = document.createElement('div');
    menu.id = 'hl-dropdown';
    menu.className = 'dropdown-menu';
    menu.innerHTML = `
      <button id="hl-menu-replace">Replace Image</button>
      <hr/>
      <button id="hl-menu-caption">Edit Caption</button>
      <hr/>
      <button id="hl-menu-delete" class="danger">Delete</button>
    `;

    // Position below anchor
    const rect = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top  = `${rect.bottom + 6}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    document.body.appendChild(menu);

    // Hidden file input for replace
    const replaceInput = document.createElement('input');
    replaceInput.type = 'file';
    replaceInput.accept = 'image/*';
    replaceInput.style.display = 'none';
    document.body.appendChild(replaceInput);

    menu.querySelector('#hl-menu-replace').addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      replaceInput.click();
    });
    replaceInput.addEventListener('change', () => {
      if (replaceInput.files[0]) replaceHighlight(hid, replaceInput.files[0]);
      replaceInput.remove();
    });

    menu.querySelector('#hl-menu-caption').addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      editCaption(hid);
    });

    menu.querySelector('#hl-menu-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllMenus();
      deleteHighlight(hid);
    });
  }

  function closeAllMenus(e) {
    const menu = document.getElementById('hl-dropdown');
    if (menu) menu.remove();
    _openMenuId = null;
  }

  async function replaceHighlight(hid, file) {
    if (!Toast.checkConn()) return;
    const h = (_meta.highlights || []).find(x => x.id === hid);
    if (!h) return;

    const tile = document.querySelector(`[data-hid="${hid}"]`);
    const overlay = tile?.querySelector('.hl-upload-overlay');
    if (overlay) { overlay.innerHTML = '<div class="spinner"></div>'; overlay.style.display = 'flex'; }

    try {
      // Get SHAs of existing images to overwrite them
      const [dSha, tSha] = await Promise.all([
        GitHub.getSha(h.image),
        GitHub.getSha(h.thumb),
      ]);

      await Images.uploadHighlight(file, _slug, hid, () => {}, dSha, tSha);
      await Store.updateHighlightImage(_slug, hid, h.image, h.thumb);

      // Refresh the thumbnail
      GitHub.evictImage(h.thumb);
      const url = await GitHub.loadImage(h.thumb);
      const img = tile?.querySelector('img');
      if (img && url) img.src = url;

      Toast.success('Image replaced.');
    } catch (e) {
      Toast.error('Replace failed: ' + e.message);
    } finally {
      if (overlay) overlay.style.display = 'none';
    }
  }

  async function editCaption(hid) {
    const h = (_meta.highlights || []).find(x => x.id === hid);
    if (!h) return;
    const newCaption = prompt('Caption:', h.caption || '');
    if (newCaption === null) return; // cancelled

    try {
      await Store.updateHighlightCaption(_slug, hid, newCaption);
      h.caption = newCaption;
      // Update caption in DOM
      const tile = document.querySelector(`[data-hid="${hid}"]`);
      if (tile) {
        let capEl = tile.querySelector('.highlight-caption');
        if (newCaption) {
          if (!capEl) {
            capEl = document.createElement('div');
            capEl.className = 'highlight-caption';
            tile.appendChild(capEl);
          }
          capEl.textContent = newCaption;
        } else if (capEl) {
          capEl.remove();
        }
      }
      Toast.success('Caption saved.');
    } catch (e) {
      Toast.error('Failed: ' + e.message);
    }
  }

  async function deleteHighlight(hid) {
    if (!confirm('Delete this highlight?')) return;
    if (!Toast.checkConn()) return;

    const tile = document.querySelector(`[data-hid="${hid}"]`);
    if (tile) tile.style.opacity = '0.4';

    try {
      await Images.deleteHighlight(_slug, hid);
      await Store.removeHighlight(_slug, hid);
      _meta.highlights = (_meta.highlights || []).filter(h => h.id !== hid);
      tile?.remove();
      if ((_meta.highlights || []).length === 0) {
        document.getElementById('highlights-grid').innerHTML =
          `<p class="text-stone-400 text-sm col-span-2 text-center py-4 italic">No highlights yet.</p>`;
      }
      Toast.success('Highlight deleted.');
    } catch (e) {
      if (tile) tile.style.opacity = '1';
      Toast.error('Delete failed: ' + e.message);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function calcPercent(m) {
    if (m.progress_unit === 'percent') return Math.min(100, m.current_page || 0);
    if (!m.total_pages) return 0;
    return Math.round(Math.min(100, ((m.current_page || 0) / m.total_pages) * 100));
  }

  function statusBadge(status) {
    const map = {
      'reading':      ['bg-stone-100 text-stone-600',  'Reading'],
      'want-to-read': ['bg-slate-100 text-slate-600',  'Want to Read'],
      'finished':     ['bg-green-100 text-green-700',   'Finished'],
    };
    const [cls, label] = map[status] || ['bg-stone-100 text-stone-500', status];
    return `<span class="text-xs font-medium px-2 py-0.5 rounded-full ${cls}">${label}</span>`;
  }

  function formatBadge(format) {
    if (!format || format === 'paper') return '';
    const label = { kindle: 'Kindle', ebook: 'eBook' }[format] || format;
    return `<span class="text-xs font-medium px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">${label}</span>`;
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  return { mount };
})();
