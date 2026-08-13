import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Badge, Button, SectionHeading } from '../components';
import { InlineAlert } from '../dashboard/components/ui';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { handleAlreadyVerifiedEmail } from '../customer/supabase/auth';
import { loadNotifyVerifiedResult, loadSignupEmail } from '../onboarding/onboardingStorage';

interface EmailVerifiedLocationState {
  email?: string;
  confirmationEmailSent?: boolean;
}

export function CustomerEmailVerifiedPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const state = (location.state ?? {}) as EmailVerifiedLocationState;
  const [confirmationEmailSent, setConfirmationEmailSent] = useState(state.confirmationEmailSent ?? false);
  const [loading, setLoading] = useState(!state.confirmationEmailSent);

  const email = state.email ?? params.get('email') ?? loadSignupEmail() ?? '';
  const cached = email ? loadNotifyVerifiedResult(email) : null;

  useEffect(() => {
    if (!email) {
      setLoading(false);
      return;
    }

    if (state.confirmationEmailSent || cached?.status === 'already_verified') {
      setConfirmationEmailSent(cached?.confirmationEmailSent ?? state.confirmationEmailSent ?? false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    void handleAlreadyVerifiedEmail(email)
      .then((result) => {
        if (!cancelled && result.status === 'already_verified') {
          setConfirmationEmailSent(result.confirmationEmailSent);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cached?.confirmationEmailSent, cached?.status, email, state.confirmationEmailSent]);

  return (
    <MarketingAuthShell>
      <Badge tone="emerald">Email verified</Badge>
      <SectionHeading
        as="h1"
        title="Your email is already verified"
        size="md"
        className="mt-4 mb-2"
        subtitle={
          email
            ? `The address ${email} is confirmed. Sign in to continue.`
            : 'This email address is confirmed. Sign in to continue.'
        }
      />
      {loading ? (
        <p className="text-sm text-text-secondary">Sending confirmation email…</p>
      ) : confirmationEmailSent ? (
        <div className="mt-4">
          <InlineAlert tone="info">
            We sent a confirmation email to your inbox for your records.
          </InlineAlert>
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">
          You can sign in below. If you need another copy in your inbox, contact support.
        </p>
      )}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/login" className="flex-1">
          <Button variant="primary" fullWidth>
            Sign in
          </Button>
        </Link>
        <Link to="/get-started" className="flex-1">
          <Button variant="secondary" fullWidth>
            Back to sign up
          </Button>
        </Link>
      </div>
    </MarketingAuthShell>
  );
}
