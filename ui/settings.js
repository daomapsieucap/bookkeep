/**
 * settings.js — Settings screen: PAT/repo config, validation, rebuild index.
 */

const SettingsScreen = (() => {
  let _saving    = false;
  let _rebuilding = false;

  function mount() {
    const { pat, owner, repo } = GitHub.cfg();
    render(pat, owner, repo);
  }

  function render(pat, owner, repo) {
    document.getElementById('screen').innerHTML = `
      <div class="px-4 pt-8 pb-2">
        <p class="text-xs font-semibold text-yellow-600 uppercase tracking-widest mb-1">Bookkeep</p>
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
