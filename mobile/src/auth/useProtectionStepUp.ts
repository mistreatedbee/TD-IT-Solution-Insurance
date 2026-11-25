/**
 * Mobile "catch STEP_UP_REQUIRED, confirm it's you, retry once" hook for customer protection
 * actions (Feature 021 stage (b); server side `assertProtectionStepUp`). Mobile twin of the web
 * admin `src/admin/hooks/useStepUpRetry.ts` contract:
 *  - `run(...args)` calls the action. On `STEP_UP_REQUIRED` it keeps the exact args, opens the
 *    prompt (`stepUpOpen`) and resolves `undefined`. Any other error is rethrown.
 *  - `onStepUpVerified()` re-sends the IDENTICAL request exactly once and resolves with its
 *    result. A second `STEP_UP_REQUIRED` is rethrown, never re-prompted (no loop).
 *  - `onStepUpCancel()` closes the prompt and sends nothing.
 * Render `ProtectionStepUpSheet` with `visible={stepUpOpen}`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/errors';

export function isStepUpRequiredError(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'STEP_UP_REQUIRED';
}

export interface UseProtectionStepUpResult<TArgs extends unknown[], TResult> {
  stepUpOpen: boolean;
  run: (...args: TArgs) => Promise<TResult | undefined>;
  onStepUpVerified: () => Promise<TResult | undefined>;
  onStepUpCancel: () => void;
}

export function useProtectionStepUp<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): UseProtectionStepUpResult<TArgs, TResult> {
  const actionRef = useRef(action);
  useEffect(() => {
    actionRef.current = action;
  }, [action]);
  const pendingArgsRef = useRef<TArgs | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const run = useCallback(async (...args: TArgs): Promise<TResult | undefined> => {
    try {
      const result = await actionRef.current(...args);
      pendingArgsRef.current = null;
      return result;
    } catch (err) {
      if (isStepUpRequiredError(err)) {
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
    pendingArgsRef.current = null;
    if (!args) return undefined;
    return actionRef.current(...args);
  }, []);

  return { stepUpOpen, run, onStepUpVerified, onStepUpCancel };
}
