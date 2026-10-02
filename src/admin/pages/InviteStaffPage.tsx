/**
 * Feature 017 D-2 — "send invitation" admin UI.
 *
 * Consumes `POST /v1/invitations` (backend/src/routes/invitations.ts), which
 * requires an `Idempotency-Key` header and fresh step-up MFA (ADR-0012).
 *
 * Step-up contract (ADR-0012 §2.4): a `STEP_UP_REQUIRED` (401) response is a
 * recoverable, in-place interstitial, never a logout. This page uses the
 * shared `useStepUpRetry` hook (`src/admin/hooks/useStepUpRetry.ts`) and
 * `StepUpDialog` component (`src/admin/components/StepUpDialog.tsx`) —
 * extracted from this page's original inline implementation per ADR-0012
 * SU-FU-1 so the three other Tier A admin actions can share the same
 * mechanism. The hook catches `STEP_UP_REQUIRED`, opens the dialog, and on
 * successful verify automatically retries the ORIGINAL
 * `POST /invitations` request with the SAME `Idempotency-Key` (the key is
 * part of the retried call's arguments, so the hook replays it unchanged —
 * see `sendInvitationAction` below).
 *
 * Scope (Feature 017 D-2): `userType` is limited to `admin` and
 * `support_agent`. `security_company_operator` is shown as a disabled
 * option with an inline explanation — there is no `partner_organizations`
 * table in this codebase (`partnerOrganizationId` is a bare UUID column
 * with nothing to pick a value from), so a partner-org picker is out of
 * scope here. This is intentionally surfaced, not silently omitted; see
 * docs/organization/adr/0012-step-up-authentication-for-privileged-actions.md
 * §3 for the CTO-flagged follow-up.
 */
import { FormEvent, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, SectionHeading } from '../../components';
import { InlineAlert } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { newIdempotencyKey } from '../../customer/api/idempotency';
import { StepUpDialog } from '../components/StepUpDialog';
import { useStepUpRetry } from '../hooks/useStepUpRetry';
import {
  createInvitation,
  requestStepUpChallenge,
  verifyStepUp,
  type CreateInvitationResult,
  type InvitableUserType,
} from '../api/admin-invitations';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITABLE_USER_TYPES: InvitableUserType[] = ['admin', 'support_agent'];

function userTypeLabel(userType: InvitableUserType): string {
  return userType === 'admin' ? 'Admin' : 'Support agent';
}

export function InviteStaffPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [userType, setUserType] = useState<InvitableUserType>('admin');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // ADR-0012 §2.4: the SAME Idempotency-Key must be reused across the
  // STEP_UP_REQUIRED → challenge → verify → retry cycle. It's part of this
  // action's arguments, so `useStepUpRetry` replays it unchanged on retry —
  // no separate bookkeeping needed here.
  const sendInvitationAction = useCallback(
    (idempotencyKey: string) =>
      createInvitation({ email: email.trim().toLowerCase(), userType }, idempotencyKey),
    [email, userType],
  );
  const { stepUpOpen, run, onStepUpVerified, onStepUpCancel } = useStepUpRetry(sendInvitationAction);

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

  async function submit(invoke: () => Promise<CreateInvitationResult | undefined>, sentTo: string) {
    setSubmitting(true);
    setFormError(null);
    try {
      const result = await invoke();
      if (result === undefined) {
        // STEP_UP_REQUIRED — the hook has opened the dialog; the retry will
        // call `submit` again via `handleStepUpVerified` below.
        return;
      }
      setSuccess(`Invitation sent to ${sentTo}.`);
      setEmail('');
      setUserType('admin');
    } catch (err) {
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
    // step-up retry reuses the key captured by `useStepUpRetry` instead of
    // calling this.
    const key = newIdempotencyKey();
    const sentTo = email.trim().toLowerCase();
    await submit(() => run(key), sentTo);
  }

  function onStepUpCancelClick() {
    onStepUpCancel();
    setSubmitting(false);
  }

  async function handleStepUpVerified() {
    const sentTo = email.trim().toLowerCase();
    await submit(() => onStepUpVerified(), sentTo);
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

      {stepUpOpen ? (
        <StepUpDialog
          requestChallenge={requestStepUpChallenge}
          verify={verifyStepUp}
          submitLabel="Verify and send"
          onVerified={() => void handleStepUpVerified()}
          onCancel={onStepUpCancelClick}
        />
      ) : null}
    </Card>
  );
}
