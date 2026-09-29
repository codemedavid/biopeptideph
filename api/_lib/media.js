import crypto from 'node:crypto';
import fs from 'node:fs';

export const imageAssets = JSON.parse(fs.readFileSync(new URL('./image-assets.json', import.meta.url), 'utf8'));
const WIDTHS = new Set([320, 640, 960, 1600]);

export function signedImageUrl(filePath, width, { key = process.env.IMAGEKIT_PRIVATE_KEY, now = Date.now() } = {}) {
  if (!key) throw new Error('ImageKit is not configured');
  if (!/^\/diamondglow-migration\/private-v1\/[a-f0-9]{64}\.(jpg|png|webp)$/.test(filePath) || !WIDTHS.has(width)) throw new Error('Invalid image variant');
  const endpoint = 'https://ik.imagekit.io/jl17byaav';
  // Stable five-minute windows improve browser/CDN reuse. Every link lives 5–10 minutes.
  const expires = (Math.floor(now / 300000) + 2) * 300;
  const relative = `tr:w-${width},q-75,f-auto,c-at_max${filePath}`;
  const signature = crypto.createHmac('sha1', key).update(relative + expires).digest('hex');
  return `${endpoint}/${relative}?ik-t=${expires}&ik-s=${signature}`;
}

export function mediaHandler({ assets = imageAssets, requireValidSession, requireAdmin }) {
  return (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Fetch Metadata blocks ordinary cross-site embedding and direct navigation.
    // It supplements authentication; it is not a defense against forged HTTP clients.
    if (req.get('sec-fetch-site') === 'cross-site' || req.get('sec-fetch-dest') === 'document') return res.status(403).json({ error: 'website_image_only' });
    const asset = assets[req.params.id];
    if (!asset) return res.status(404).json({ error: 'image_not_found' });
    const width = req.query.w === undefined ? 960 : Number(req.query.w);
    if (!WIDTHS.has(width)) return res.status(400).json({ error: 'invalid_image_size' });
    const deliver = () => {
      try {
        const url = signedImageUrl(asset.filePath, width);
        res.set('Cache-Control', asset.access === 'admin' ? 'no-store' : 'private, max-age=240');
        res.set('Vary', 'Cookie, Sec-Fetch-Site, Sec-Fetch-Dest');
        res.set('Referrer-Policy', 'no-referrer');
        return res.redirect(302, url);
      } catch { return res.status(503).json({ error: 'image_delivery_unavailable' }); }
    };
    if (asset.access === 'admin') return requireAdmin(req, res, deliver);
    if (asset.access !== 'catalog') return res.status(403).json({ error: 'forbidden' });
    if (req.session?.isAdmin) return deliver();
    return requireValidSession(req, res, deliver, next);
  };
}
