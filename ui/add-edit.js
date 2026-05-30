/**
 * add-edit.js — Add Book and Edit Book form (shared).
 * Route /add → new book. Route /edit/<slug> → edit existing.
 */

const AddEditScreen = (() => {

  let _slug    = null; // null = add mode
  let _book    = null; // loaded meta when editing
  let _noteSha = null;
  let _saving  = false;
  let _coverFile   = null;
  let _coverPreview = null; // object URL for cover preview

  // ── Mount ────────────────────────────────────────────────────────────────

  async function mount(slug) {
    _slug    = slug || null;
    _book    = null;
    _noteSha = null;
    _coverFile    = null;
    _coverPreview = null;
    _unitOverride = null;

    if (_slug) {
      renderLoading();
      try {
        const data = await Store.getBookNotes(_slug);
        if (!data) { Toast.error('Book not found.'); App.navigate('/shelf'); return; }
        _book    = data.meta;
        _noteSha = data.sha;
      } catch (e) {
        Toast.error('Failed to load book: ' + e.message);
        App.navigate('/shelf');
        return;
      }
    }
    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function renderLoading() {
    document.getElementById('screen').innerHTML = `
      <div class="flex items-center justify-center h-64">
        <div class="spinner" style="border-color:rgba(120,113,108,0.3);border-top-color:#78716c"></div>
      </div>`;
  }

  function render() {
    const isEdit  = !!_slug;
    const b       = _book || {};
    const fmt     = b.format        || 'paper';
    const status  = b.status        || 'want-to-read';
    const pUnit   = b.progress_unit || (fmt === 'paper' ? 'pages' : 'percent');

    document.getElementById('screen').innerHTML = `
      <div class="flex items-center gap-3 px-4 pt-5 pb-2">
        <button id="back-btn" class="w-9 h-9 flex items-center justify-center text-stone-500 active:opacity-60">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 class="text-xl font-bold text-stone-900">${isEdit ? 'Edit Book' : 'Add Book'}</h1>
      </div>

      <form id="book-form" class="px-4 pb-8 space-y-5">

        <!-- Cover -->
        <div>
          <label class="form-label">Cover Photo</label>
          <div class="flex gap-3 items-start">
            <div id="cover-preview-wrap" class="w-20 shrink-0 rounded-lg overflow-hidden shadow-sm bg-stone-100">
              ${renderCoverPreview(b)}
            </div>
            <div class="flex flex-col gap-2 pt-1">
              <button type="button" id="cover-camera-btn"
                class="flex items-center gap-2 text-sm font-medium text-stone-500 active:opacity-60">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                Take Photo
              </button>
              <button type="button" id="cover-gallery-btn"
                class="flex items-center gap-2 text-sm font-medium text-stone-500 active:opacity-60">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                Choose from Gallery
              </button>
              <input id="cover-camera-input" type="file" accept="image/*" capture="environment" class="hidden" />
              <input id="cover-gallery-input" type="file" accept="image/*" class="hidden" />
            </div>
          </div>
        </div>

        <!-- Title -->
        <div>
          <label class="form-label" for="f-title">Title <span class="text-red-400">*</span></label>
          <input id="f-title" class="form-input" type="text" placeholder="Book title"
            value="${esc(b.title || '')}" autocomplete="off" />
        </div>

        <!-- Author -->
        <div>
          <label class="form-label" for="f-author">Author</label>
          <input id="f-author" class="form-input" type="text" placeholder="Author name(s)"
            value="${esc(b.author || '')}" autocomplete="off" />
        </div>

        <!-- ISBN -->
        <div>
          <label class="form-label" for="f-isbn">ISBN <span class="text-stone-400 font-normal">(optional)</span></label>
          <input id="f-isbn" class="form-input" type="text" inputmode="numeric" placeholder="9780135957059"
            value="${esc(b.isbn || '')}" autocomplete="off" />
        </div>

        <!-- Format -->
        <div>
          <label class="form-label">Format</label>
          <div class="seg-control" id="fmt-control">
            ${['paper','kindle','ebook'].map(f => `
              <div class="seg-btn ${fmt === f ? 'active' : ''}" data-val="${f}">
                ${f === 'paper' ? 'Paper' : f === 'kindle' ? 'Kindle' : 'eBook'}
              </div>`).join('')}
          </div>
        </div>

        <!-- Status -->
        <div>
          <label class="form-label">Status</label>
          <div class="seg-control" id="status-control">
            ${[['want-to-read','Want to Read'],['reading','Reading'],['finished','Finished']].map(([v,l]) => `
              <div class="seg-btn ${status === v ? 'active' : ''}" data-val="${v}">${l}</div>`).join('')}
          </div>
        </div>

        <!-- Progress -->
        <div id="progress-section">
          ${renderProgressFields(pUnit, b)}
        </div>

        <!-- Submit -->
        <button type="submit" id="submit-btn"
          class="w-full py-3 rounded-xl bg-stone-800 text-white font-bold text-base active:opacity-80 flex items-center justify-center gap-2">
          ${isEdit ? 'Save Changes' : 'Add Book'}
        </button>

        ${isEdit ? `
          <button type="button" id="delete-btn"
            class="w-full py-3 rounded-xl border border-red-200 text-red-500 font-medium text-sm active:opacity-60">
            Delete Book
          </button>` : ''}
      </form>
    `;

    bindEvents();
    loadExistingCover();
  }

  function renderCoverPreview(b) {
    if (_coverPreview) {
      return `<img src="${_coverPreview}" class="book-cover w-full" />`;
    }
    if (b.cover_thumb) {
      return `<img id="existing-cover-img" class="book-cover w-full" />`;
    }
    return `<div class="cover-placeholder w-full" style="min-height:6rem">
      <svg class="w-7 h-7 text-stone-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
      </svg>
    </div>`;
  }

  function renderProgressFields(pUnit, b) {
    const status = getCurrentStatus();
    if (status === 'want-to-read') return '';

    if (pUnit === 'percent') {
      return `
        <div>
          <label class="form-label">Progress</label>
          <div class="flex items-center gap-2">
            <input id="f-current" class="form-input text-right" type="number" inputmode="numeric"
              min="0" max="100" placeholder="0" value="${b.current_page || 0}" style="width:5rem" />
            <span class="text-stone-500 font-medium">%</span>
          </div>
          <div class="flex items-center gap-2 mt-2">
            <span class="text-sm text-stone-400">Tracking by percent</span>
            <button type="button" id="toggle-unit-btn" class="text-xs text-stone-500 underline">Switch to pages</button>
          </div>
        </div>`;
    }

    return `
      <div>
        <label class="form-label">Pages</label>
        <div class="flex items-center gap-2">
          <input id="f-current" class="form-input text-right" type="number" inputmode="numeric"
            min="0" placeholder="0" value="${b.current_page || 0}" style="width:5rem" />
          <span class="text-stone-400">/</span>
          <input id="f-total" class="form-input text-right" type="number" inputmode="numeric"
            min="1" placeholder="350" value="${b.total_pages || ''}" style="width:5rem" />
          <span class="text-stone-500 font-medium">pages</span>
        </div>
        ${getCurrentFormat() !== 'paper' ? `
          <div class="flex items-center gap-2 mt-2">
            <button type="button" id="toggle-unit-btn" class="text-xs text-stone-500 underline">Switch to percent</button>
          </div>` : ''}
      </div>`;
  }

  // ── Bind events ───────────────────────────────────────────────────────────

  function bindEvents() {
    const screen = document.getElementById('screen');

    screen.querySelector('#back-btn').addEventListener('click', () => history.back());

    // Segmented controls
    screen.querySelectorAll('#fmt-control .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        screen.querySelectorAll('#fmt-control .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        refreshProgressSection();
      });
    });
    screen.querySelectorAll('#status-control .seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        screen.querySelectorAll('#status-control .seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        refreshProgressSection();
      });
    });

    // Cover inputs
    screen.querySelector('#cover-camera-btn').addEventListener('click', () => {
      screen.querySelector('#cover-camera-input').click();
    });
    screen.querySelector('#cover-gallery-btn').addEventListener('click', () => {
      screen.querySelector('#cover-gallery-input').click();
    });
    screen.querySelector('#cover-camera-input').addEventListener('change', e => {
      if (e.target.files[0]) handleCoverFile(e.target.files[0]);
    });
    screen.querySelector('#cover-gallery-input').addEventListener('change', e => {
      if (e.target.files[0]) handleCoverFile(e.target.files[0]);
    });

    // Unit toggle
    screen.querySelector('#toggle-unit-btn')?.addEventListener('click', toggleUnit);

    // Form submit
    screen.querySelector('#book-form').addEventListener('submit', e => {
      e.preventDefault();
      handleSubmit();
    });

    // Delete
    screen.querySelector('#delete-btn')?.addEventListener('click', handleDelete);
  }

  function getCurrentFormat() {
    return document.querySelector('#fmt-control .seg-btn.active')?.dataset.val || 'paper';
  }
  function getCurrentStatus() {
    return document.querySelector('#status-control .seg-btn.active')?.dataset.val || 'want-to-read';
  }
  function getCurrentUnit() {
    const fmt = getCurrentFormat();
    const hasToggle = document.getElementById('toggle-unit-btn');
    if (!hasToggle) return fmt === 'paper' ? 'pages' : 'percent';
    // If toggle exists, read current state from presence of #f-total
    return document.getElementById('f-total') ? 'pages' : 'percent';
  }

  let _unitOverride = null; // 'pages' | 'percent' | null (uses format default)

  function toggleUnit() {
    const current = getCurrentUnit();
    _unitOverride = current === 'pages' ? 'percent' : 'pages';
    refreshProgressSection();
  }

  function refreshProgressSection() {
    const fmt    = getCurrentFormat();
    const status = getCurrentStatus();
    let pUnit    = _unitOverride || (fmt === 'paper' ? 'pages' : 'percent');
    if (status === 'finished') pUnit = (_book?.progress_unit || pUnit);

    const partial = {
      current_page: parseInt(document.getElementById('f-current')?.value) || 0,
      total_pages:  parseInt(document.getElementById('f-total')?.value)   || null,
    };

    document.getElementById('progress-section').innerHTML = renderProgressFields(pUnit, partial);
    document.querySelector('#toggle-unit-btn')?.addEventListener('click', toggleUnit);
  }

  // ── Cover handling ────────────────────────────────────────────────────────

  function handleCoverFile(file) {
    _coverFile = file;
    if (_coverPreview) URL.revokeObjectURL(_coverPreview);
    _coverPreview = URL.createObjectURL(file);
    const wrap = document.getElementById('cover-preview-wrap');
    wrap.innerHTML = `<img src="${_coverPreview}" class="book-cover w-full" />`;
  }

  async function loadExistingCover() {
    if (!_book?.cover_thumb) return;
    const img = document.getElementById('existing-cover-img');
    if (!img) return;
    try {
      img.src = await GitHub.loadImage(_book.cover_thumb);
    } catch {
      // leave placeholder
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (_saving) return;

    const title = document.getElementById('f-title').value.trim();
    if (!title) { Toast.error('Title is required.'); return; }

    if (!Toast.checkConn()) return;

    _saving = true;
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="border-color:rgba(255,255,255,0.3);border-top-color:white"></div> Saving…`;

    const fmt    = getCurrentFormat();
    const status = getCurrentStatus();
    const pUnit  = _unitOverride || (fmt === 'paper' ? 'pages' : 'percent');

    const fields = {
      title,
      author:        document.getElementById('f-author').value.trim(),
      isbn:          document.getElementById('f-isbn').value.trim(),
      format:        fmt,
      status,
      progress_unit: pUnit,
      current_page:  parseInt(document.getElementById('f-current')?.value) || 0,
      total_pages:   pUnit === 'pages' ? (parseInt(document.getElementById('f-total')?.value) || null) : null,
    };

    try {
      let targetSlug;

      if (_slug) {
        await Store.updateBook(_slug, fields);
        targetSlug = _slug;
      } else {
        targetSlug = await Store.addBook(fields);
      }

      // Upload cover if selected
      if (_coverFile) {
        btn.innerHTML = `<div class="spinner" style="border-color:rgba(255,255,255,0.3);border-top-color:white"></div> Uploading cover…`;
        const existingThumbSha = _book?.cover_thumb ? await GitHub.getSha(`books/${targetSlug}/cover-thumb.jpg`) : null;
        const existingDisplaySha = _book?.cover_thumb ? await GitHub.getSha(`books/${targetSlug}/cover.jpg`) : null;
        const { thumbPath } = await Images.uploadCover(
          _coverFile, targetSlug, () => {},
          existingDisplaySha, existingThumbSha,
        );
        // Patch cover_thumb into index + notes
        await Store.updateBook(targetSlug, { cover_thumb: thumbPath });
      }

      Toast.success(_slug ? 'Book updated.' : 'Book added!');
      Store.invalidateIndex();
      App.navigate(`/book/${targetSlug}`);
    } catch (e) {
      Toast.error('Save failed: ' + e.message);
    } finally {
      _saving = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = _slug ? 'Save Changes' : 'Add Book';
      }
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${_book?.title}"? This cannot be undone.`)) return;
    if (!Toast.checkConn()) return;

    const btn = document.getElementById('delete-btn');
    btn.disabled = true;
    btn.textContent = 'Deleting…';

    try {
      await Store.deleteBook(_slug);
      Store.invalidateIndex();
      Toast.success('Book deleted.');
      App.navigate('/shelf');
    } catch (e) {
      Toast.error('Delete failed: ' + e.message);
      btn.disabled = false;
      btn.textContent = 'Delete Book';
    }
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { mount };
})();
