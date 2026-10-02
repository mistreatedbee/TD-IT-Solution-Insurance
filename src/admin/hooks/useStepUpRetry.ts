/**
 * ADR-0012 §2.4 — generic "catch STEP_UP_REQUIRED, challenge, verify, retry"
 * hook, extracted from the Feature 017 D-2 reference implementation that
 * used to live page-local in `InviteStaffPage.tsx`.
 *
 * Usage: wrap the exact API call you want step-up protected.
 *
 * ```tsx
 * const { stepUpOpen, run, onStepUpVerified, onStepUpCancel } =
 *   useStepUpRetry(updateAdminAccountState);
 *
 * // first attempt
 * const updated = await run(accountId, body);
 * if (updated === undefined) {
 *   // STEP_UP_REQUIRED — dialog is now open (stepUpOpen === true); do
 *   // nothing else here, the retry happens automatically once the user
 *   // verifies.
 * }
 *
 * // render:
 * {stepUpOpen ? (
 *   <StepUpDialog
 *     onVerified={() => void handleVerified()} // calls onStepUpVerified()
 *     onCancel={onStepUpCancel}
 *   />
 * ) : null}
 * ```
 *
 * Contract (ADR-0012 §2.4 / §3 Tier A):
 * - `run(...args)` calls `action(...args)`. If it fails with
 *   `STEP_UP_REQUIRED`, the exact `args` are retained and `stepUpOpen`
 *   becomes `true`; `run` resolves to `undefined` (any other error is
 *   rethrown — callers must still handle those).
 * - `onStepUpVerified()` re-sends the IDENTICAL request (same args, e.g. the
 *   same `Idempotency-Key` where one is part of the args) exactly once, and
 *   resolves with the retried call's result (or rethrows a fresh failure).
 * - `onStepUpCancel()` clears the pending retry and closes the dialog. It
 *   performs no request and leaves any in-progress form state the caller
 *   holds completely alone — this hook never touches a page's form state,
 *   only the retry bookkeeping for the one protected call.
 * - None of the three admin routes this hook backs (`updateAdminAccountState`,
 *   `reviewCustomerVerification`, `updateAdminPlan`) take an
 *   `Idempotency-Key` — a blocked request never reaches the handler, so a
 *   plain re-send after verification is safe (backend-architect ruling,
 *   ADR-0012 SU-FU-1). `InviteStaffPage`'s invitation call is the one
 *   exception and supplies its `Idempotency-Key` as part of `args`, which
 *   this hook already replays unchanged.
 */
import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../../dashboard/api/errors';

export interface UseStepUpRetryResult<TArgs extends unknown[], TResult> {
  /** Whether the step-up dialog should be rendered. */
  stepUpOpen: boolean;
  /** Call the protected action; opens the dialog in place of throwing on STEP_UP_REQUIRED. */
  run: (...args: TArgs) => Promise<TResult | undefined>;
  /** Call after the step-up dialog reports a successful verify. Retries the original request. */
  onStepUpVerified: () => Promise<TResult | undefined>;
  /** Call when the user cancels the step-up dialog. Performs no request. */
  onStepUpCancel: () => void;
}

export function useStepUpRetry<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): UseStepUpRetryResult<TArgs, TResult> {
  // Keep the latest `action` closure (it may close over page state, e.g.
  // InviteStaffPage's `email`/`userType`) without forcing callers to memoize it.
  const actionRef = useRef(action);
  actionRef.current = action;

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const pendingArgsRef = useRef<TArgs | null>(null);

  const run = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    try {
      const result = await actionRef.current(...args);
      pendingArgsRef.current = null;
      return result;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STEP_UP_REQUIRED') {
        pendingArgsRef.current = args;
        setStepUpOpen(true);
        return undefined;
      }
      throw err;
    }
  }, []);

  const onStepUpCancel = useCallback(() => {
    setStepUpOpen(false);
    pendingArgsRef.current = null;
  }, []);

  const onStepUpVerified = useCallback(async (): Promise<TResult | undefined> => {
    setStepUpOpen(false);
    const args = pendingArgsRef.current;
    if (!args) return undefined;
    pendingArgsRef.current = null;
    return actionRef.current(...args);
  }, []);

  return { stepUpOpen, run, onStepUpVerified, onStepUpCancel };
}
