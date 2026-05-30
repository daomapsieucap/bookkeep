/**
 * images.js — Client-side image compression + GitHub upload pipeline.
 *
 * Every cover or highlight goes through two sizes:
 *   2000px max-dimension @ quality 0.80 (display)
 *   400px  max-dimension @ quality 0.80 (thumbnail)
 *
 * Originals are never stored.
 */

const Images = (() => {
  const OPTS_DISPLAY = { maxWidthOrHeight: 2000, useWebWorker: false, fileType: 'image/jpeg', initialQuality: 0.80 };
  const OPTS_THUMB   = { maxWidthOrHeight: 400,  useWebWorker: false, fileType: 'image/jpeg', initialQuality: 0.80 };

  /** Compress a File to two JPEG blobs: { display, thumb } */
  async function compress(file) {
    console.log('[compress] start — name:', file.name, 'size:', file.size, 'type:', file.type);
    try {
      const [display, thumb] = await Promise.all([
        imageCompression(file, OPTS_DISPLAY),
        imageCompression(file, OPTS_THUMB),
      ]);
      console.log('[compress] done — display:', display.size, 'thumb:', thumb.size);
      return { display, thumb };
    } catch (e) {
      // imageCompression sometimes rejects with a DOM Event instead of an Error
      if (e instanceof Error) throw e;
      const detail = Object.prototype.toString.call(e)
        + ' type=' + e?.type
        + ' targetErr=' + (e?.target?.error?.message ?? e?.target?.error);
      console.error('[compress] non-Error rejection:', e, detail);
      throw new Error('Compression failed: ' + detail);
    }
  }

  /** Read a Blob as an ArrayBuffer */
  function blobToBuffer(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error(fr.error?.message || 'FileReader failed'));
      fr.readAsArrayBuffer(blob);
    });
  }

  /**
   * Upload a cover photo for a book.
   * Returns { displayPath, thumbPath } (relative paths within the data repo).
   *
   * @param {File}   file     — raw input file
   * @param {string} slug     — book slug (folder name)
   * @param {function} onProgress — called with ('compressing'|'uploading'|'done'|'error', message)
   * @param {string} existingDisplaySha — SHA of existing display image if replacing
   * @param {string} existingThumbSha  — SHA of existing thumb image if replacing
   */
  async function uploadCover(file, slug, onProgress = () => {}, existingDisplaySha, existingThumbSha) {
    onProgress('compressing', 'Compressing…');
    const { display, thumb } = await compress(file);

    const displayPath = `books/${slug}/cover.jpg`;
    const thumbPath   = `books/${slug}/cover-thumb.jpg`;

    onProgress('uploading', 'Uploading…');
    const [dBuf, tBuf] = await Promise.all([blobToBuffer(display), blobToBuffer(thumb)]);

    await GitHub.putBinaryFile(displayPath, dBuf, existingDisplaySha, `Cover: ${slug}`);
    await GitHub.putBinaryFile(thumbPath,   tBuf, existingThumbSha,   `Cover thumb: ${slug}`);

    // Evict cached blobs so the new images load fresh
    GitHub.evictImage(displayPath);
    GitHub.evictImage(thumbPath);

    onProgress('done', 'Upload complete');
    return { displayPath, thumbPath };
  }

  /**
   * Upload a highlight image.
   * Returns { id, displayPath, thumbPath } where id = `h-${Date.now()}`.
   *
   * @param {File}   file
   * @param {string} slug      — book slug
   * @param {string} id        — highlight id (pass existing id when replacing)
   * @param {function} onProgress
   * @param {string} existingDisplaySha
   * @param {string} existingThumbSha
   */
  async function uploadHighlight(file, slug, id, onProgress = () => {}, existingDisplaySha, existingThumbSha) {
    onProgress('compressing', 'Compressing…');
    const { display, thumb } = await compress(file);

    const displayPath = `books/${slug}/highlights/${id}-2000.jpg`;
    const thumbPath   = `books/${slug}/highlights/${id}-thumb.jpg`;

    onProgress('uploading', 'Uploading…');
    const [dBuf, tBuf] = await Promise.all([blobToBuffer(display), blobToBuffer(thumb)]);

    await GitHub.putBinaryFile(displayPath, dBuf, existingDisplaySha, `Highlight ${id}: ${slug}`);
    console.log('[uploadHighlight] display uploaded:', displayPath);
    await GitHub.putBinaryFile(thumbPath,   tBuf, existingThumbSha,   `Highlight thumb ${id}: ${slug}`);
    console.log('[uploadHighlight] thumb uploaded:', thumbPath);

    GitHub.evictImage(displayPath);
    GitHub.evictImage(thumbPath);

    onProgress('done', 'Done');
    return { id, displayPath, thumbPath };
  }

  /**
   * Delete both sizes of a highlight image.
   * Silently ignores 404s (already deleted).
   */
  async function deleteHighlight(slug, id) {
    const displayPath = `books/${slug}/highlights/${id}-2000.jpg`;
    const thumbPath   = `books/${slug}/highlights/${id}-thumb.jpg`;

    const [dSha, tSha] = await Promise.all([
      GitHub.getSha(displayPath),
      GitHub.getSha(thumbPath),
    ]);

    const ops = [];
    if (dSha) ops.push(GitHub.deleteFile(displayPath, dSha, `Remove highlight ${id}`));
    if (tSha) ops.push(GitHub.deleteFile(thumbPath,   tSha, `Remove highlight thumb ${id}`));
    await Promise.all(ops);

    GitHub.evictImage(displayPath);
    GitHub.evictImage(thumbPath);
  }

  /**
   * Connection check — returns 'online' | 'slow' | 'offline'.
   * Uses navigator.onLine as the base, plus the Network Information API when available.
   */
  function connectionState() {
    if (!navigator.onLine) return 'offline';
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return 'slow';
      if (conn.saveData) return 'slow';
    }
    return 'online';
  }

  return { compress, uploadCover, uploadHighlight, deleteHighlight, connectionState };
})();
