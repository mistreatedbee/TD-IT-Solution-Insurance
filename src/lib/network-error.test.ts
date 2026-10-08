import { describe, expect, it } from 'vitest';
import { isNetworkError } from './network-error';

describe('isNetworkError', () => {
  it.each([
    'Failed to fetch',
    'TypeError: NetworkError when attempting to fetch resource.',
    'Load failed',
    'Network request failed',
  ])('matches known cross-browser fetch rejection message: %s', (message) => {
    expect(isNetworkError(new Error(message))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isNetworkError(new Error('FAILED TO FETCH'))).toBe(true);
  });

  it('returns false for a real API error message', () => {
    expect(isNetworkError(new Error('Incorrect email or password.'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isNetworkError('failed to fetch')).toBe(false);
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError({ message: 'failed to fetch' })).toBe(false);
  });
});
