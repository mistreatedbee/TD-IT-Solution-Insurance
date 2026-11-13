// WCAG 2.1 contrast check for key token pairs, read from tokens.json (values untouched).
// Translucent tokens (glass-fill, *-bg tints) are composited over bg-page of the same theme.
// Exits 1 if any pair misses its target. Usage: node design-system/check-contrast.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(here, 'tokens.json'), 'utf8')).color.tokens;
const byName = Object.fromEntries(tokens.map((t) => [t.name, t.value]));

const raw = (name, theme) => {
  const v = byName[name];
  const val = typeof v === 'string' ? v : v[theme];
  const ref = /^\{([a-z0-9-]+)\}$/.exec(val);
  return ref ? raw(ref[1], theme) : val;
};
const parse = (hex) => {
  const h = hex.slice(1);
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
};
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const colour = (name, theme, ground) => {
  const c = parse(raw(name, theme));
  return c.a < 1 ? over(c, ground) : c;
};
const lum = ({ r, g, b }) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// [foreground, background, target, note]
const pairs = [
  ['ink', 'bg-page', 4.5], ['ink-muted', 'bg-page', 4.5],
  ['ink', 'glass-fill', 4.5], ['ink-muted', 'glass-fill', 4.5],
  ['ink', 'bg-raised', 4.5], ['ink-muted', 'bg-raised', 4.5],
  ['ink', 'bg-sunken', 4.5], ['ink-muted', 'bg-sunken', 4.5],
  ['on-action-primary', 'action-primary', 4.5],
  ['on-action-secondary', 'action-secondary', 4.5],
  ['on-navy', 'brand-navy', 4.5],
  ['link', 'bg-page', 4.5], ['link', 'bg-raised', 4.5], ['link', 'glass-fill', 4.5], ['link', 'info-bg', 4.5],
  ['accent-text', 'bg-page', 4.5], ['accent-text', 'bg-raised', 4.5], ['accent-text', 'glass-fill', 4.5],
  ['success', 'bg-page', 4.5], ['success', 'success-bg', 4.5],
  ['danger', 'bg-page', 4.5], ['danger', 'danger-bg', 4.5],
  ['warning', 'bg-page', 4.5], ['warning', 'warning-bg', 4.5],
  ['border-control', 'bg-page', 3], ['border-control', 'bg-raised', 3], ['border-control', 'glass-fill', 3],
  ['focus-ring', 'bg-page', 3], ['focus-ring', 'bg-raised', 3], ['focus-ring', 'glass-fill', 3],
];
// Not applicable in a theme (usage notes): brand-navy is not body text on night.
const rows = [];
let failures = 0;
for (const theme of ['day', 'night']) {
  const page = colour('bg-page', theme, { r: 255, g: 255, b: 255, a: 1 });
  for (const [fg, bg, target] of pairs) {
    // Translucent grounds composite over bg-page; a tint under text composites over bg-page too.
    const bgC = colour(bg, theme, page);
    const fgC = colour(fg, theme, bgC);
    const r = ratio(fgC, bgC);
    const pass = r >= target;
    if (!pass) failures++;
    rows.push({ theme, fg, bg, target, r, pass });
  }
}
for (const x of rows) console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.theme.padEnd(5)} ${x.fg} on ${x.bg}: ${x.r.toFixed(2)} (need ${x.target})`);
console.log(failures ? `\n${failures} pair(s) below target` : '\nAll pairs meet target');
process.exit(failures ? 1 : 0);
