/**
 * Feature 017 D-2 — "send invitation" admin UI.
 *
 * Consumes `POST /v1/invitations` (backend/src/routes/invitations.ts), which
 * requires an `Idempotency-Key` header and fresh step-up MFA (ADR-0012).
 *
 * Step-up contract (ADR-0012 §2.4): a `STEP_UP_REQUIRED` (401) response is a
 * recoverable, in-place interstitial, never a logout. This page catches it,
 * opens an in-place step-up dialog, challenges, collects a 6-digit TOTP
 * code, verifies, and on success automatically retries the ORIGINAL
 * `POST /invitations` request with the SAME `Idempotency-Key` — see
 * `retryPendingInvitation` below, which is the only place that key is read
 * back out.
 *
 * Scope (Feature 017 D-2): `userType` is limited to `admin` and
 * `support_agent`. `security_company_operator` is shown as a disabled
 * option with an inline explanation — there is no `partner_organizations`
 * table in this codebase (`partnerOrganizationId` is a bare UUID column
 * with nothing to pick a value from), so a partner-org picker is out of
 * scope here. This is intentionally surfaced, not silently omitted; see
 * docs/organization/adr/0012-step-up-authentication-for-privileged-actions.md
 * §3 for the CTO-flagged follow-up.
 *
 * No shared Modal component exists in `src/components/*` today
 * (design-system-manager inventory checked before writing this) — the
 * step-up dialog below is page-local markup (a fixed-position overlay),
 * not a new exported design-system primitive.
 */
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { InlineAlert } from '../../dashboard/components/ui';
import { ApiError } from '../../dashboard/api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { newIdempotencyKey } from '../../customer/api/idempotency';
import {
  createInvitation,
  requestStepUpChallenge,
  verifyStepUp,
  type InvitableUserType,
} from '../api/admin-invitations';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITABLE_USER_TYPES: InvitableUserType[] = ['admin', 'support_agent'];

function userTypeLabel(userType: InvitableUserType): string {
  return userType === 'admin' ? 'Admin' : 'Support agent';
}

type StepUpPhase = 'requesting-challenge' | 'awaiting-code' | 'verifying';

function StepUpDialog({
  onVerified,
  onCancel,
}: {
  onVerified: (result: { mfaVerifiedAt: string }) => void;
  onCancel: () => void;
}) {
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
      const { stepUpChallengeToken } = await requestStepUpChallenge();
      setChallengeToken(stepUpChallengeToken);
      setPhase('awaiting-code');
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'mfa' }));
      setExpired(true);
    }
  }, []);

  useEffect(() => {
    void startChallenge();
  }, [startChallenge]);

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    if (!challengeToken) return;
    setError(null);
    setPhase('verifying');
    try {
      const result = await verifyStepUp(challengeToken, code.trim());
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
          Sending an invitation requires a fresh authentication code from your authenticator app.
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
              Verify and send
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

export function InviteStaffPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [userType, setUserType] = useState<InvitableUserType>('admin');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  // ADR-0012 §2.4: the SAME Idempotency-Key must be reused across the
  // STEP_UP_REQUIRED → challenge → verify → retry cycle. Held in a ref so
  // the retry (fired from a callback, not a fresh submit) reads back
  // exactly what the original submit generated.
  const pendingKeyRef = useRef<string | null>(null);

  function validate(): boolean {
    setEmailError(null);
    setFormError(null);
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setEmailError('Enter a valid email address.');
      return false;
    }
    if (!INVITABLE_USER_TYPES.includes(userType)) {
      setFormError('Choose a valid account type.');
      return false;
    }
    return true;
  }

  async function sendInvitation(idempotencyKey: string) {
    setSubmitting(true);
    setFormError(null);
    const sentTo = email.trim().toLowerCase();
    try {
      await createInvitation({ email: sentTo, userType }, idempotencyKey);
      pendingKeyRef.current = null;
      setSuccess(`Invitation sent to ${sentTo}.`);
      setEmail('');
      setUserType('admin');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STEP_UP_REQUIRED') {
        // Keep the same idempotency key — this is a retry of the same
        // logical request, not a new one.
        setStepUpOpen(true);
        return;
      }
      setFormError(mapUserFacingError(err, { context: 'admin' }));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSuccess(null);
    if (!validate()) return;
    // Fresh logical attempt: mint a new idempotency key. Only the automatic
    // step-up retry reuses `pendingKeyRef.current` instead of calling this.
    const key = newIdempotencyKey();
    pendingKeyRef.current = key;
    await sendInvitation(key);
  }

  function onStepUpCancel() {
    setStepUpOpen(false);
    pendingKeyRef.current = null;
    setSubmitting(false);
  }

  async function onStepUpVerified() {
    setStepUpOpen(false);
    const key = pendingKeyRef.current;
    if (!key) return;
    await sendInvitation(key);
  }

  return (
    <Card padding="lg" className="max-w-xl">
      <SectionHeading as="h1" title="Invite staff" size="md" className="mb-1" />
      <p className="mb-6 text-sm text-text-secondary">
        Send an email invitation to a new platform administrator or support agent. They'll set their own
        password and enroll two-factor authentication when they accept.
      </p>

      {success ? (
        <div className="mb-4">
          <InlineAlert tone="info">{success}</InlineAlert>
        </div>
      ) : null}
      {formError ? (
        <div className="mb-4">
          <InlineAlert tone="danger">{formError}</InlineAlert>
        </div>
      ) : null}

      <form className="space-y-5" onSubmit={(e) => void onSubmit(e)}>
        <Input
          label="Email address"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError ?? undefined}
          autoComplete="email"
          required
        />

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-slate-800">Account type</legend>
          <div className="space-y-2">
            {INVITABLE_USER_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="radio"
                  name="userType"
                  value={type}
                  checked={userType === type}
                  onChange={() => setUserType(type)}
                />
                {userTypeLabel(type)}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-text-secondary opacity-70">
              <input type="radio" name="userType" value="security_company_operator" disabled />
              Security company operator
            </label>
            <p className="pl-6 text-xs text-text-secondary">
              Security-company-operator invitations aren't available yet — this platform has no
              partner-organization data model to attach the invite to (flagged as CTO follow-up work in
              ADR-0012).
            </p>
          </div>
        </fieldset>

        <div className="flex gap-3">
          <Button type="submit" loading={submitting}>
            Send invitation
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/accounts')}>
            Back to accounts
          </Button>
        </div>
      </form>

      {stepUpOpen ? <StepUpDialog onVerified={() => void onStepUpVerified()} onCancel={onStepUpCancel} /> : null}
    </Card>
  );
}
