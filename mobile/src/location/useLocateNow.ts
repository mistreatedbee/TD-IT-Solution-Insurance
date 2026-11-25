/**
 * "Locate now" - the requesting side (owner-test, FEATURE_REMOTE_LOCATE_ENABLED). Asks the
 * account's bound phone for one fresh fix and polls the request's status (never coordinates).
 * When it is answered, `onAnswered` refreshes the normal location reads the screen already uses.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/errors';
import { getLatestLocateRequest, requestLocate, type LocateRequest } from '../api/locate-requests';

export const LOCATE_POLL_INTERVAL_MS = 4000;

export type LocateNowState =
  | { kind: 'idle' }
  | { kind: 'asking' }
  | { kind: 'answered'; at: string | null }
  | { kind: 'no_answer' }
  | { kind: 'consent_required' }
  | { kind: 'error'; message: string };

export const LOCATE_NOW_COPY = {
  asking: 'Asking your phone…',
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

  const locate = useCallback(async () => {
    if (!assetId) return;
    setOpenUntilMs(null);
    setState({ kind: 'asking' });
    try {
      const req = await requestLocate(assetId);
      const next = toState(req);
      setState(next);
      if (next.kind === 'asking') setOpenUntilMs(new Date(req.expiresAt).getTime());
    } catch (err) {
      const rateLimited = err instanceof ApiError && err.status === 429;
      setState({ kind: 'error', message: rateLimited ? LOCATE_NOW_COPY.rate_limited : LOCATE_NOW_COPY.failed });
    }
  }, [assetId]);

  return { state, locate };
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
    case 'error':
      return state.message;
    default:
      return null;
  }
}
