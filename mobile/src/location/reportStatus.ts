/**
 * In-memory "last location report" status for this phone, so automatic report failures are
 * visible to the user (small, non-blocking status line) instead of only reaching console.warn.
 *
 * Holds no coordinates and no server message text — only timestamps, the API error code and the
 * already-mapped user-facing copy. Not persisted: it describes this app session only.
 */
import { useSyncExternalStore } from 'react';
import { ApiError, NetworkUnavailableError } from '../api/errors';
import { mapUserFacingError } from '../lib/user-facing-errors';

export interface LocationReportFailure {
  at: number;
  code: string | null;
  message: string;
}

export interface LocationReportStatus {
  lastSentAt: number | null;
  lastFailure: LocationReportFailure | null;
}

const EMPTY: LocationReportStatus = { lastSentAt: null, lastFailure: null };
let state: LocationReportStatus = EMPTY;
const listeners = new Set<() => void>();

function emit(next: LocationReportStatus): void {
  state = next;
  listeners.forEach((l) => l());
}

/** A successful report clears any earlier failure. */
export function recordLocationReportSuccess(at: number = Date.now()): void {
  emit({ lastSentAt: at, lastFailure: null });
}

const APP_LOCATION_ERRORS = new Set([
  'LocationPermissionDeniedError',
  'LocationServicesDisabledError',
  'LocationTimeoutError',
]);

/**
 * Only errors whose text this app controls are mapped; anything else (a raw thrown Error could
 * carry request details) gets the generic location-report copy.
 */
function safeMessage(err: unknown): string {
  const known =
    err instanceof ApiError ||
    err instanceof NetworkUnavailableError ||
    (err instanceof Error && APP_LOCATION_ERRORS.has(err.name));
  return mapUserFacingError(known ? err : null, { context: 'location-report' });
}

export function recordLocationReportFailure(err: unknown, at: number = Date.now()): void {
  emit({
    lastSentAt: state.lastSentAt,
    lastFailure: {
      at,
      code: err instanceof ApiError ? err.code : null,
      message: safeMessage(err),
    },
  });
}

export function getLocationReportStatus(): LocationReportStatus {
  return state;
}

export function subscribeLocationReportStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLocationReportStatus(): LocationReportStatus {
  return useSyncExternalStore(subscribeLocationReportStatus, getLocationReportStatus, getLocationReportStatus);
}

/** Test-only. */
export function __resetLocationReportStatusForTests(): void {
  emit(EMPTY);
}
