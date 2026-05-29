/**
 * settings.js — Settings screen: PAT/repo config, validation, rebuild index.
 */

const SettingsScreen = (() => {
  let _saving      = false;
  let _rebuilding  = false;
  let _importing   = false;
  let _deduping    = false;
  let _grFile      = null;

  function mount() {
    const { pat, owner, repo } = GitHub.cfg();
    render(pat, owner, repo);
  }

  function render(pat, owner, repo) {
    document.getElementById('screen').innerHTML = `
      <div class="px-4 pt-8 pb-2">
        <p class="text-xs font-semibold text-blue-700 uppercase tracking-widest mb-1">Bookkeep</p>
        <h1 class="text-2xl font-bold text-stone-900">Settings</h1>
        <p class="text-sm text-stone-500 mt-1">Connect your private GitHub data repo to get started.</p>
      </div>

      <div class="px-4 pb-8 space-y-6">

        <!-- GitHub credentials -->
        <div class="bg-white rounded-2xl shadow-sm p-4 space-y-4">
          <h2 class="font-semibold text-stone-700 text-sm uppercase tracking-wide">GitHub Data Repo</h2>

          <div>
            <label class="form-label" for="s-owner">Owner (username or org)</label>
            <input id="s-owner" class="form-input" type="text" placeholder="your-github-username"
              value="${esc(owner)}" autocomplete="off" autocapitalize="off" />
          </div>

          <div>
            <label class="form-label" for="s-repo">Repository name</label>
            <input id="s-repo" class="form-input" type="text" placeholder="bookkeep-shelf"
              value="${esc(repo)}" autocomplete="off" autocapitalize="off" />
          </div>

          <div>
            <label class="form-label" for="s-pat">Personal Access Token (PAT)</label>
            <div class="relative">
              <input id="s-pat" class="form-input pr-12" type="password" placeholder="github_pat_…"
                value="${esc(pat)}" autocomplete="off" />
              <button id="toggle-pat-visibility" type="button"
                class="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 active:opacity-60">
                <svg id="eye-icon" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
              </button>
            </div>
            <p class="text-xs text-stone-400 mt-1.5">
              Fine-grained PAT with <strong>Contents: Read and Write</strong> on the data repo only.
              Never shared or committed — stored in localStorage.
            </p>
          </div>

          <div id="validation-msg" class="hidden rounded-lg px-3 py-2 text-sm font-medium"></div>

          <button id="save-settings-btn"
            class="w-full py-3 rounded-xl bg-yellow-400 text-stone-900 font-bold active:opacity-80 flex items-center justify-center gap-2">
            Save &amp; Validate
          </button>
        </div>

        <!-- Danger zone -->
        <div class="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 class="font-semibold text-stone-700 text-sm uppercase tracking-wide">Data Integrity</h2>
          <p class="text-sm text-stone-500">
            Rebuilds <code class="bg-stone-100 px-1 rounded">books.json</code> by scanning every
            <code class="bg-stone-100 px-1 rounded">notes.md</code> file. Use if the index and
            notes fall out of sync.
          </p>
          <div id="rebuild-progress" class="hidden text-sm text-stone-500 italic"></div>
          <button id="rebuild-btn"
            class="w-full py-3 rounded-xl border border-stone-300 text-stone-600 font-medium text-sm active:opacity-60 flex items-center justify-center gap-2">
            Rebuild books.json from notes
          </button>
          <p class="text-sm text-stone-500 pt-1">
            Finds books with the same ISBN or title&nbsp;+&nbsp;author and removes the duplicates,
            keeping the copy with the most complete data.
          </p>
          <div id="dedup-progress" class="hidden text-sm text-stone-500 italic"></div>
          <button id="dedup-btn"
            class="w-full py-3 rounded-xl border border-stone-300 text-stone-600 font-medium text-sm active:opacity-60 flex items-center justify-center gap-2">
            Remove Duplicate Books
          </button>
        </div>

        <!-- Goodreads import -->
        <div class="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 class="font-semibold text-stone-700 text-sm uppercase tracking-wide">Import from Goodreads</h2>
          <p class="text-sm text-stone-500">
            Export your library from Goodreads (My Books → Import and Export → Export Library),
            then select the CSV file here. Reads, ratings, and reviews are imported as notes.
          </p>
          <label id="gr-file-label"
            class="flex items-center justify-center w-full py-3 rounded-xl border-2 border-dashed border-stone-300 text-stone-500 text-sm font-medium cursor-pointer active:opacity-60 gap-2">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            <span id="gr-file-name">Choose CSV file…</span>
            <input id="gr-file-input" type="file" accept=".csv,text/csv" class="hidden" />
          </label>
          <div id="gr-progress" class="hidden text-sm text-stone-500 italic"></div>
          <button id="gr-import-btn"
            class="hidden w-full py-3 rounded-xl bg-yellow-400 text-stone-900 font-bold active:opacity-80 flex items-center justify-center gap-2">
            Import
          </button>
        </div>

        <!-- About -->
        <div class="bg-white rounded-2xl shadow-sm p-4 space-y-1">
          <h2 class="font-semibold text-stone-700 text-sm uppercase tracking-wide mb-2">About</h2>
          <p class="text-sm text-stone-500">Bookkeep: personal reading tracker.</p>
          <p class="text-xs text-stone-400 mt-1">
            Data lives in your private GitHub repo. This app has no server.
          </p>
        </div>

      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    document.getElementById('toggle-pat-visibility').addEventListener('click', () => {
      const input = document.getElementById('s-pat');
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
    });

    document.getElementById('save-settings-btn').addEventListener('click', handleSave);
    document.getElementById('rebuild-btn').addEventListener('click', handleRebuild);
    document.getElementById('dedup-btn').addEventListener('click', handleDeduplicate);

    document.getElementById('gr-file-input').addEventListener('change', e => {
      _grFile = e.target.files[0] || null;
      const nameEl = document.getElementById('gr-file-name');
      const btn    = document.getElementById('gr-import-btn');
      if (_grFile) {
        nameEl.textContent = _grFile.name;
        btn.textContent = 'Import';
        btn.classList.remove('hidden');
      } else {
        nameEl.textContent = 'Choose CSV file…';
        btn.classList.add('hidden');
      }
    });

    document.getElementById('gr-import-btn').addEventListener('click', handleGoodreadsImport);
  }

  async function handleSave() {
    if (_saving) return;
    const pat   = document.getElementById('s-pat').value.trim();
    const owner = document.getElementById('s-owner').value.trim();
    const repo  = document.getElementById('s-repo').value.trim();

    if (!pat || !owner || !repo) {
      showMsg('All three fields are required.', 'error');
      return;
    }

    _saving = true;
    const btn = document.getElementById('save-settings-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="border-color:rgba(26,26,26,0.2);border-top-color:#1c1917;width:18px;height:18px"></div> Validating…`;
    showMsg('', '');

    try {
      const { ok, message } = await GitHub.validate(pat, owner, repo);
      if (ok) {
        localStorage.setItem('bk_pat',   pat);
        localStorage.setItem('bk_owner', owner);
        localStorage.setItem('bk_repo',  repo);
        showMsg('✓ ' + message, 'success');
        App.showNav(true);
        Store.invalidateIndex();
        Toast.success('Settings saved.');
      } else {
        showMsg('✗ ' + message, 'error');
      }
    } catch (e) {
      showMsg('Network error: ' + e.message, 'error');
    } finally {
      _saving = false;
      btn.disabled = false;
      btn.innerHTML = 'Save &amp; Validate';
    }
  }

  async function handleRebuild() {
    if (_rebuilding) return;
    if (!GitHub.isConfigured()) {
      Toast.error('Configure and save your settings first.');
      return;
    }
    if (!confirm('Rebuild books.json by scanning all notes.md files? This may take a while for large libraries.')) return;

    _rebuilding = true;
    const btn = document.getElementById('rebuild-btn');
    const progressEl = document.getElementById('rebuild-progress');
    btn.disabled = true;
    progressEl.classList.remove('hidden');

    try {
      const count = await Store.rebuildIndex(msg => {
        progressEl.textContent = msg;
      });
      Toast.success(`Rebuilt index: ${count} books.`);
      progressEl.textContent = `Done. ${count} books indexed.`;
    } catch (e) {
      Toast.error('Rebuild failed: ' + e.message);
      progressEl.textContent = 'Error: ' + e.message;
    } finally {
      _rebuilding = false;
      btn.disabled = false;
    }
  }

  async function handleDeduplicate() {
    if (_deduping) return;
    if (!GitHub.isConfigured()) {
      Toast.error('Configure and save your settings first.');
      return;
    }

    _deduping = true;
    const btn        = document.getElementById('dedup-btn');
    const progressEl = document.getElementById('dedup-progress');
    btn.disabled = true;
    progressEl.classList.remove('hidden');
    progressEl.textContent = 'Scanning library…';

    try {
      const books = await Store.listBooks();

      // Group by ISBN (preferred) or normalised title+author
      const groups = new Map();
      for (const book of books) {
        const key = (book.isbn && book.isbn.trim())
          ? `isbn:${book.isbn.trim()}`
          : `ta:${book.title.toLowerCase().trim()}|${(book.author || '').toLowerCase().trim()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(book);
      }

      const dupeGroups = [...groups.values()].filter(g => g.length > 1);

      if (!dupeGroups.length) {
        progressEl.textContent = 'No duplicates found.';
        Toast.success('No duplicates found.');
        return;
      }

      const totalDupes = dupeGroups.reduce((n, g) => n + g.length - 1, 0);
      if (!confirm(`Found ${totalDupes} duplicate book${totalDupes !== 1 ? 's' : ''} across ${dupeGroups.length} group${dupeGroups.length !== 1 ? 's' : ''}. Delete the duplicates now?`)) {
        progressEl.textContent = '';
        progressEl.classList.add('hidden');
        return;
      }

      let deleted = 0;
      for (let i = 0; i < dupeGroups.length; i++) {
        const group = dupeGroups[i];
        const keeper = group.reduce((best, b) => scoreBook(b) >= scoreBook(best) ? b : best);
        const toDelete = group.filter(b => b.slug !== keeper.slug);
        for (const book of toDelete) {
          progressEl.textContent = `Removing duplicate: "${book.title}" (${deleted + 1} / ${totalDupes})…`;
          await Store.deleteBook(book.slug);
          deleted++;
        }
      }

      Store.invalidateIndex();
      progressEl.textContent = `Done. Removed ${deleted} duplicate${deleted !== 1 ? 's' : ''}.`;
      Toast.success(`Removed ${deleted} duplicate book${deleted !== 1 ? 's' : ''}.`);
    } catch (e) {
      Toast.error('Deduplicate failed: ' + e.message);
      progressEl.textContent = 'Error: ' + e.message;
    } finally {
      _deduping    = false;
      btn.disabled = false;
    }
  }

  function scoreBook(b) {
    let score = 0;
    if (b.isbn && b.isbn.trim())      score += 3;
    if (b.status === 'finished')      score += 2;
    else if (b.status === 'reading')  score += 1;
    if (b.finished_date)              score += 1;
    if (b.started_date)               score += 1;
    // Earlier added_date as a tiebreaker (lexicographic ISO comparison)
    if (b.added_date)                 score += 0.5 / (new Date(b.added_date).getTime() || Infinity) * 1e12;
    return score;
  }

  async function handleGoodreadsImport() {
    if (_importing || !_grFile) return;
    if (!GitHub.isConfigured()) {
      Toast.error('Configure and save your settings first.');
      return;
    }

    const text = await _grFile.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      Toast.error('CSV appears empty or invalid.');
      return;
    }

    const headers = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1).filter(r => r.some(c => c.trim()));
    if (!dataRows.length) {
      Toast.error('No books found in CSV.');
      return;
    }

    const total = dataRows.length;
    if (!confirm(`Import ${total} books from Goodreads? This may take several minutes for large libraries.`)) return;

    _importing = true;
    const btn      = document.getElementById('gr-import-btn');
    const progress = document.getElementById('gr-progress');
    btn.disabled   = true;
    btn.innerHTML  = `<div class="spinner" style="border-color:rgba(26,26,26,0.2);border-top-color:#1c1917;width:18px;height:18px"></div> Importing…`;
    progress.classList.remove('hidden');

    let imported = 0;
    let skipped  = 0;
    let covered  = 0;
    let failed   = 0;

    progress.textContent = 'Loading existing library…';
    const existingBooks = await Store.listBooks();

    for (let i = 0; i < dataRows.length; i++) {
      progress.textContent = `Importing ${i + 1} / ${total}…`;
      const fields = mapGoodreadsRow(headers, dataRows[i]);
      if (!fields) { failed++; continue; }

      // Deduplicate: match by ISBN, then fall back to title+author
      const existing = findExisting(existingBooks, fields);

      try {
        if (existing) {
          // Book already in library — only fix a missing cover
          const coverPath = `books/${existing.slug}/cover.jpg`;
          const existingSha = await GitHub.getSha(coverPath);
          if (!existingSha && fields.isbn) {
            progress.textContent = `${i + 1} / ${total} — fixing cover for "${existing.title}"…`;
            const coverFile = await fetchOpenLibraryCover(fields.isbn);
            if (coverFile) { await Images.uploadCover(coverFile, existing.slug); covered++; }
          }
          skipped++;
        } else {
          const slug = await Store.addBook(fields);
          imported++;
          existingBooks.push({ slug, title: fields.title, author: fields.author || '', isbn: fields.isbn || '' });
          if (fields.isbn) {
            progress.textContent = `${i + 1} / ${total} — fetching cover…`;
            const coverFile = await fetchOpenLibraryCover(fields.isbn);
            if (coverFile) { await Images.uploadCover(coverFile, slug); covered++; }
          }
        }
      } catch (e) {
        console.warn('Failed to import:', fields.title, e);
        failed++;
      }
    }

    Store.invalidateIndex();
    _importing   = false;
    _grFile      = null;
    btn.disabled = false;
    btn.classList.add('hidden');
    document.getElementById('gr-file-name').textContent = 'Choose CSV file…';
    document.getElementById('gr-file-input').value = '';
    const parts = [`${imported} imported`, skipped ? `${skipped} already existed` : '', covered ? `${covered} covers added` : '', failed ? `${failed} failed` : ''].filter(Boolean);
    progress.textContent = `Done. ${parts.join(', ')}.`;
    Toast.success(`Imported ${imported} book${imported !== 1 ? 's' : ''} from Goodreads.`);
  }

  /** Minimal CSV parser that handles quoted fields and doubled-quote escapes. */
  function parseCSV(text) {
    const rows  = [];
    let row     = [];
    let field   = '';
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
      const ch   = text[i];
      const next = text[i + 1];

      if (inQuote) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"')            { inQuote = false; }
        else                            { field += ch; }
      } else {
        if      (ch === '"')  { inQuote = true; }
        else if (ch === ',')  { row.push(field); field = ''; }
        else if (ch === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
        else if (ch !== '\r') { field += ch; }
      }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  /** Map one Goodreads CSV row → Store.addBook() fields object, or null if no title. */
  function mapGoodreadsRow(headers, cols) {
    const get = name => (cols[headers.indexOf(name)] || '').trim();

    const title = get('Title');
    if (!title) return null;

    // Goodreads ISBNs look like ="9780316769174" — strip the Excel formula wrapper
    const rawIsbn = get('ISBN13') || get('ISBN');
    const isbn    = rawIsbn.replace(/^="?|"?$/g, '');

    const shelfMap  = { read: 'finished', 'currently-reading': 'reading', 'to-read': 'want-to-read' };
    const status    = shelfMap[get('Exclusive Shelf')] || 'want-to-read';

    const bindingRaw = get('Binding').toLowerCase();
    let format = 'paper';
    if (bindingRaw.includes('kindle') || bindingRaw.includes('ebook') || bindingRaw === 'digital') format = 'ebook';
    else if (bindingRaw.includes('hardcover') || bindingRaw.includes('hardback'))                  format = 'hardcover';

    // Goodreads dates: "2023/04/15" → "2023-04-15"
    const grDate = s => s ? s.replace(/\//g, '-') : null;

    const pages  = parseInt(get('Number of Pages'), 10) || null;
    const review = get('My Review').trim();

    return {
      title,
      author:        get('Author'),
      isbn,
      format,
      status,
      total_pages:   pages,
      current_page:  status === 'finished' ? (pages || 0) : 0,
      progress_unit: 'pages',
      added_date:    grDate(get('Date Added')),
      finished_date: grDate(get('Date Read')),
      body:          review,
    };
  }

  function findExisting(books, fields) {
    if (fields.isbn) {
      const byIsbn = books.find(b => b.isbn && b.isbn === fields.isbn);
      if (byIsbn) return byIsbn;
    }
    const t = fields.title.toLowerCase();
    const a = (fields.author || '').toLowerCase();
    return books.find(b => b.title.toLowerCase() === t && (b.author || '').toLowerCase() === a) || null;
  }

  async function fetchOpenLibraryCover(isbn) {
    try {
      const res = await fetch(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`);
      if (!res.ok) return null;
      const blob = await res.blob();
      // Open Library returns a tiny GIF/PNG placeholder when no cover exists
      if (blob.size < 5000 || !blob.type.includes('jpeg')) return null;
      return new File([blob], 'cover.jpg', { type: 'image/jpeg' });
    } catch {
      return null;
    }
  }

  function showMsg(text, type) {
    const el = document.getElementById('validation-msg');
    el.textContent = text;
    el.className = 'rounded-lg px-3 py-2 text-sm font-medium ' + (
      type === 'success' ? 'bg-green-50 text-green-700' :
      type === 'error'   ? 'bg-red-50 text-red-600'    : 'hidden'
    );
    if (!text) el.classList.add('hidden');
  }

  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { mount };
})();
