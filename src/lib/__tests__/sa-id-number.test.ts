import { describe, expect, it } from 'vitest';
import { truncateSaIdNumber, validateSaIdNumber } from '../sa-id-number';

// A checksum-valid, real-date SA ID number for a 1990-01-01 citizen (constructed via the same
// Luhn-style algorithm this module implements — not a real person's number).
const VALID_ID = '9001015800088';

describe('validateSaIdNumber', () => {
  it('accepts a checksum-valid, real-date ID number (AC-4 control case)', () => {
    expect(validateSaIdNumber(VALID_ID)).toEqual({ valid: true });
  });

  it('rejects a string that is not 13 digits', () => {
    expect(validateSaIdNumber('12345').valid).toBe(false);
    expect(validateSaIdNumber('').valid).toBe(false);
  });

  it('rejects an otherwise well-formed number with an invalid check digit', () => {
    const tampered = `${VALID_ID.slice(0, 12)}9`;
    expect(validateSaIdNumber(tampered).valid).toBe(false);
  });

  it('rejects a number whose first 6 digits are not a real calendar date', () => {
    // month 13 is not real
    const badDate = `991301${VALID_ID.slice(6)}`;
    expect(validateSaIdNumber(badDate).valid).toBe(false);
  });

  it('rejects a number with an invalid citizenship digit', () => {
    const digits = VALID_ID.split('');
    digits[10] = '5';
    const withBadCitizenship = digits.join('');
    expect(validateSaIdNumber(withBadCitizenship).valid).toBe(false);
  });
});

describe('truncateSaIdNumber', () => {
  it('keeps only the last 4 digits', () => {
    expect(truncateSaIdNumber(VALID_ID)).toBe('0088');
  });

  it('trims whitespace before truncating', () => {
    expect(truncateSaIdNumber(`  ${VALID_ID}  `)).toBe('0088');
  });
});
