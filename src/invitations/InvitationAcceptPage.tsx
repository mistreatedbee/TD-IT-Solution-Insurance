/**
 * Feature 017 D-1 — `/invitations/accept?token=…` (public, unauthenticated).
 *
 * Built against `docs/features/017-privileged-account-self-service/
 * ui-design.md`. One `Card` shell, four sequential local-state steps — see
 * that doc's §1 for the full structure diagram. No client-side routing
 * between steps; this file owns its own state machine end to end.
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Input, SectionHeading } from '../components';
import { InlineAlert, DetailGrid } from '../dashboard/components/ui';
import { mapUserFacingError } from '../lib/user-facing-errors';
import { decodeJwtPayload } from '../lib/jwt';
import { ApiError } from '../dashboard/api/errors';
import { PRIVILEGED_DASHBOARD_CONFIG, clearOtherRoleSessions, isPrivilegedUserType } from '../dashboard/auth/roleRouting';
import { acceptInvitation, getInvitation, type InvitationPublic } from '../api/invitations';
import { MfaEnrollmentStep } from './MfaEnrollmentStep';

type Step =
  | 'loading'
  | 'landing'
  | 'password'
  | 'mfa'
  | 'success'
  | 'error';

type TerminalKind = 'invitation' | 'enrollment';

const ROLE_LABELS: Record<InvitationPublic['userType'], string> = {
  admin: 'Admin',
  security_company_operator: 'Security Partner Operator',
  support_agent: 'Call Centre Agent',
};

/**
 * Where the (role-known) "Return to sign-in" CTA on an abandoned-enrollment
 * terminal state should point — ui-design.md §3.3.3. Falls back to a
 * neutral privileged-login landing when the role isn't known (shouldn't
 * happen in practice — `userType` is set as soon as Step 1 succeeds — but
 * this keeps the button from ever navigating nowhere).
 */
function loginPathFor(userType: string | null): string {
  if (userType && isPrivilegedUserType(userType)) {
    return `${PRIVILEGED_DASHBOARD_CONFIG[userType].homePath}/login`;
  }
  return '/admin/login';
}

