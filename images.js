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

  /** Resize + compress a File to a JPEG Blob via Canvas. */
  function compressToJpeg(file, maxPx, quality) {
    return new Promise((resolve, reject) => {
      createImageBitmap(file)
        .then(bmp => {
          let w = bmp.width;
          let h = bmp.height;
          if (w > maxPx || h > maxPx) {
            if (w >= h) { h = Math.round((h / w) * maxPx); w = maxPx; }
            else        { w = Math.round((w / h) * maxPx); h = maxPx; }
          }

          const canvas = document.createElement('canvas');
          canvas.width  = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { bmp.close(); reject(new Error('Canvas 2D not available')); return; }
          ctx.drawImage(bmp, 0, 0, w, h);
          bmp.close();

          canvas.toBlob(
            blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null')),
            'image/jpeg',
            quality,
          );
        })
        .catch(e => reject(new Error(
          `Failed to decode image (${file.type || 'unknown type'}, ${Math.round(file.size / 1024)} KB): `
          + (e?.message || String(e))
        )));
    });
  }

  /** Lazy-load heic2any and convert a HEIC/HEIF File to a JPEG Blob. */
  async function convertHeic(file) {
    if (!window.heic2any) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load HEIC converter'));
        document.head.appendChild(s);
      });
    }
    const result = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return Array.isArray(result) ? result[0] : result;
  }

  /** Compress a File to two JPEG blobs: { display, thumb } */
  async function compress(file) {
    let source = file;
    const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    if (isHeic) source = await convertHeic(file);

    const [display, thumb] = await Promise.all([
      compressToJpeg(source, 2000, 0.80),
      compressToJpeg(source, 400,  0.80),
    ]);
    return { display, thumb };
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
    await GitHub.putBinaryFile(thumbPath,   tBuf, existingThumbSha,   `Highlight thumb ${id}: ${slug}`);

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
