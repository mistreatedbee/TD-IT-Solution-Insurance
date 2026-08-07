/**
 * Waitlist submission client.
 *
 * STATUS: STUB — NOT WIRED UP.
 *
 * There is no backend endpoint for the landing-page waitlist yet.
 * business-requirements.md Section 8 (Stages 6/7 disposition) explicitly
 * leaves the storage/vendor choice open, and Section 12.3.6 requires a
 * compliance review (POPIA operator agreement + cross-border-transfer
 * basis) of whichever vendor/endpoint is eventually chosen, *before* the
 * form may actually persist data. Neither has happened yet.
 *
 * A `mailto:` fallback was explicitly discouraged (ux-research.md) because
 * it silently fails on most mobile/webmail setups and gives no reliable
 * confirmation. Rather than fake a "you're on the list" success state that
 * implies data was saved somewhere, this function:
 *   1. Logs a console warning so the gap is loudly visible in dev tooling.
 *   2. Throws `WaitlistNotConnectedError` so the calling UI can render an
 *      honest "this isn't connected yet" state instead of a fabricated
 *      success confirmation.
 *
 * TODO(backend-engineer / solution-architect): once a real endpoint or
 * compliant third-party vendor is selected and reviewed, replace the body
 * below with a real network call. The calling contract — an async function
 * that resolves on success and throws on failure — should not need to
 * change, so `WaitlistForm` shouldn't need rework beyond removing this stub.
 */

export interface WaitlistSubmission {
  email: string;
  name?: string;
}

export class WaitlistNotConnectedError extends Error {
  constructor() {
    super('Waitlist backend is not connected yet.');
    this.name = 'WaitlistNotConnectedError';
  }
}

export async function submitToWaitlist(_submission: WaitlistSubmission): Promise<void> {
  // eslint-disable-next-line no-console -- intentional, see file header
  console.warn(
    '[waitlist] submitToWaitlist() is a stub: no backend endpoint exists yet. ' +
      'The submission was NOT saved anywhere. See src/lib/waitlistApi.ts.'
  );
  throw new WaitlistNotConnectedError();
}
