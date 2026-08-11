/**
 * Generate app icons from ../../public/logo.png.
 * Run: npm run generate-icons (from mobile/)
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
const SPLASH_PADDING = 0.08;
const BG = '#FFFFFF';
const ADAPTIVE_BG = '#FFFFFF';

async function fitLogoOnSquare(size, paddingRatio, { transparentBg = false, monochrome = false } = {}) {
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

  const background = transparentBg ? { r: 255, g: 255, b: 255, alpha: 0 } : BG;

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
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

  await (await fitLogoOnSquare(SIZE, PADDING)).toFile(path.join(outDir, 'icon.png'));
  await (await fitLogoOnSquare(SIZE, SPLASH_PADDING)).toFile(path.join(outDir, 'splash-icon.png'));
  await (await fitLogoOnSquare(SIZE, PADDING, { transparentBg: true })).toFile(
    path.join(outDir, 'android-icon-foreground.png'),
  );
  await (await solidBackground(SIZE, ADAPTIVE_BG)).toFile(path.join(outDir, 'android-icon-background.png'));
  await (await fitLogoOnSquare(SIZE, PADDING, { transparentBg: true, monochrome: true })).toFile(
    path.join(outDir, 'android-icon-monochrome.png'),
  );
  await (await fitLogoOnSquare(192, PADDING)).toFile(path.join(outDir, 'favicon.png'));

  console.log('Updated mobile/assets from public/logo.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
