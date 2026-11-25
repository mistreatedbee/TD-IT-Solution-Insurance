#!/usr/bin/env node
/**
 * Generates the web browser-tab / home-screen icons so they match the mobile app icon
 * (mobile/assets/app-icon-ios-1024.png): the TD mark centred on a white tile.
 *
 * Mark geometry: mobile/src/design/icons/tdMark.ts. Colours sampled from the app icon PNG
 * (orange #F5A022, blue #2780B8 — the same brand tokens noted in src/index.css).
 * Mark size: the app icon's mark spans ~58.4% of the tile height, centred.
 *
 * Writes: public/favicon.svg, favicon-16.png, favicon-32.png, apple-touch-icon.png (180, opaque),
 * icon-192.png, icon-512.png, favicon.ico (16/32/48, PNG-embedded).
 *
 * Usage: node scripts/generate-favicons.mjs
 * Needs `sharp`: resolved from the root install, else from mobile/node_modules (a mobile devDependency).
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = (f) => path.join(root, 'public', f);

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  sharp = createRequire(path.join(root, 'mobile', 'package.json'))('sharp');
}

const ORANGE = '#F5A022';
const BLUE = '#2780B8';
const BORDER = '#D5DEE8';

// Polygon extents in mark space (after each half's offset): x 430.5..936.5, y 153.25..725.
const MARK_CX = 683.5;
const MARK_CY = 439.125;
const MARK_H = 571.75;
const MARK_FRACTION = 598 / 1024; // measured from app-icon-ios-1024.png

const mark = (size) => {
  const s = ((size * MARK_FRACTION) / MARK_H).toFixed(5);
  const c = size / 2;
  return (
    `<g transform="translate(${c} ${c}) scale(${s}) translate(-${MARK_CX} -${MARK_CY})">` +
    `<g transform="translate(0 127)">` +
    `<polygon fill="${ORANGE}" points="683.5,26.25 936.5,279.25 901,279.25 683.5,61.75 466,279.25 430.5,279.25"/>` +
    `<polygon fill="${BLUE}" points="683.5,138 826.5,281 806.5,281 683.5,158 560.5,281 540.5,281"/>` +
    `</g><g transform="translate(0 -127)">` +
    `<polygon fill="${BLUE}" points="683.5,852 936.5,599 901,599 683.5,816.5 466,599 430.5,599"/>` +
    `<polygon fill="${BLUE}" points="683.5,740.25 826.5,597.25 806.5,597.25 683.5,720.25 560.5,597.25 540.5,597.25"/>` +
    `</g></g>`
  );
};

// Tab favicon: rounded white tile with a subtle light border so it reads on light and dark tab bars.
const tabSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
  `<rect x="0.5" y="0.5" width="63" height="63" rx="14" fill="#FFFFFF" stroke="${BORDER}"/>` +
  mark(64) +
  `</svg>\n`;

// Home-screen / manifest icons: full-bleed opaque white square (the OS applies its own mask), like the app icon.
const squareSvg = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
  `<rect width="${size}" height="${size}" fill="#FFFFFF"/>${mark(size)}</svg>`;

const render = (svg, size, opaque = false) => {
  let img = sharp(Buffer.from(svg), { density: 72 * Math.max(1, Math.ceil(size / 64)) }).resize(size, size);
  if (opaque) img = img.flatten({ background: '#FFFFFF' }).removeAlpha();
  return img.png({ compressionLevel: 9 }).toBuffer();
};

writeFileSync(pub('favicon.svg'), tabSvg);
writeFileSync(pub('favicon-16.png'), await render(tabSvg, 16));
writeFileSync(pub('favicon-32.png'), await render(tabSvg, 32));
writeFileSync(pub('apple-touch-icon.png'), await render(squareSvg(180), 180, true));
writeFileSync(pub('icon-192.png'), await render(squareSvg(192), 192, true));
writeFileSync(pub('icon-512.png'), await render(squareSvg(512), 512, true));

// favicon.ico with PNG-embedded images (supported by all browsers that still request .ico).
const icoSizes = [16, 32, 48];
const pngs = await Promise.all(icoSizes.map((s) => render(tabSvg, s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = 6 + 16 * icoSizes.length;
const entries = icoSizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
writeFileSync(pub('favicon.ico'), Buffer.concat([header, ...entries, ...pngs]));

console.log('Wrote favicon.svg, favicon-16/32.png, apple-touch-icon.png, icon-192/512.png, favicon.ico to public/');
