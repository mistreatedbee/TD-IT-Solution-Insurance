/**
 * Feature 017 — shared MFA enrollment UI (QR code + manual key + code entry).
 *
 * Extracted from `InvitationAcceptPage` (D-1) so the privileged login page's
 * enrollment-recovery path (a fresh `enrollmentTicket` re-issued at login
 * time when a staff account accepted its invitation but never finished
 * enrolling — see `backend/src/routes/auth.ts`'s `mfaRequired && !verifiedFactor`
 * branch) can reuse the exact same enrollment mechanics
 * (`POST /mfa/enroll` + `POST /mfa/enroll/verify`) instead of duplicating
 * this UI or, worse, telling the user to click an invitation link that has
 * already been burned by `POST /invitations/:token/accept`.
 *
 * This component owns only the enrollment step's own state (QR/key load,
 * code entry, verify). It does not know whether it's being rendered inside
 * the invitation-accept flow or the privileged login recovery flow — the
 * caller supplies the ticket and gets called back on success or on a
 * terminal (ticket dead/not found) error.
 */
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Accordion, AccordionItem, Button, Input, SectionHeading } from '../components';
import { InlineAlert } from '../dashboard/components/ui';
import { mapUserFacingError } from '../lib/user-facing-errors';
import { ApiError } from '../dashboard/api/errors';
import { mfaEnroll, mfaEnrollVerify, type MfaEnrollVerifyResult } from '../api/invitations';
import { qrCodeImageSrc } from './qrCodeDataUri';

export function MfaEnrollmentStep({
  enrollmentTicket,
  heading = 'Set up two-factor authentication',
  onSuccess,
  onTerminalError,
}: {
  enrollmentTicket: string;
  /** Callers title this step differently depending on surrounding context
   * (e.g. the invitation flow numbers it "Step 3 of 3"; login-time recovery
   * has no prior steps). */
  heading?: string;
  onSuccess: (tokens: MfaEnrollVerifyResult) => void;
  /**
   * Called when the ticket itself is dead (`ENROLLMENT_TICKET_INVALID` /
   * `MFA_ENROLLMENT_NOT_FOUND`) — a state this component cannot recover
   * from on its own. The caller decides what terminal screen to show
   * (the invitation flow shows its own "setup session expired" screen; the
   * login-recovery flow can just let the user retry logging in, since login
   * re-issues a fresh ticket every time).
   */
  onTerminalError: (message: string) => void;
}) {
  const [enrollment, setEnrollment] = useState<{ qrCodeSvg: string; manualEntryKey: string; enrollmentId: string } | null>(
    null,
  );
  const [mfaLoadError, setMfaLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [coolingDown, setCoolingDown] = useState(false);

  const loadEnrollment = useCallback(async () => {
    setMfaLoadError(null);
    try {
      const result = await mfaEnroll(enrollmentTicket);
      setEnrollment(result);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'ENROLLMENT_TICKET_INVALID' || err.code === 'MFA_ENROLLMENT_NOT_FOUND')) {
        onTerminalError(mapUserFacingError(err, { context: 'mfa' }));
        return;
      }
      // UPSTREAM_UNAVAILABLE and anything unexpected: stay here with a
      // manual retry action rather than failing the whole flow.
      setMfaLoadError(mapUserFacingError(err, { context: 'mfa' }));
    }
  }, [enrollmentTicket, onTerminalError]);

  useEffect(() => {
    void loadEnrollment();
  }, [loadEnrollment]);

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setVerifyError(null);
    setCodeError(null);
    setVerifying(true);
    try {
      const result = await mfaEnrollVerify(enrollment.enrollmentId, code.trim());
      onSuccess(result);
    } catch (err) {
      setCode('');
      if (err instanceof ApiError && (err.code === 'MFA_ENROLLMENT_NOT_FOUND' || err.code === 'ENROLLMENT_TICKET_INVALID')) {
        onTerminalError(mapUserFacingError(err, { context: 'mfa' }));
        return;
      }
      if (err instanceof ApiError && err.code === 'MFA_CHALLENGE_INVALID') {
        setCodeError(mapUserFacingError(err, { context: 'mfa' }));
        return;
      }
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        // ui-design.md §3.3.3: short cool-down, no live countdown (the
        // client can't reliably guarantee `resetSeconds` accuracy).
        setCoolingDown(true);
        window.setTimeout(() => setCoolingDown(false), 5000);
      }
      setVerifyError(mapUserFacingError(err, { context: 'mfa' }));
    } finally {
      setVerifying(false);
    }
  }

  async function copyManualKey() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.manualEntryKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable — the key is already
      // visible and selectable as plain text, so this is a soft failure.
    }
  }

  if (!enrollment) {
    return (
      <>
        <SectionHeading as="h1" title={heading} size="md" className="mb-1" />
        {mfaLoadError ? (
          <>
            <div className="mt-4">
              <InlineAlert tone="danger">{mfaLoadError}</InlineAlert>
            </div>
            <Button variant="secondary" fullWidth className="mt-4" onClick={() => void loadEnrollment()}>
              Try again
            </Button>
          </>
        ) : (
          <p className="mt-4 text-sm text-text-secondary">Setting up…</p>
        )}
      </>
    );
  }

  return (
    <>
      <SectionHeading as="h1" title={heading} size="md" className="mb-1" />
      <p className="mt-1 text-sm text-text-secondary">
        Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, or similar) if you don't
        already have one, then add this account.
      </p>

      <div className="mt-4 rounded-lg border border-border bg-background-alt p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Setup key</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <code className="break-all text-sm font-mono text-text-primary">{enrollment.manualEntryKey}</code>
          <Button variant="tertiary" size="sm" onClick={copyManualKey} aria-live="polite">
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          In your authenticator app, choose "enter a setup key manually" and paste this in.
        </p>
      </div>

      <div className="mt-4">
        <Accordion>
          <AccordionItem value="qr" title="Prefer to scan a QR code instead?">
            {(() => {
              const src = qrCodeImageSrc(enrollment.qrCodeSvg);
              return src ? (
                <div className="flex justify-center">
                  <img
                    alt="QR code for authenticator app setup — use the setup key above if this doesn't load"
                    src={src}
                    width={200}
                    height={200}
                  />
                </div>
              ) : (
                <p className="text-xs text-text-secondary">The QR code couldn't be displayed. Use the setup key above instead.</p>
              );
            })()}
            <p className="mt-2 text-xs text-text-secondary">
              If scanning this device's own screen isn't possible (e.g. you're completing this on your phone), use
              the setup key above instead.
            </p>
          </AccordionItem>
        </Accordion>
      </div>

      {verifyError && (
        <div className="mt-4">
          <InlineAlert tone="danger">{verifyError}</InlineAlert>
        </div>
      )}

      <form className="mt-4 space-y-4" onSubmit={onSubmitCode}>
        <Input
          label="6-digit code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          error={codeError ?? undefined}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" fullWidth loading={verifying} disabled={coolingDown}>
          Verify and finish
        </Button>
      </form>
    </>
  );
}
