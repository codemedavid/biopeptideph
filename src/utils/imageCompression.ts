// Client-side image optimization for uploads.
//
// Downscales large images and re-encodes to WebP so hero/carousel images load
// fast. Vector (SVG) and animated (GIF) files pass through untouched. Any failure
// falls back to the original file so an upload is never blocked by compression.

export interface CompressOptions {
  maxWidth?: number;   // longest edge cap, px
  maxHeight?: number;
  quality?: number;    // 0..1 for lossy encode
  mimeType?: string;   // output type
}

const PASS_THROUGH = new Set(['image/svg+xml', 'image/gif']);

export interface ImageValidationResult {
  ok: boolean;
  error?: string;
}

// Validate type + size before doing any work. Mirrors the accepted formats in
// the feature spec (JPG/PNG/WEBP) plus the broader set the uploader already allows.
export function validateImageFile(file: File, maxBytes = 10 * 1024 * 1024): ImageValidationResult {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const okExt = ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'svg', 'avif', 'heic', 'heif'];
  const typeOk = (!file.type || file.type.startsWith('image/')) && (okExt.includes(ext) || file.type.startsWith('image/'));
  if (!typeOk) return { ok: false, error: 'Please choose an image file (JPG, PNG, or WEBP).' };
  if (file.size < 100) return { ok: false, error: 'That file looks empty or invalid.' };
  if (file.size > maxBytes) {
    return { ok: false, error: `Image must be under ${Math.round(maxBytes / 1024 / 1024)}MB (this one is ${(file.size / 1024 / 1024).toFixed(1)}MB).` };
  }
  return { ok: true };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read image'));
    img.src = src;
  });
}

/**
 * Returns a compressed File (WebP) when possible, otherwise the original file.
 * Never throws — on any error it resolves to the input file.
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxWidth = 1920, maxHeight = 1920, quality = 0.82, mimeType = 'image/webp' } = opts;

  // Don't touch vector/animated images.
  if (PASS_THROUGH.has(file.type) || /\.(svg|gif)$/i.test(file.name)) return file;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const ratio = Math.min(1, maxWidth / img.width, maxHeight / img.height);
    // Only re-encode if it actually helps (oversized, or a heavy PNG/JPEG).
    const needsResize = ratio < 1;
    const heavy = file.size > 400 * 1024;
    if (!needsResize && !heavy) return file;

    const targetW = Math.max(1, Math.round(img.width * ratio));
    const targetH = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // toBlob with a timeout so a stuck encoder can never hang the upload.
    const blob = await new Promise<Blob | null>((resolve) => {
      let settled = false;
      const finish = (b: Blob | null) => { if (!settled) { settled = true; resolve(b); } };
      const timer = setTimeout(() => finish(null), 5000);
      canvas.toBlob((b) => { clearTimeout(timer); finish(b); }, mimeType, quality);
    });
    // toBlob can yield null (unsupported type) — fall back to the original.
    if (!blob || blob.size === 0) return file;
    // If compression didn't actually shrink it, keep the original.
    if (blob.size >= file.size && !needsResize) return file;

    const base = file.name.replace(/\.[^.]+$/, '');
    const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `${base}.${ext}`, { type: mimeType });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
