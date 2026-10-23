/**
 * `generateAccountNumber` / `normalizeAccountNumber` — pure-function coverage.
 * Business-owner top-priority request (2026-10-23), migrations/040.
 */
import { describe, it, expect } from 'vitest';
import { ACCOUNT_NUMBER_CHARSET, generateAccountNumber, normalizeAccountNumber } from './accounts.js';

describe('generateAccountNumber', () => {
  it('produces TD- followed by 6 characters from ACCOUNT_NUMBER_CHARSET', () => {
    for (let i = 0; i < 200; i++) {
      const value = generateAccountNumber();
      expect(value).toMatch(/^TD-[A-Z0-9]{6}$/);
      const suffix = value.slice(3);
      for (const ch of suffix) {
        expect(ACCOUNT_NUMBER_CHARSET).toContain(ch);
      }
    }
  });

  it('never includes ambiguous characters 0, O, 1, I, L', () => {
    for (let i = 0; i < 200; i++) {
      const value = generateAccountNumber();
      expect(value).not.toMatch(/[0O1IL]/);
    }
  });

  it('is not trivially predictable across calls', () => {
    const values = new Set(Array.from({ length: 50 }, () => generateAccountNumber()));
    // 31^6 combinations — 50 draws colliding would be astronomically unlikely.
    expect(values.size).toBe(50);
  });
});

describe('normalizeAccountNumber', () => {
  it('uppercases and trims a well-formed value', () => {
    expect(normalizeAccountNumber('  td-7f3k9q  ')).toBe('TD-7F3K9Q');
    expect(normalizeAccountNumber('TD-7F3K9Q')).toBe('TD-7F3K9Q');
  });

  it('rejects malformed shapes', () => {
    expect(normalizeAccountNumber('TD-7F3K9')).toBeNull(); // too short
    expect(normalizeAccountNumber('TD-7F3K9QX')).toBeNull(); // too long
    expect(normalizeAccountNumber('XX-7F3K9Q')).toBeNull(); // wrong prefix
    expect(normalizeAccountNumber('TD7F3K9Q')).toBeNull(); // missing dash
    expect(normalizeAccountNumber('')).toBeNull();
  });
});