export function InvitationAcceptPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('loading');
  const [invitation, setInvitation] = useState<InvitationPublic | null>(null);
  const [terminalError, setTerminalError] = useState<{ message: string; kind: TerminalKind } | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [enrollmentTicket, setEnrollmentTicket] = useState<string | null>(null);

  // ---------------------------------------------------------------
  // Step 1 — token validation, on mount.
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!token) {
      setTerminalError({ message: mapUserFacingError(new ApiError(404, { error: { code: 'INVITATION_INVALID' } }), { context: 'invitation' }), kind: 'invitation' });
      setStep('error');
      return;
    }
    let cancelled = false;
    getInvitation(token)
      .then((invite) => {
        if (cancelled) return;
        setInvitation(invite);
        setStep('landing');
      })
      .catch((err) => {
        if (cancelled) return;
        setTerminalError({ message: mapUserFacingError(err, { context: 'invitation' }), kind: 'invitation' });
        setStep('error');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ---------------------------------------------------------------
  // Step 2 — set password.
  // ---------------------------------------------------------------
  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setConfirmError(null);
    setFormError(null);

    if (password !== confirmPassword) {
      setConfirmError("Passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      const result = await acceptInvitation(token, password);
      setEnrollmentTicket(result.enrollmentTicket);
      setPassword('');
      setConfirmPassword('');
      setStep('mfa');
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'INVITATION_INVALID' || err.code === 'INVITATION_EXPIRED')) {
        setTerminalError({ message: mapUserFacingError(err, { context: 'invitation' }), kind: 'invitation' });
        setStep('error');
        return;
      }
      // UPSTREAM_UNAVAILABLE and VALIDATION_ERROR both re-render this step;
      // only UPSTREAM_UNAVAILABLE preserves the password fields (transient
      // retry), everything else clears them per ui-design.md §3.
      if (!(err instanceof ApiError) || err.code !== 'UPSTREAM_UNAVAILABLE') {
        setPassword('');
        setConfirmPassword('');
      }
      setFormError(mapUserFacingError(err, { context: 'invitation' }));
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------
  // Step 3 — MFA enrollment verify.
  // ---------------------------------------------------------------
  const onSuccess = useCallback(
    async (tokens: { accessToken: string; refreshToken: string; sessionId: string }) => {
      const claims = decodeJwtPayload<{ user_type?: string }>(tokens.accessToken);
      const userType = claims?.user_type;
      if (userType && isPrivilegedUserType(userType)) {
        const target = PRIVILEGED_DASHBOARD_CONFIG[userType];
        clearOtherRoleSessions(target.storageKey);
        try {
          sessionStorage.setItem(target.storageKey, tokens.refreshToken);
        } catch {
          // Best effort — dedicated login page still works if storage is unavailable.
        }
        setStep('success');
        window.setTimeout(() => navigate(target.homePath, { replace: true }), 800);
        return;
      }
      // Not a recognized privileged type — fail toward a neutral landing
      // rather than guessing a destination.
      setStep('success');
      window.setTimeout(() => navigate('/admin/login', { replace: true }), 800);
    },
    [navigate],
  );

  function onEnrollmentTerminalError(message: string) {
    setTerminalError({ message, kind: 'enrollment' });
    setStep('error');
  }

  const roleLabel = invitation ? ROLE_LABELS[invitation.userType] : null;

  return (
    <div className="flex min-h-full items-center justify-center bg-surface-navy-deep p-4">
      <Card padding="lg" interactive={false} className="w-full max-w-md">
        {step === 'loading' && (
          <>
            <SectionHeading as="h1" title="Accept your invitation" size="md" className="mb-1" />
            <p className="mt-4 text-sm text-text-secondary">Checking your invitation…</p>
          </>
        )}

        {step === 'error' && terminalError && (
          <>
            <SectionHeading
              as="h1"
              title={terminalError.kind === 'invitation' ? "This invitation link isn't valid" : 'This setup session expired'}
              size="md"
              className="mb-1"
            />
            <div className="mt-4">
              <InlineAlert tone="danger">{terminalError.message}</InlineAlert>
            </div>
            {terminalError.kind === 'invitation' ? (
              <p className="mt-3 text-sm text-text-secondary">
                If you were expecting this invitation, contact your administrator to have a new one sent.
              </p>
            ) : (
              <Button
                variant="secondary"
                fullWidth
                className="mt-4"
                onClick={() => navigate(loginPathFor(invitation?.userType ?? null))}
              >
                Return to sign-in
              </Button>
            )}
          </>
        )}

        {step === 'landing' && invitation && roleLabel && (
          <>
            <SectionHeading as="h1" title="Accept your invitation" size="md" className="mb-1" />
            <p className="mt-1 text-sm text-text-secondary">
              You've been invited to join TD IT Solutions Insurance as {roleLabel}.
            </p>
            <div className="mt-4">
              <DetailGrid
                rows={[
                  { label: 'Email', value: invitation.email },
                  { label: 'Role', value: <Badge tone="gold">{roleLabel}</Badge> },
                ]}
              />
            </div>
            <Button variant="primary" fullWidth className="mt-6" onClick={() => setStep('password')}>
              Accept invitation
            </Button>
          </>
        )}

        {step === 'password' && invitation && roleLabel && (
          <>
            <SectionHeading as="h1" title="Step 2 of 3: Set your password" size="md" className="mb-1" />
            <p className="mt-1 text-sm text-text-secondary">
              {invitation.email} · {roleLabel}
            </p>
            {formError && (
              <div className="mt-4">
                <InlineAlert tone="danger">{formError}</InlineAlert>
              </div>
            )}
            <form className="mt-4 space-y-4" onSubmit={onSubmitPassword}>
              <Input
                label="Password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                label="Confirm password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                error={confirmError ?? undefined}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <Button type="submit" fullWidth loading={submitting}>
                Continue
              </Button>
            </form>
          </>
        )}

        {step === 'mfa' && enrollmentTicket && (
          <MfaEnrollmentStep
            enrollmentTicket={enrollmentTicket}
            heading="Step 3 of 3: Set up two-factor authentication"
            onSuccess={(tokens) => void onSuccess(tokens)}
            onTerminalError={onEnrollmentTerminalError}
          />
        )}

        {step === 'success' && (
          <>
            <SectionHeading as="h1" title="You're all set" size="md" className="mb-1" />
            <p className="mt-4 text-sm text-text-secondary">
              Two-factor authentication is enabled. Taking you to your dashboard…
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
