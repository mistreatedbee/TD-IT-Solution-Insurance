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
 * `userType` covers `admin`, `support_agent`, and `security_company_operator`
 * — the last of these re-enabled now that `backend/src/repositories/partner-
 * organizations.ts` provides a real directory to pick a
 * `partnerOrganizationId` from (previously disabled here; see
 * docs/organization/adr/0012-step-up-authentication-for-privileged-actions.md
 * §3 for that history). Selecting "Security company operator" reveals a
 * dropdown of active partner organizations, fetched from
 * `GET /admin/partner-organizations`; a partner org must be selected before
 * the invite can be sent.
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
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
import { listPartnerOrganizations, type AdminPartnerOrganization } from '../api/admin-partner-organizations';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITABLE_USER_TYPES: InvitableUserType[] = ['admin', 'support_agent', 'security_company_operator'];

function userTypeLabel(userType: InvitableUserType): string {
  if (userType === 'admin') return 'Admin';
  if (userType === 'support_agent') return 'Support agent';
  return 'Security company operator';
}

export function InviteStaffPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [userType, setUserType] = useState<InvitableUserType>('admin');
  const [partnerOrganizationId, setPartnerOrganizationId] = useState('');
  const [partnerOrgs, setPartnerOrgs] = useState<AdminPartnerOrganization[]>([]);
  const [partnerOrgsError, setPartnerOrgsError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (userType !== 'security_company_operator' || partnerOrgs.length > 0) return;
    let cancelled = false;
    listPartnerOrganizations()
      .then((res) => {
        if (!cancelled) setPartnerOrgs(res.data.filter((org) => org.status === 'active'));
      })
      .catch((err) => {
        if (!cancelled) setPartnerOrgsError(mapUserFacingError(err, { context: 'admin' }));
      });
    return () => {
      cancelled = true;
    };
  }, [userType, partnerOrgs.length]);

  // ADR-0012 §2.4: the SAME Idempotency-Key must be reused across the
  // STEP_UP_REQUIRED → challenge → verify → retry cycle. It's part of this
  // action's arguments, so `useStepUpRetry` replays it unchanged on retry —
  // no separate bookkeeping needed here.
  const sendInvitationAction = useCallback(
    (idempotencyKey: string) =>
      createInvitation(
        userType === 'security_company_operator'
          ? { email: email.trim().toLowerCase(), userType, partnerOrganizationId }
          : { email: email.trim().toLowerCase(), userType },
        idempotencyKey,
      ),
    [email, userType, partnerOrganizationId],
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
    if (userType === 'security_company_operator' && !partnerOrganizationId) {
      setFormError('Choose a partner organization.');
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
      setPartnerOrganizationId('');
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
        Send an email invitation to a new platform administrator, support agent, or security-company
        operator. They'll set their own password and enroll two-factor authentication when they accept.
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
          </div>
        </fieldset>

        {userType === 'security_company_operator' ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-800" htmlFor="partnerOrganizationId">
              Partner organization
            </label>
            {partnerOrgsError ? (
              <InlineAlert tone="danger">{partnerOrgsError}</InlineAlert>
            ) : (
              <select
                id="partnerOrganizationId"
                name="partnerOrganizationId"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={partnerOrganizationId}
                onChange={(e) => setPartnerOrganizationId(e.target.value)}
              >
                <option value="">Select a partner organization…</option>
                {partnerOrgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

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
