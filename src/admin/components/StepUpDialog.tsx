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
 * Shared design-system-adjacent component. No shared `Modal` primitive
 * exists in `src/components/*` yet (same gap noted in the original
 * `InviteStaffPage` header), so this remains a page-independent but still
 * bespoke fixed-position overlay built from existing primitives
 * (`Card`, `Input`, `Button`, `SectionHeading`) rather than a new overlay
 * primitive. A non-admin consumer now exists (customer web "Locate now") and
 * design-system-manager has approved promotion to `src/components/*`, with
 * conditions. FOLLOW-UP (not done here): the move needs the default
 * challenge/verify calls (`../api/step-up`, admin API) and `InlineAlert`
 * (`src/dashboard/components/ui`) decoupled from this file first, so it is
 * not a trivial `git mv`.
 *
 * 2026-11-25 (Locate now step-up): generalised, backward-compatibly, for its
 * first non-admin consumer - the customer web "Locate now" action, which the
 * backend guards with the customer protection step-up
 * (`assertProtectionStepUp`, ADR-0020 / Feature 021 stage b). New OPTIONAL
 * props only: `title`, `description`, `passwordReauth`, `passwordDescription`.
 * Admin callers pass none of them and keep the exact TOTP-only,
 * no-password-field behaviour above (an admin Tier A action can never be
 * satisfied by a password - P-INV-1). When a caller supplies
 * `passwordReauth`, a customer with no verified TOTP factor (challenge
 * refused with `MFA_NOT_ENROLLED`) is offered a password field instead; if
 * the password route answers `MFA_STEP_UP_REQUIRED` (anti-downgrade) the
 * dialog switches back to the authenticator-code step.
 */
import { FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button, Card, Input, SectionHeading } from '../../components';
import { InlineAlert } from '../../dashboard/components/ui';
import { ApiError } from '../../dashboard/api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { useOtpAutoSubmit } from '../../lib/useOtpAutoSubmit';
import {
  requestStepUpChallenge as defaultRequestStepUpChallenge,
  verifyStepUp as defaultVerifyStepUp,
  type StepUpChallengeResult,
  type StepUpVerifyResult,
} from '../api/step-up';

type StepUpPhase =
  | 'requesting-challenge'
  | 'awaiting-code'
  | 'verifying'
  | 'awaiting-password'
  | 'verifying-password';

/** What `passwordReauth` resolves with (`POST /auth/reauth/password`). */
export interface PasswordReauthResult {
  reauthAt: string;
  reauthExpiresAt: string;
}

export interface StepUpDialogProps {
  onVerified: (result: StepUpVerifyResult | PasswordReauthResult) => void;
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
  /** Dialog heading. Defaults to "Verify your identity". */
  title?: string;
  /** Explanation under the heading for the authenticator-code step. */
  description?: string;
  /**
   * Customer-only password fallback. Omit for every admin action. When set, a
   * `MFA_NOT_ENROLLED` refusal of the challenge shows a password field and
   * submits it here instead.
   */
  passwordReauth?: (password: string) => Promise<PasswordReauthResult>;
  /** Explanation under the heading for the password step. */
  passwordDescription?: string;
}

const DEFAULT_TITLE = 'Verify your identity';
const DEFAULT_DESCRIPTION = 'This action requires a fresh authentication code from your authenticator app.';
const DEFAULT_PASSWORD_DESCRIPTION = 'Enter your account password to continue.';

export function StepUpDialog({
  onVerified,
  onCancel,
  requestChallenge = defaultRequestStepUpChallenge,
  verify = defaultVerifyStepUp,
  submitLabel = 'Verify and continue',
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  passwordReauth,
  passwordDescription = DEFAULT_PASSWORD_DESCRIPTION,
}: StepUpDialogProps) {
  const [password, setPassword] = useState('');
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Move focus into the dialog on open; put it back where it was on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);
  const [phase, setPhase] = useState<StepUpPhase>('requesting-challenge');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [challengeFailed, setChallengeFailed] = useState(false);

  const startChallenge = useCallback(async () => {
    setPhase('requesting-challenge');
    setError(null);
    setExpired(false);
    setChallengeFailed(false);
    try {
      const { stepUpChallengeToken } = await requestChallenge();
      setChallengeToken(stepUpChallengeToken);
      setPhase('awaiting-code');
    } catch (err) {
      if (passwordReauth && err instanceof ApiError && err.code === 'MFA_NOT_ENROLLED') {
        setPhase('awaiting-password');
        return;
      }
      setError(mapUserFacingError(err, { context: 'mfa' }));
      setExpired(true);
      setChallengeFailed(true);
      // Leave the "preparing" phase so the Retry button below is shown.
      setPhase('awaiting-code');
    }
  }, [requestChallenge, passwordReauth]);

  useEffect(() => {
    void startChallenge();
    // Intentionally run once per mount — a fresh dialog instance always
    // starts a fresh challenge. `startChallenge` identity changes only if
    // the caller passes a differently-identitied `requestChallenge`, which
    // would otherwise re-trigger this unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verifyCode(value: string) {
    if (!challengeToken) return;
    setError(null);
    setPhase('verifying');
    try {
      const result = await verify(challengeToken, value.trim());
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

  const { onCodeChange, submitCode } = useOtpAutoSubmit({
    value: code,
    setValue: setCode,
    submit: verifyCode,
  });

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    if (!passwordReauth || !password) return;
    setError(null);
    setPhase('verifying-password');
    try {
      const result = await passwordReauth(password);
      setPassword(''); // S-6: never keep the password in state once it has been used.
      onVerified(result);
    } catch (err) {
      setPassword('');
      if (err instanceof ApiError && err.code === 'MFA_STEP_UP_REQUIRED') {
        // Anti-downgrade: this account has an authenticator app, so use it instead.
        setAttemptsRemaining(null);
        void startChallenge();
        return;
      }
      if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        const details = err.details as { attemptsRemaining?: number } | undefined;
        setAttemptsRemaining(typeof details?.attemptsRemaining === 'number' ? details.attemptsRemaining : null);
        setError('That password is not right.');
      } else {
        setAttemptsRemaining(null);
        setError(mapUserFacingError(err));
      }
      setPhase('awaiting-password');
    }
  }

  const passwordStep = phase === 'awaiting-password' || phase === 'verifying-password';

  function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    void submitCode(code);
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <Card padding="lg" interactive={false} className="w-full max-w-sm">
        <div id={titleId}>
          <SectionHeading as="h2" title={title} size="md" className="mb-1" />
        </div>
        <p className="mb-4 text-sm text-td-ink-muted">{passwordStep ? passwordDescription : description}</p>

        {error ? (
          <div className="mb-4">
            <InlineAlert tone="danger">
              {error}
              {attemptsRemaining != null ? ` (${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining)` : ''}
            </InlineAlert>
          </div>
        ) : null}

        {passwordStep ? (
          <form className="space-y-4" onSubmit={(e) => void onSubmitPassword(e)}>
            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={phase === 'verifying-password'}
            />
            <Button type="submit" fullWidth loading={phase === 'verifying-password'}>
              {submitLabel}
            </Button>
          </form>
        ) : phase === 'requesting-challenge' ? (
          <p className="text-sm text-td-ink-muted">Preparing verification…</p>
        ) : expired ? (
          <Button fullWidth onClick={() => void startChallenge()}>
            {challengeFailed ? 'Retry' : 'Get a new code prompt'}
          </Button>
        ) : (
          <form className="space-y-4" onSubmit={onSubmitCode}>
            <Input
              label="6-digit code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => onCodeChange(e.target.value)}
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
