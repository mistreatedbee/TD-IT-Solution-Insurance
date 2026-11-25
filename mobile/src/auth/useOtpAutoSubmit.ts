/**
 * Auto-submit for 6-digit TOTP code fields (owner request 2026-11-20:
 * "after entering the 6-digit MFA code it should automatically sign in").
 *
 * - `onCodeChange` normalises input to digits only (so pasted "123 456" or
 *   autofilled codes work), caps it at `length`, and submits exactly once
 *   when the value *transitions* to `length` digits.
 * - An in-flight ref blocks double submits (auto + manual button, rapid
 *   paste) and further edits while a verification request is running.
 * - The same failed code is never auto-resubmitted: a new auto-submit only
 *   fires when the value goes from fewer than `length` digits to `length`
 *   again (callers clear the field after a wrong code).
 * - `submitCode` is also what the manual Verify button / form submit uses,
 *   so both paths share the same guard. Nothing about what is sent changes.
 *
 * Mobile twin of `src/lib/useOtpAutoSubmit.ts` (web); keep the two in step.
 *
 * Only for numeric 6-digit TOTP codes — never wire recovery/backup codes
 * (none exist today) to this hook.
 */
import { useCallback, useEffect, useRef } from 'react';

export const OTP_LENGTH = 6;

export function normalizeOtp(raw: string, length: number = OTP_LENGTH): string {
  return raw.replace(/\D/g, '').slice(0, length);
}

export interface UseOtpAutoSubmitOptions {
  value: string;
  setValue: (next: string) => void;
  submit: (code: string) => Promise<void> | void;
  /** When true (e.g. rate-limit cool-down), auto-submit is suppressed. */
  autoSubmitDisabled?: boolean;
  length?: number;
}

export function useOtpAutoSubmit({
  value,
  setValue,
  submit,
  autoSubmitDisabled = false,
  length = OTP_LENGTH,
}: UseOtpAutoSubmitOptions) {
  const inFlightRef = useRef(false);
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  const submitCode = useCallback(async (code: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      await submitRef.current(code);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const onCodeChange = useCallback(
    (raw: string) => {
      if (inFlightRef.current) return;
      const next = normalizeOtp(raw, length);
      const wasComplete = value.length >= length;
      setValue(next);
      if (next.length === length && !wasComplete && !autoSubmitDisabled) {
        void submitCode(next);
      }
    },
    [value, setValue, length, autoSubmitDisabled, submitCode],
  );

  return { onCodeChange, submitCode };
}
