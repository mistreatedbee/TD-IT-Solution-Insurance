import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { TdButton } from '../components/td';
import { TD_FOCUS } from '../components/td/cx';
import { AuthEyebrow, MarketingAuthShell } from '../customer/components/MarketingAuthShell';
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
      <AuthEyebrow>Almost there</AuthEyebrow>
      <h1 className="display-md mb-td-2 text-td-ink">You can try signing in now</h1>
      <p className="body text-td-ink-muted">
        {email
          ? `If ${email} is already verified, sign in below. If not, check your inbox for a verification link, or request a new one.`
          : 'If your email is already verified, sign in below. If not, check your inbox for a verification link, or request a new one.'}
      </p>
      <p className="body mt-td-4 text-td-ink-muted">
        Still stuck? Contact support and we can check your account.
      </p>
      <div className="mt-td-8 flex flex-col gap-td-3 sm:flex-row">
        <Link to="/login?redirect=%2Fdashboard" className={`flex-1 rounded-td-pill ${TD_FOCUS}`}>
          <TdButton variant="primary" className="w-full" tabIndex={-1}>
            Sign in
          </TdButton>
        </Link>
        <Link to="/get-started" className={`flex-1 rounded-td-pill ${TD_FOCUS}`}>
          <TdButton variant="secondary" className="w-full" tabIndex={-1}>
            Sign up instead
          </TdButton>
        </Link>
      </div>
    </MarketingAuthShell>
  );
}
