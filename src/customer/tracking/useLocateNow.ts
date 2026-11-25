/**
 * "Locate now" - the requesting side on web (owner-test, VITE_FEATURE_REMOTE_LOCATE). Same logic as
 * mobile/src/location/useLocateNow.ts. Asks the
 * account's bound phone for one fresh fix and polls the request's status (never coordinates).
 * When it is answered, `onAnswered` refreshes the normal location reads the screen already uses.
 *
 * Step-up: `POST /assets/:id/locate-request` may answer 401 `STEP_UP_REQUIRED` (customer
 * protection step-up, backend `assertProtectionStepUp`). The hook then reports `stepUpOpen`; the
 * screen renders the shared `StepUpDialog` and calls `onStepUpVerified` (one retry) or
 * `onStepUpCancel`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useStepUpRetry } from '../../admin/hooks/useStepUpRetry';
import { ApiError } from '../api/errors';
import { getLatestLocateRequest, requestLocate, type LocateRequest } from '../api/locate-requests';

export const LOCATE_POLL_INTERVAL_MS = 4000;

export type LocateNowState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'answered'; at: string | null }
  | { kind: 'no_answer' }
  | { kind: 'consent_required' }
  /** The server wants the customer protection step-up first; the confirm dialog is open. */
  | { kind: 'confirm_needed' }
  | { kind: 'error'; message: string };

export const LOCATE_NOW_COPY = {
  asking: 'Asking your phone…',
  confirm_needed: "Confirm it's you to locate this device.",
  answered: 'Updated just now.',
  no_answer: "Your phone didn't answer (it may be off or offline).",
  consent_required: 'Location sharing is off on that phone. Turn it on there to use Locate now.',
  rate_limited: 'You have asked a few times already. Try again in a few minutes.',
  failed: 'Could not ask your phone right now. Try again.',
} as const;

function toState(req: LocateRequest): LocateNowState {
  switch (req.status) {
    case 'answered':
      return { kind: 'answered', at: req.locationRecordedAt };
    case 'consent_required':
      return { kind: 'consent_required' };
    case 'expired':
      return { kind: 'no_answer' };
    default:
      return { kind: 'asking' };
  }
}

export function useLocateNow(assetId: string | undefined, onAnswered?: () => void | Promise<unknown>) {
  const [state, setState] = useState<LocateNowState>({ kind: 'idle' });
  /** Set while a request is open: polling runs in the effect below until it resolves. */
  const [openUntilMs, setOpenUntilMs] = useState<number | null>(null);
  const onAnsweredRef = useRef(onAnswered);
  useEffect(() => {
    onAnsweredRef.current = onAnswered;
  }, [onAnswered]);

  useEffect(() => {
    if (!assetId || openUntilMs === null) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void getLatestLocateRequest(assetId).then(
        (req) => {
          if (cancelled) return;
          const next = toState(req);
          if (next.kind === 'asking') {
            if (Date.now() >= openUntilMs) {
              setState({ kind: 'no_answer' });
              setOpenUntilMs(null);
            }
            return;
          }
          setState(next);
          setOpenUntilMs(null);
          if (next.kind === 'answered') void onAnsweredRef.current?.();
        },
        () => {
          if (cancelled || Date.now() < openUntilMs) return;
          setState({ kind: 'no_answer' });
          setOpenUntilMs(null);
        },
      );
    }, LOCATE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [assetId, openUntilMs]);

  const applyRequest = useCallback((req: LocateRequest) => {
    const next = toState(req);
    setState(next);
    if (next.kind === 'asking') setOpenUntilMs(new Date(req.expiresAt).getTime());
  }, []);

  const applyError = useCallback((err: unknown) => {
    const rateLimited = err instanceof ApiError && err.status === 429;
    setState({ kind: 'error', message: rateLimited ? LOCATE_NOW_COPY.rate_limited : LOCATE_NOW_COPY.failed });
  }, []);

  // The backend may require the customer protection step-up (401 STEP_UP_REQUIRED) before it
  // asks the phone. `run` opens the step-up instead of failing; after the customer confirms,
  // `onStepUpVerified` re-sends the same request exactly once. If the server does not require
  // step-up, `run` behaves exactly like calling `requestLocate` directly.
  const { stepUpOpen, run, onStepUpVerified: retryAfterStepUp, onStepUpCancel: cancelStepUp } =
    useStepUpRetry(requestLocate);

  const locate = useCallback(async () => {
    if (!assetId) return;
    setOpenUntilMs(null);
    setState({ kind: 'asking' });
    try {
      const req = await run(assetId);
      if (req === undefined) {
        setState({ kind: 'confirm_needed' });
        return;
      }
      applyRequest(req);
    } catch (err) {
      applyError(err);
    }
  }, [assetId, run, applyRequest, applyError]);

  const onStepUpVerified = useCallback(async () => {
    setState({ kind: 'asking' });
    try {
      const req = await retryAfterStepUp();
      if (req === undefined) {
        setState({ kind: 'idle' });
        return;
      }
      applyRequest(req);
    } catch (err) {
      applyError(err);
    }
  }, [retryAfterStepUp, applyRequest, applyError]);

  const onStepUpCancel = useCallback(() => {
    cancelStepUp();
    setState({ kind: 'idle' });
  }, [cancelStepUp]);

  return { state, locate, stepUpOpen, onStepUpVerified, onStepUpCancel };
}

export function locateNowMessage(state: LocateNowState): string | null {
  switch (state.kind) {
    case 'asking':
      return LOCATE_NOW_COPY.asking;
    case 'answered':
      return LOCATE_NOW_COPY.answered;
    case 'no_answer':
      return LOCATE_NOW_COPY.no_answer;
    case 'consent_required':
      return LOCATE_NOW_COPY.consent_required;
    case 'confirm_needed':
      return LOCATE_NOW_COPY.confirm_needed;
    case 'error':
      return state.message;
    default:
      return null;
  }
}
