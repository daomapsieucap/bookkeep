/**
 * github.js — GitHub REST API wrapper
 * All data lives in a private repo accessed with a PAT stored in localStorage.
 */

const GitHub = (() => {
  function cfg() {
    return {
      pat:   localStorage.getItem('bk_pat')   || '',
      owner: localStorage.getItem('bk_owner') || '',
      repo:  localStorage.getItem('bk_repo')  || '',
    };
  }

  function headers(extra = {}) {
    const { pat } = cfg();
    return {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    };
  }

  function base() {
    const { owner, repo } = cfg();
    return `https://api.github.com/repos/${owner}/${repo}/contents`;
  }

  /** fetch wrapper that bypasses the HTTP cache on every request. */
  function ghFetch(url, opts = {}) {
    return fetch(url, { cache: 'no-store', ...opts });
  }

  /** Parse JSON from a response, surfacing the raw body if parsing fails. */
  async function safeJson(res) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Unexpected response (not JSON): ${text.slice(0, 200)}`);
    }
  }

  /** GET a file — returns { content: string, sha: string } */
  async function getFile(path) {
    const res = await ghFetch(`${base()}/${path}`, { headers: headers() });
    if (res.status === 404) return null;
    if (res.status === 401) throw new Error('GitHub token is invalid or expired — update it in Settings.');
    if (res.status === 403) throw new Error('GitHub token lacks write permission — update it in Settings.');
    if (!res.ok) throw new Error(`GitHub GET ${path}: ${res.status} ${await res.text()}`);
    const data = await safeJson(res);
    const raw = atob(data.content.replace(/\n/g, ''));
    const content = new TextDecoder('utf-8').decode(
      Uint8Array.from(raw, c => c.charCodeAt(0))
    );
    return { content, sha: data.sha };
  }

  /** PUT (create or update) a text file.
   *  sha is required when updating an existing file; omit when creating.
   */
  async function putFile(path, content, sha, message) {
    const body = {
      message: message || `Update ${path}`,
      content: btoa(unescape(encodeURIComponent(content))),
    };
    if (sha) body.sha = sha;

    const res = await ghFetch(`${base()}/${path}`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('GitHub token is invalid or expired — update it in Settings.');
      if (res.status === 403) throw new Error('GitHub token lacks write permission — update it in Settings.');
      throw new Error(`GitHub PUT ${path}: ${res.status} ${await res.text()}`);
    }
    const data = await safeJson(res);
    return data.content.sha;
  }

  /** PUT a binary file (Uint8Array or ArrayBuffer). */
  async function putBinaryFile(path, bytes, sha, message) {
    const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
    let binary = '';
    for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
    const b64 = btoa(binary);

    const body = {
      message: message || `Upload ${path}`,
      content: b64,
    };
    if (sha) body.sha = sha;

    const res = await ghFetch(`${base()}/${path}`, {
      method: 'PUT',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`GitHub PUT binary ${path}: ${res.status} ${await res.text()}`);
    const data = await safeJson(res);
    return data.content.sha;
  }

  /** DELETE a file. */
  async function deleteFile(path, sha, message) {
    const res = await ghFetch(`${base()}/${path}`, {
      method: 'DELETE',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message: message || `Delete ${path}`, sha }),
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error('GitHub token is invalid or expired — update it in Settings.');
      if (res.status === 403) throw new Error('GitHub token lacks write permission — update it in Settings.');
      throw new Error(`GitHub DELETE ${path}: ${res.status} ${await res.text()}`);
    }
  }

  /** List directory contents — returns array of { name, path, sha, type } */
  async function listDir(path) {
    const res = await ghFetch(`${base()}/${path}`, { headers: headers() });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub LIST ${path}: ${res.status} ${await res.text()}`);
    return safeJson(res);
  }

  /**
   * Get the SHA of an existing file (lightweight — avoids downloading content).
   * Returns null if not found.
   */
  async function getSha(path) {
    const res = await ghFetch(`${base()}/${path}`, { headers: headers() });
    if (res.status === 404) return null;
    if (res.status === 401) throw new Error('GitHub token is invalid or expired — update it in Settings.');
    if (res.status === 403) throw new Error('GitHub token lacks write permission — update it in Settings.');
    if (!res.ok) throw new Error(`GitHub HEAD ${path}: ${res.status}`);
    const data = await safeJson(res);
    return data.sha;
  }

  /**
   * Load a private-repo image as an object URL.
   * raw.githubusercontent.com won't serve private files without auth, so we
   * use the contents API with Accept: application/vnd.github.raw to get the
   * raw bytes, then create a blob URL.
   *
   * Object URLs are cached in memory for the session.
   */
  const _blobCache = new Map();

  async function loadImage(path) {
    if (_blobCache.has(path)) return _blobCache.get(path);

    const res = await ghFetch(`${base()}/${path}`, {
      headers: {
        ...headers(),
        'Accept': 'application/vnd.github.raw',
      },
    });
    if (res.status === 404) { _blobCache.set(path, null); return null; }
    if (!res.ok) throw new Error(`GitHub image ${path}: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    _blobCache.set(path, url);
    return url;
  }

  /** Evict a single path from the blob URL cache (call after replacing an image). */
  function evictImage(path) {
    if (_blobCache.has(path)) {
      URL.revokeObjectURL(_blobCache.get(path));
      _blobCache.delete(path);
    }
  }

  /** Validate PAT + repo by fetching the repo metadata. Returns { ok, message }. */
  async function validate(pat, owner, repo) {
    try {
      const res = await ghFetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github+json',
        },
      });
      if (res.status === 401) return { ok: false, message: 'Invalid token (401 Unauthorized).' };
      if (res.status === 403) return { ok: false, message: 'Token lacks permission (403 Forbidden).' };
      if (res.status === 404) return { ok: false, message: 'Repository not found. Check owner and repo name.' };
      if (!res.ok) return { ok: false, message: `Unexpected error: ${res.status}` };
      const data = await res.json();
      return { ok: true, message: `Connected to ${data.full_name}` };
    } catch (e) {
      return { ok: false, message: `Network error: ${e.message}` };
    }
  }

  /** True if the app has the minimum config to make API calls. */
  function isConfigured() {
    const { pat, owner, repo } = cfg();
    return !!(pat && owner && repo);
  }

  return {
    getFile, putFile, putBinaryFile, deleteFile,
    listDir, getSha, loadImage, evictImage,
    validate, isConfigured, cfg,
  };
})();
