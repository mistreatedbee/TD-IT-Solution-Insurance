/**
 * Generate app icons from ../../public/logo.png.
 * Run: npm run generate-icons (from mobile/)
 *
 * Launcher icons (icon.png, android-icon-foreground.png,
 * android-icon-monochrome.png) use ONLY the diamond/double-chevron mark
 * cropped out of the full lockup — not the full "TD IT SOLUTION INSURANCE"
 * wordmark. Two reasons:
 *   1. Android adaptive icons only reliably show the center ~66% of the
 *      foreground layer (Android adaptive-icon safe zone) — everything
 *      outside that circle gets clipped by circle/squircle/rounded-square
 *      launcher masks. A full-width wordmark runs edge-to-edge and gets its
 *      outer letters cropped on real devices.
 *   2. A spelled-out company name is illegible at ~48dp launcher size —
 *      launcher icons need a simplified mark, not a wordmark.
 * Splash (splash-icon.png) and favicon.png keep the full lockup — they
 * aren't subject to adaptive-icon masking and have room to show the name.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, '..');
const srcLogo = path.join(mobileRoot, '..', 'public', 'logo.png');
const outDir = path.join(mobileRoot, 'assets');

const SIZE = 1024;
const PADDING = 0.12;
const SPLASH_PADDING = 0.1;
const BG = '#FFFFFF';
const BRAND_NAVY = '#2C3E50';
const ADAPTIVE_BG = BRAND_NAVY;

// --- Chevron-mark crop box, as fractions of the full public/logo.png ---
// public/logo.png is the full lockup: an upward orange+blue double-chevron,
// then "TD IT SOLUTION" (navy) and "INSURANCE" (orange) text, then a
// downward blue double-chevron — top and bottom chevrons are NOT a closed
// diamond outline, they're two separate stacked elements framing the text.
// We isolate the TOP double-chevron only (clean, roughly square-ish
// bounding box, no text anywhere near it). Box below is deliberately a
// little generous around the chevron and stops well above the "TD IT
// SOLUTION" text baseline; sharp's trim() then tightens it to the actual
// ink so small estimation error here doesn't pull in text pixels.
const CHEVRON_CROP_FRACTIONS = { left: 0.28, top: 0.02, right: 0.72, bottom: 0.35 };

// Android adaptive-icon safe zone is the center 66% of the 108dp canvas;
// we target the chevron's bounding-box DIAGONAL at ~60% of that (not just
// width/height) so all 4 corners of its rectangular bbox stay inside the
// safe circle even though the chevron isn't a perfect square.
const ADAPTIVE_SAFE_DIAGONAL_RATIO = 0.6; // of SIZE

// public/logo.png has NO alpha channel (hasAlpha: false, 3 channels) — it's
// a flat opaque PNG with a baked-in white background, not real transparency.
// Cropping it and compositing "onto a transparent canvas" therefore produces
// an opaque white rectangle behind the mark, not a true cutout — invisible
// in a flat viewer against white, but would show as a wrong-colored box
// behind the mark on a real device's adaptive-icon background. This derives
// real per-pixel alpha from color distance-from-white (white -> transparent,
// saturated/dark pixels -> opaque), which is a safe approach for simple
// line art on a plain white background like this mark.
async function deriveAlphaFromWhite(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < data.length; i += channels, p += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const existingAlpha = channels === 4 ? data[i + 3] : 255;
    const derivedAlpha = 255 - Math.min(r, g, b);
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
    out[p + 3] = Math.round((derivedAlpha * existingAlpha) / 255);
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function extractChevronMark(background) {
  const src = sharp(srcLogo);
  const meta = await src.metadata();
  const w = meta.width;
  const h = meta.height;
  const f = CHEVRON_CROP_FRACTIONS;
  const left = Math.round(w * f.left);
  const top = Math.round(h * f.top);
  const width = Math.round(w * (f.right - f.left));
  const height = Math.round(h * (f.bottom - f.top));

  const cropped = await sharp(srcLogo)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  // Tighten to the actual chevron ink (drops surrounding white margin from
  // our deliberately generous crop box above).
  const trimmed = await sharp(cropped).trim({ background: '#FFFFFF', threshold: 10 }).png().toBuffer();
  // Give it real transparency (see deriveAlphaFromWhite above) so downstream
  // composites actually cut out, instead of leaving an opaque white box.
  const withAlpha = await deriveAlphaFromWhite(trimmed);
  const trimmedMeta = await sharp(withAlpha).metadata();
  return { buffer: withAlpha, width: trimmedMeta.width, height: trimmedMeta.height, background };
}

// Android 13+ "themed icon" monochrome layer: must be a single-color
// silhouette (white here) with the shape defined entirely by alpha — the OS
// applies its own tint on top. Reuses the mark's own real per-pixel alpha
// (see deriveAlphaFromWhite) rather than deriving color via
// greyscale/threshold/negate, which silently zeroed the whole alpha channel
// (sharp's negate() inverts alpha too unless told not to, and combined with
// threshold() first this collapsed to fully transparent everywhere — caught
// by checking sharp .stats() on the output, not by eye; a flat white-on-white
// preview looks identical whether the shape is present or the layer is
// simply blank).
async function toMonochromeAlpha(buffer, color = { r: 255, g: 255, b: 255 }) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < data.length; i += channels, p += 4) {
    out[p] = color.r;
    out[p + 1] = color.g;
    out[p + 2] = color.b;
    out[p + 3] = data[i + 3];
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function composeChevronMark(size, { transparentBg = false, monochrome = false, background = BG } = {}) {
  const mark = await extractChevronMark(background);

  // Scale so the mark's bounding-box diagonal is ADAPTIVE_SAFE_DIAGONAL_RATIO
  // of the canvas, guaranteeing it sits inside the adaptive-icon safe zone
  // with margin to spare (also fine for icon.png, which has no masking).
  const diagonal = Math.sqrt(mark.width ** 2 + mark.height ** 2);
  const targetDiagonal = size * ADAPTIVE_SAFE_DIAGONAL_RATIO;
  const scale = targetDiagonal / diagonal;
  const targetWidth = Math.round(mark.width * scale);
  const targetHeight = Math.round(mark.height * scale);

  const pipeline = sharp(mark.buffer).resize({ width: targetWidth, height: targetHeight, fit: 'inside' });

  let markBuf = await pipeline.png().toBuffer();

  if (monochrome) {
    markBuf = await toMonochromeAlpha(markBuf);
  }
  const markMeta = await sharp(markBuf).metadata();
  const left = Math.floor((size - (markMeta.width ?? targetWidth)) / 2);
  const top = Math.floor((size - (markMeta.height ?? targetHeight)) / 2);

  const backgroundColor = transparentBg ? { r: 255, g: 255, b: 255, alpha: 0 } : background;

  return sharp({
    create: { width: size, height: size, channels: 4, background: backgroundColor },
  }).composite([{ input: markBuf, left, top }]).png();
}

async function fitLogoOnSquare(
  size,
  paddingRatio,
  { transparentBg = false, monochrome = false, background = BG } = {},
) {
  const pad = Math.floor(size * paddingRatio);
  const inner = size - pad * 2;

  let pipeline = sharp(srcLogo).resize({
    width: inner,
    height: inner,
    fit: 'inside',
    withoutEnlargement: false,
  });

  if (monochrome) {
    pipeline = pipeline
      .greyscale()
      .linear(1.4, -40)
      .threshold(210)
      .negate()
      .ensureAlpha();
  }

  const logoBuf = await pipeline.png().toBuffer();
  const logoMeta = await sharp(logoBuf).metadata();
  const left = Math.floor((size - (logoMeta.width ?? inner)) / 2);
  const top = Math.floor((size - (logoMeta.height ?? inner)) / 2);

  const backgroundColor = transparentBg ? { r: 255, g: 255, b: 255, alpha: 0 } : background;

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: backgroundColor,
    },
  }).composite([{ input: logoBuf, left, top }]).png();
}

async function solidBackground(size, color) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: color,
    },
  }).png();
}

async function main() {
  if (!fs.existsSync(srcLogo)) {
    console.error(`Missing source logo: ${srcLogo}`);
    process.exit(1);
  }

  // Launcher icons: simplified chevron mark only (see header comment).
  await (await composeChevronMark(SIZE, { background: BG })).toFile(path.join(outDir, 'icon.png'));
  await (await composeChevronMark(SIZE, { transparentBg: true })).toFile(
    path.join(outDir, 'android-icon-foreground.png'),
  );
  await (await composeChevronMark(SIZE, { transparentBg: true, monochrome: true })).toFile(
    path.join(outDir, 'android-icon-monochrome.png'),
  );

  // Splash and favicon: full lockup (wordmark) — no adaptive-icon masking
  // constraint, so the full brand name is fine and preferred there.
  await (await fitLogoOnSquare(SIZE, SPLASH_PADDING, { background: BRAND_NAVY })).toFile(
    path.join(outDir, 'splash-icon.png'),
  );
  await (await fitLogoOnSquare(192, PADDING)).toFile(path.join(outDir, 'favicon.png'));

  await (await solidBackground(SIZE, ADAPTIVE_BG)).toFile(path.join(outDir, 'android-icon-background.png'));

  console.log('Updated mobile/assets from public/logo.png (launcher icons: chevron mark; splash/favicon: full lockup)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
