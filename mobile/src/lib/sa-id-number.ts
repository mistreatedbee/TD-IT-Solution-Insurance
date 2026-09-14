/**
 * South African ID number — client-side format/checksum validation and truncation.
 *
 * CT-11 (docs/organization/10-data-protection-contract-obligations.md §9.6): the full 13-digit
 * ID number must never leave the device. This module validates the full number locally (so the
 * customer gets immediate feedback on a malformed/invalid number) and truncates it to the last
 * 4 digits, which is the only form ever sent to the backend API
 * (`backend/src/lib/customer-profile-validation.ts`).
 *
 * This is a minimal, scoped implementation for CT-11's data-minimisation purpose only — it
 * checks structural validity (length, Luhn-style check digit, plausible calendar date,
 * citizenship digit), not the full Tier 1 scope of Feature 013
 * (docs/features/013-sa-id-verification/business-requirements.md), which additionally covers
 * date-of-birth cross-checking and is server-side, authoritative validation. Do not extend this
 * file into Feature 013's scope without that feature being picked up separately.
 */

export interface SaIdValidationResult {
  valid: boolean;
  /** User-facing reason, present only when valid is false. */
  error?: string;
}

/**
 * Luhn-style check digit used by SA ID numbers: sum the odd-position digits (1-indexed),
 * double the number formed by the even-position digits and sum *those* digits, add the two
 * sums, and the check digit is what brings the total to the next multiple of 10.
 */
function isValidCheckDigit(id: string): boolean {
  const digits = id.split('').map(Number);
  let oddSum = 0;
  for (let i = 0; i < 12; i += 2) oddSum += digits[i] ?? 0;

  let evenConcat = '';
  for (let i = 1; i < 12; i += 2) evenConcat += digits[i] ?? 0;
  const evenDoubled = String(Number(evenConcat) * 2);
  const evenSum = evenDoubled.split('').reduce((sum, d) => sum + Number(d), 0);

  const checkDigit = (10 - ((oddSum + evenSum) % 10)) % 10;
  return checkDigit === (digits[12] ?? -1);
}

/** Confirms digits 1-6 (YYMMDD) resolve to a real calendar date under either plausible century. */
function hasPlausibleBirthDate(id: string): boolean {
  const yy = Number(id.slice(0, 2));
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));

  const isRealDate = (year: number): boolean => {
    const date = new Date(Date.UTC(year, mm - 1, dd));
    return (
      date.getUTCFullYear() === year && date.getUTCMonth() === mm - 1 && date.getUTCDate() === dd
    );
  };

  return isRealDate(1900 + yy) || isRealDate(2000 + yy);
}

/**
 * Validates a full 13-digit South African ID number. Does not extract, store, log, or return
 * the race-classification digit (position 12) — it is only ever read internally as part of the
 * checksum arithmetic, per Feature 013 §1/FR-6's constraint, applied here as good practice even
 * though this is a smaller scope.
 */
export function validateSaIdNumber(idNumber: string): SaIdValidationResult {
  const trimmed = idNumber.trim();

  if (!/^[0-9]{13}$/.test(trimmed)) {
    return { valid: false, error: 'South African ID must be 13 digits.' };
  }

  if (!hasPlausibleBirthDate(trimmed)) {
    return { valid: false, error: 'That ID number does not contain a valid date of birth.' };
  }

  const citizenshipDigit = trimmed.charAt(10);
  if (citizenshipDigit !== '0' && citizenshipDigit !== '1') {
    return { valid: false, error: 'That ID number is not a recognised format.' };
  }

  if (!isValidCheckDigit(trimmed)) {
    return { valid: false, error: 'That ID number is not valid. Please check and try again.' };
  }

  return { valid: true };
}

/**
 * Truncates a (already validated) full ID number to the last 4 digits — the only form that
 * should ever be sent to the backend. Callers must validate with {@link validateSaIdNumber}
 * before calling this, and must never transmit the return value of anything but this function.
 */
export function truncateSaIdNumber(idNumber: string): string {
  return idNumber.trim().slice(-4);
}
