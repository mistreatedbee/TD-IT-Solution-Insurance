import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Badge, Button, SectionHeading } from '../components';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { loadSignupEmail } from '../onboarding/onboardingStorage';

interface EmailVerifiedLocationState {
  email?: string;
}

/**
 * SR-006-2 (backend/docs/features/006-customer-onboarding/security-review.md):
 * `POST /auth/notify-email-verified` no longer returns anything that
 * distinguishes "already verified" from "not yet verified" or "no such
 * account" — so this page can no longer assert any of those as fact. It is
 * reached only as a fallback after a verification link failed to complete,
 * so the honest, safe message is "try signing in; verify again if that
 * doesn't work" rather than a confident "your email is confirmed."
 */
export function CustomerEmailVerifiedPage() {
  const location = useLocation();
  const [params] = useSearchParams();
  const state = (location.state ?? {}) as EmailVerifiedLocationState;
  const email = state.email ?? params.get('email') ?? loadSignupEmail() ?? '';

  return (
    <MarketingAuthShell>
      <Badge tone="emerald">Almost there</Badge>
      <SectionHeading
        as="h1"
        title="You can try signing in now"
        size="md"
        className="mt-4 mb-2"
        subtitle={
          email
            ? `If ${email} is already verified, sign in below. If not, check your inbox for a verification link, or request a new one.`
            : 'If your email is already verified, sign in below. If not, check your inbox for a verification link, or request a new one.'
        }
      />
      <p className="mt-4 text-sm text-text-secondary">
        Still stuck? Contact support and we can check your account.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/login?redirect=%2Fdashboard" className="flex-1">
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
