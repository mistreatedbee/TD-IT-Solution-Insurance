import { describe, expect, it } from 'vitest';
import * as templates from './domain-email-templates.js';
import { EMAIL_COLORS as C, EMAIL_DARK_MODE_CSS } from './email-style.js';
import { renderDomainEmailFooter, renderDomainEmailSignature } from './email-footer.js';

function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('email palette (design system, Day theme)', () => {
  it.each([
    ['ink on white', C.ink, C.card],
    ['muted on white', C.muted, C.card],
    ['muted on page', C.muted, C.page],
    ['muted on sunken', C.muted, C.sunken],
    ['subtle on white', C.subtle, C.card],
    ['subtle on sunken', C.subtle, C.sunken],
    ['link on white', C.link, C.card],
    ['link on sunken', C.link, C.sunken],
    ['white on navy', '#FFFFFF', C.navy],
    ['ink on the orange button', C.ink, C.orange],
    ['navy heading on white', C.navy, C.card],
  ])('%s meets 4.5:1', (_n, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark-mode pairs meet 4.5:1', () => {
    for (const [fg, bg] of [['#F2F6FA', '#14253A'], ['#AEBBCA', '#14253A'], ['#8FA3B8', '#0F1D2C'], ['#7CC0F0', '#14253A'], ['#F2F6FA', '#0B1622']] as const) {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('every notification email uses the current design', () => {
  // Strings by default; a few builders take a Date or a list of paragraphs.
  const typed: Record<string, unknown> = { at: new Date('2026-01-01T00:00:00Z'), paragraphs: ['Sample paragraph'] };
  const sample = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? (k in typed ? typed[k] : `Sample ${k}`) : undefined) });
  const builders = Object.entries(templates).filter(([n, f]) => n.startsWith('build') && typeof f === 'function');

  it('covers all the builders', () => expect(builders.length).toBeGreaterThanOrEqual(20));

  it.each(builders)('%s: new palette, dark mode, no legacy colours', (_name, fn) => {
    const { html } = (fn as (p: unknown) => { html: string })(sample);
    expect(html).toContain(C.page);
    expect(html).toContain(C.orange);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).not.toMatch(/#(FAF8F5|1C1917|6B6156|E4DDD1|8a939b|0B2A4A|E7EBEF)\b/i);
  });

  it('footer and signature carry no legacy colours either', () => {
    expect(`${renderDomainEmailFooter()}${renderDomainEmailSignature()}`).not.toMatch(/#(FAF8F5|1C1917|6B6156|E4DDD1|8a939b|0B2A4A|E7EBEF)\b/i);
  });

  it('the dark-mode stylesheet never recolours the call-to-action link text', () => {
    expect(EMAIL_DARK_MODE_CSS).toContain('color:#14202D"]:not(a)');
  });
});
