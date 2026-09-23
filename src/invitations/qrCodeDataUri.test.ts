import { describe, expect, it } from 'vitest';
import { qrCodeImageSrc } from './qrCodeDataUri';

describe('qrCodeImageSrc', () => {
  it('returns null for empty/missing input', () => {
    expect(qrCodeImageSrc(null)).toBeNull();
    expect(qrCodeImageSrc(undefined)).toBeNull();
    expect(qrCodeImageSrc('')).toBeNull();
    expect(qrCodeImageSrc('   ')).toBeNull();
  });

  it('base64-encodes raw <svg> markup as a data:image/svg+xml URI', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    const src = qrCodeImageSrc(svg);
    expect(src).toMatch(/^data:image\/svg\+xml;charset=utf-8;base64,/);
    const encoded = src!.split(',')[1];
    expect(atob(encoded)).toBe(svg);
  });

  it('passes through an already-prefixed data: URI unchanged', () => {
    const uri = 'data:image/svg+xml;base64,AAAA';
    expect(qrCodeImageSrc(uri)).toBe(uri);
  });

  it('returns null for an unrecognized payload shape rather than guessing a MIME type', () => {
    expect(qrCodeImageSrc('just-some-opaque-string')).toBeNull();
  });
});
