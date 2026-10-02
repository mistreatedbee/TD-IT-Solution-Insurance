/**
 * ADR-0012 §2.4 — shared step-up MFA interstitial.
 *
 * Extracted from the Feature 017 D-2 reference implementation
 * (`InviteStaffPage.tsx`'s originally page-local `StepUpDialog`) so every
 * Tier A admin action (ADR-0012 §3) renders the identical in-place,
 * predictable, no-password-field challenge — preserving the anti-phishing
 * properties ADR-0012 §2.4 / RR-3 rely on. Pair with `useStepUpRetry` from
 * `src/admin/hooks/useStepUpRetry.ts` for the catch/retry bookkeeping.
 *
 * New shared design-system-adjacent component — per house rules ("new
 * one-off UI components require design-system-manager sign-off"), this is
 * pending that review before merge. No shared `Modal` primitive exists in
 * `src/components/*` yet (same gap noted in the original `InviteStaffPage`
 * header), so this remains a page-independent but still bespoke
 * fixed-position overlay built from existing primitives
 * (`Card`, `Input`, `Button`, `SectionHeading`) rather than a new overlay
 * primitive — flagged to `design-system-manager` as a candidate for
 * promotion to `src/components/*` once a second non-admin consumer exists.
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, SectionHeading } from '../../components';
import { InlineAlert } from '../../dashboard/components/ui';
import { ApiError } from '../../dashboard/api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  requestStepUpChallenge as defaultRequestStepUpChallenge,
  verifyStepUp as defaultVerifyStepUp,
  type StepUpChallengeResult,
  type StepUpVerifyResult,
} from '../api/step-up';

type StepUpPhase = 'requesting-challenge' | 'awaiting-code' | 'verifying';

export interface StepUpDialogProps {
  onVerified: (result: StepUpVerifyResult) => void;
  onCancel: () => void;
  /**
   * Injectable so existing pages (e.g. `InviteStaffPage`) can keep importing
   * the challenge/verify functions through their own API module (and keep
   * their existing test mocks working) while new pages can rely on the
   * defaults, which call `src/admin/api/step-up.ts` directly.
   */
  requestChallenge?: () => Promise<StepUpChallengeResult>;
  verify?: (stepUpChallengeToken: string, code: string) => Promise<StepUpVerifyResult>;
  /** Label on the submit button, e.g. "Verify and send" for the invitation flow. */
  submitLabel?: string;
}

export function StepUpDialog({
  onVerified,
  onCancel,
  requestChallenge = defaultRequestStepUpChallenge,
  verify = defaultVerifyStepUp,
  submitLabel = 'Verify and continue',
}: StepUpDialogProps) {
  const [phase, setPhase] = useState<StepUpPhase>('requesting-challenge');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);

  const startChallenge = useCallback(async () => {
    setPhase('requesting-challenge');
    setError(null);
    setExpired(false);
    try {
      const { stepUpChallengeToken } = await requestChallenge();
      setChallengeToken(stepUpChallengeToken);
      setPhase('awaiting-code');
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'mfa' }));
      setExpired(true);
    }
  }, [requestChallenge]);

  useEffect(() => {
    void startChallenge();
    // Intentionally run once per mount — a fresh dialog instance always
    // starts a fresh challenge. `startChallenge` identity changes only if
    // the caller passes a differently-identitied `requestChallenge`, which
    // would otherwise re-trigger this unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setPhase('verifying');
    try {
      const result = await verify(challengeToken, code.trim());
      onVerified(result);
    } catch (err) {
      setCode('');
      if (err instanceof ApiError && err.code === 'MFA_CHALLENGE_INVALID') {
        const details = err.details as { attemptsRemaining?: number } | undefined;
        setAttemptsRemaining(typeof details?.attemptsRemaining === 'number' ? details.attemptsRemaining : null);
        setError(mapUserFacingError(err, { context: 'mfa' }));
        setPhase('awaiting-code');
        return;
      }
      if (err instanceof ApiError && err.code === 'MFA_CHALLENGE_EXPIRED') {
        setError(mapUserFacingError(err, { context: 'mfa' }));
        setExpired(true);
        setPhase('awaiting-code');
        return;
      }
      setError(mapUserFacingError(err, { context: 'mfa' }));
      setPhase('awaiting-code');
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verify your identity"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <Card padding="lg" interactive={false} className="w-full max-w-sm">
        <SectionHeading as="h2" title="Verify your identity" size="md" className="mb-1" />
        <p className="mb-4 text-sm text-text-secondary">
          This action requires a fresh authentication code from your authenticator app.
        </p>

        {error ? (
          <div className="mb-4">
            <InlineAlert tone="danger">
              {error}
              {attemptsRemaining != null ? ` (${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining)` : ''}
            </InlineAlert>
          </div>
        ) : null}

        {phase === 'requesting-challenge' ? (
          <p className="text-sm text-text-secondary">Preparing verification…</p>
        ) : expired ? (
          <Button fullWidth onClick={() => void startChallenge()}>
            Get a new code prompt
          </Button>
        ) : (
          <form className="space-y-4" onSubmit={onSubmitCode}>
            <Input
              label="6-digit code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={phase === 'verifying'}
            />
            <Button type="submit" fullWidth loading={phase === 'verifying'}>
              {submitLabel}
            </Button>
          </form>
        )}

        <Button variant="tertiary" fullWidth className="mt-3" onClick={onCancel}>
          Cancel
        </Button>
      </Card>
    </div>
  );
}
