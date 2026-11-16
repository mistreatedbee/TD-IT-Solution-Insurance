/**
 * Generate the WHITE-background app icon set from assets/icon-mark-source.png (the mark on plain white).
 * Run: node scripts/generate-app-icon-white.mjs   (from mobile/)
 *
 * Writes the files app.json already points at:
 *   assets/app-icon-ios-1024.png                 white square, mark centred (iOS rounds the corners itself)
 *   assets/app-icon-android-foreground-1024.png  mark on transparent, inside the 66% adaptive safe zone
 *   assets/app-icon-android-background-1024.png  solid white
 *   assets/app-icon-android-monochrome-1024.png  white silhouette on transparent (Android 13+ themed icons)
 *
 * The mark keeps its own colours (orange + deep blue), which read better on white than the bright blue used
 * on the old navy icon. Real transparency is derived from distance-from-white, as in generate-icons.mjs.
 * The notification icon is a separate monochrome asset and is not touched here. Never add text, a border or
 * a shadow to the icon.
 */
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'assets');
const SIZE = 1024;
const WHITE = '#FFFFFF';

async function markWithAlpha() {
  const trimmed = await sharp(path.join(assets, 'icon-mark-source.png')).trim({ background: WHITE, threshold: 10 }).png().toBuffer();
  const { data, info } = await sharp(trimmed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, p = 0; i < data.length; i += info.channels, p += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // alpha from how far the pixel is from white; colour snapped to the stroke it belongs to (orange or blue)
    // The source's "white" is not perfectly white (about 253), so ignore the first 14 levels of distance or a faint
    // box shows around the mark. Strokes are far darker than this, so they stay fully opaque.
    const dist = 255 - Math.min(r, g, b);
    const a = Math.min(255, Math.round(Math.max(0, dist - 14) * 1.25));
    out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = a;
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function silhouette(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 4) { out[p] = out[p + 1] = out[p + 2] = 255; out[p + 3] = data[i + 3]; }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function compose(markBuf, heightRatio, { transparent = false, mono = false } = {}) {
  let m = await sharp(markBuf).resize({ height: Math.round(SIZE * heightRatio), fit: 'inside' }).png().toBuffer();
  if (mono) m = await silhouette(m);
  const meta = await sharp(m).metadata();
  const left = Math.floor((SIZE - meta.width) / 2);
  const top = Math.floor((SIZE - meta.height) / 2);
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: transparent ? { r: 255, g: 255, b: 255, alpha: 0 } : WHITE } })
    .composite([{ input: m, left, top }])
    .png();
}

const mark = await markWithAlpha();
// iOS: no masking inside the square, so the mark can be large. Android: mark diagonal stays inside the 66% safe circle.
await (await compose(mark, 0.62)).removeAlpha().toFile(path.join(assets, 'app-icon-ios-1024.png'));
await (await compose(mark, 0.46, { transparent: true })).toFile(path.join(assets, 'app-icon-android-foreground-1024.png'));
await (await compose(mark, 0.46, { transparent: true, mono: true })).toFile(path.join(assets, 'app-icon-android-monochrome-1024.png'));
await sharp({ create: { width: SIZE, height: SIZE, channels: 3, background: WHITE } }).png().toFile(path.join(assets, 'app-icon-android-background-1024.png'));
console.log('Wrote white-background app icon set to mobile/assets');
