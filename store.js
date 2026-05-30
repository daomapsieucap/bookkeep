/**
 * store.js — Dual-write layer: keeps books.json index and per-book notes.md in sync.
 *
 * Every mutating operation writes BOTH files. notes.md frontmatter is the
 * durable source of truth; books.json is the fast-load index.
 */

const Store = (() => {

  // ── Slug generation ──────────────────────────────────────────────────────

  function toSlug(title) {
    return title
      .normalize('NFD')
      .replace(/\p{Mn}/gu, '')   // strip all combining diacritical marks
      .replace(/[đĐ]/g, 'd')    // đ doesn't decompose via NFD
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  }

  function makeSlug(title, existingSlugs = []) {
    const base = toSlug(title);
    if (!existingSlugs.includes(base)) return base;
    const hash = Math.random().toString(36).slice(2, 6);
    return `${base}-${hash}`;
  }

  // ── Format normalization ─────────────────────────────────────────────────

  function normFmt(f) {
    if (!f || f === 'paper' || f === 'hardcover') return 'paperback';
    if (f === 'kindle') return 'ebook';
    return f;
  }

  // ── Frontmatter helpers ──────────────────────────────────────────────────

  const NOTES_FENCE = '---';

  /** Parse a notes.md string → { meta: object, body: string } */
  function parseNotes(raw) {
    const start = raw.indexOf(NOTES_FENCE);
    const end   = raw.indexOf(NOTES_FENCE, start + 3);
    if (start === -1 || end === -1) return { meta: {}, body: raw };
    const yamlStr = raw.slice(start + 3, end).trim();
    const body    = raw.slice(end + 3).trim();
    const meta    = jsyaml.load(yamlStr) || {};
    return { meta, body };
  }

  /** Serialize meta + body back to notes.md string */
  function serializeNotes(meta, body) {
    const yamlStr = jsyaml.dump(meta, { lineWidth: -1, quotingType: '"' });
    return `---\n${yamlStr}---\n\n${body || ''}`;
  }

  // ── books.json helpers ───────────────────────────────────────────────────

  let _indexCache   = null; // parsed { books: [...] }
  let _indexShaCach = null; // SHA of books.json

  async function fetchIndex() {
    if (_indexCache) return { index: _indexCache, sha: _indexShaCach };
    const result = await GitHub.getFile('books.json');
    if (!result) {
      // First run — initialize empty index
      _indexCache    = { books: [] };
      _indexShaCach  = null;
    } else {
      _indexCache   = JSON.parse(result.content);
      _indexShaCach = result.sha;
    }
    return { index: _indexCache, sha: _indexShaCach };
  }

  function invalidateIndex() {
    _indexCache   = null;
    _indexShaCach = null;
  }

  /** Write books.json; updates the SHA cache. */
  async function saveIndex(index, currentSha) {
    const newSha = await GitHub.putFile(
      'books.json',
      JSON.stringify(index, null, 2),
      currentSha,
      'Update books.json index',
    );
    _indexCache   = index;
    _indexShaCach = newSha;
    return newSha;
  }

  // ── Public: read ─────────────────────────────────────────────────────────

  /** Returns all books from the index (cached). */
  async function listBooks() {
    const { index } = await fetchIndex();
    return index.books;
  }

  /** Returns a single book's notes.md { meta, body } (not cached — always fresh). */
  async function getBookNotes(slug) {
    const result = await GitHub.getFile(`books/${slug}/notes.md`);
    if (!result) return null;
    const { meta, body } = parseNotes(result.content);
    return { meta, body, sha: result.sha };
  }

  // ── Public: write ────────────────────────────────────────────────────────

  /**
   * Add a new book.
   * @param {object} fields — book metadata (title, author, …)
   * @returns {string} slug
   */
  async function addBook(fields) {
    const today = new Date().toISOString().slice(0, 10);
    const { index, sha } = await fetchIndex();
    const slug  = makeSlug(fields.title, index.books.map(b => b.slug));

    const meta = {
      slug,
      title:         fields.title,
      author:        fields.author        || '',
      isbn:          fields.isbn          || '',
      format:        normFmt(fields.format),
      status:        fields.status        || 'want-to-read',
      progress_unit: fields.progress_unit || 'pages',
      total_pages:   fields.total_pages   || null,
      current_page:  fields.current_page  || 0,
      cover:         'cover.jpg',
      cover_thumb:   `books/${slug}/cover-thumb.jpg`,
      started_date:  fields.status === 'reading'  ? today : (fields.started_date || null),
      finished_date: fields.status === 'finished' ? (fields.finished_date || today) : null,
      added_date:    fields.added_date || today,
      updated_date:  today,
      highlights:    [],
    };

    const notesContent = serializeNotes(meta, fields.body || '');

    // Write notes.md first (creates the "folder" implicitly)
    await GitHub.putFile(
      `books/${slug}/notes.md`,
      notesContent,
      null,
      `Add book: ${fields.title}`,
    );

    // Build index entry (subset of meta, no highlights)
    const indexEntry = buildIndexEntry(meta);

    index.books.push(indexEntry);
    await saveIndex(index, sha);

    return slug;
  }

  /**
   * Update book metadata (title, author, status, progress, etc.).
   * Handles date auto-management and dual-write.
   */
  async function updateBook(slug, updates) {
    const today = new Date().toISOString().slice(0, 10);

    const result = await GitHub.getFile(`books/${slug}/notes.md`);
    if (!result) throw new Error(`Book not found: ${slug}`);
    const { meta, body } = parseNotes(result.content);

    // Merge updates
    Object.assign(meta, updates);
    meta.updated_date = today;

    // Auto-manage dates
    if (updates.status === 'reading' && !meta.started_date) {
      meta.started_date = today;
    }
    if (updates.status === 'finished') {
      meta.finished_date = today;
      // Auto-set progress to 100%
      if (meta.progress_unit === 'pages' && meta.total_pages) {
        meta.current_page = meta.total_pages;
      } else if (meta.progress_unit === 'percent') {
        meta.current_page = 100;
      }
    }

    const newContent = serializeNotes(meta, body);
    await GitHub.putFile(
      `books/${slug}/notes.md`,
      newContent,
      result.sha,
      buildCommitMessage(slug, updates),
    );

    // Sync index
    const { index, sha } = await fetchIndex();
    const idx = index.books.findIndex(b => b.slug === slug);
    if (idx !== -1) {
      Object.assign(index.books[idx], buildIndexEntry(meta));
    }
    await saveIndex(index, sha);
  }

  /** Update only the notes body (markdown text), preserving frontmatter. */
  async function updateNotes(slug, body) {
    const result = await GitHub.getFile(`books/${slug}/notes.md`);
    if (!result) throw new Error(`Book not found: ${slug}`);
    const { meta } = parseNotes(result.content);
    meta.updated_date = new Date().toISOString().slice(0, 10);
    const newContent = serializeNotes(meta, body);
    await GitHub.putFile(
      `books/${slug}/notes.md`,
      newContent,
      result.sha,
      `Update notes: ${meta.title}`,
    );
    // Sync updated_date in index
    const { index, sha } = await fetchIndex();
    const entry = index.books.find(b => b.slug === slug);
    if (entry) entry.updated_date = meta.updated_date;
    await saveIndex(index, sha);
  }

  /**
   * Add a highlight entry to notes.md frontmatter.
   * @param {string} slug
   * @param {{ id, image, thumb, caption, added_date }} highlight
   */
  async function addHighlight(slug, highlight) {
    const result = await GitHub.getFile(`books/${slug}/notes.md`);
    if (!result) throw new Error(`Book not found: ${slug}`);
    const { meta, body } = parseNotes(result.content);
    if (!Array.isArray(meta.highlights)) meta.highlights = [];
    meta.highlights.push(highlight);
    meta.updated_date = new Date().toISOString().slice(0, 10);
    const newContent = serializeNotes(meta, body);
    await GitHub.putFile(
      `books/${slug}/notes.md`,
      newContent,
      result.sha,
      `Add highlight to: ${meta.title}`,
    );
  }

  /** Replace a highlight's image paths in frontmatter (keeping same id/caption/position). */
  async function updateHighlightImage(slug, id, newImage, newThumb) {
    const result = await GitHub.getFile(`books/${slug}/notes.md`);
    if (!result) throw new Error(`Book not found: ${slug}`);
    const { meta, body } = parseNotes(result.content);
    const h = (meta.highlights || []).find(x => x.id === id);
    if (!h) throw new Error(`Highlight ${id} not found`);
    h.image = newImage;
    h.thumb = newThumb;
    meta.updated_date = new Date().toISOString().slice(0, 10);
    const newContent = serializeNotes(meta, body);
    await GitHub.putFile(
      `books/${slug}/notes.md`,
      newContent,
      result.sha,
      `Replace highlight ${id}: ${meta.title}`,
    );
  }

  /** Edit a highlight's caption. */
  async function updateHighlightCaption(slug, id, caption) {
    const result = await GitHub.getFile(`books/${slug}/notes.md`);
    if (!result) throw new Error(`Book not found: ${slug}`);
    const { meta, body } = parseNotes(result.content);
    const h = (meta.highlights || []).find(x => x.id === id);
    if (!h) throw new Error(`Highlight ${id} not found`);
    h.caption = caption;
    meta.updated_date = new Date().toISOString().slice(0, 10);
    const newContent = serializeNotes(meta, body);
    await GitHub.putFile(
      `books/${slug}/notes.md`,
      newContent,
      result.sha,
      `Edit highlight caption: ${meta.title}`,
    );
  }

  /** Remove a highlight entry from frontmatter (does NOT delete image files — call Images.deleteHighlight separately). */
  async function removeHighlight(slug, id) {
    const result = await GitHub.getFile(`books/${slug}/notes.md`);
    if (!result) throw new Error(`Book not found: ${slug}`);
    const { meta, body } = parseNotes(result.content);
    meta.highlights = (meta.highlights || []).filter(h => h.id !== id);
    meta.updated_date = new Date().toISOString().slice(0, 10);
    const newContent = serializeNotes(meta, body);
    await GitHub.putFile(
      `books/${slug}/notes.md`,
      newContent,
      result.sha,
      `Remove highlight ${id}: ${meta.title}`,
    );
  }

  /** Delete a book entirely — removes the folder tree and the index entry. */
  async function deleteBook(slug) {
    // List everything under books/<slug>/
    const entries = await GitHub.listDir(`books/${slug}`);
    // Also check highlights sub-folder
    const highlights = await GitHub.listDir(`books/${slug}/highlights`).catch(() => []);

    // Delete files in reverse dependency order
    for (const h of highlights) {
      if (h.type === 'file') {
        await GitHub.deleteFile(h.path, h.sha, `Remove highlight: ${slug}`);
      }
    }
    for (const e of entries) {
      if (e.type === 'file') {
        await GitHub.deleteFile(e.path, e.sha, `Remove book file: ${slug}`);
      }
    }

    // Remove from index
    const { index, sha } = await fetchIndex();
    index.books = index.books.filter(b => b.slug !== slug);
    await saveIndex(index, sha);
  }

  // ── Rebuild index ────────────────────────────────────────────────────────

  /**
   * Re-scan every books/<slug>/notes.md and rebuild books.json from scratch.
   * Called from Settings when index drift is suspected.
   */
  async function rebuildIndex(onProgress = () => {}) {
    onProgress('Listing book folders…');
    const dirs = await GitHub.listDir('books');
    const slugs = dirs.filter(d => d.type === 'dir').map(d => d.name);

    const rebuilt = [];
    for (let i = 0; i < slugs.length; i++) {
      const slug = slugs[i];
      onProgress(`Reading ${i + 1}/${slugs.length}: ${slug}`);
      try {
        const result = await GitHub.getFile(`books/${slug}/notes.md`);
        if (!result) continue;
        const { meta } = parseNotes(result.content);
        if (!meta.slug) meta.slug = slug;
        rebuilt.push(buildIndexEntry(meta));
      } catch (e) {
        console.warn(`Skipping ${slug}:`, e);
      }
    }

    onProgress('Writing books.json…');
    const { sha } = await fetchIndex();
    await saveIndex({ books: rebuilt }, sha);
    invalidateIndex();
    onProgress('Done');
    return rebuilt.length;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  function buildIndexEntry(meta) {
    return {
      slug:          meta.slug,
      title:         meta.title,
      author:        meta.author        || '',
      isbn:          meta.isbn          || '',
      format:        normFmt(meta.format),
      status:        meta.status        || 'want-to-read',
      progress_unit: meta.progress_unit || 'pages',
      total_pages:   meta.total_pages   || null,
      current_page:  meta.current_page  || 0,
      cover_thumb:   meta.cover_thumb   || `books/${meta.slug}/cover-thumb.jpg`,
      started_date:  meta.started_date  || null,
      finished_date: meta.finished_date || null,
      added_date:    meta.added_date    || null,
      updated_date:  meta.updated_date  || null,
    };
  }

  function buildCommitMessage(slug, updates) {
    if (updates.current_page !== undefined || updates.status !== undefined) {
      return `Update progress: ${slug}`;
    }
    return `Update book: ${slug}`;
  }

  return {
    listBooks, getBookNotes,
    addBook, updateBook, updateNotes,
    addHighlight, updateHighlightImage, updateHighlightCaption, removeHighlight,
    deleteBook, rebuildIndex, invalidateIndex,
    parseNotes, serializeNotes,
  };
})();
