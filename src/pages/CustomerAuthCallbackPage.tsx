import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, SectionHeading } from '../components';
import { InlineAlert } from '../dashboard/components/ui';
import { useCustomerAuth } from '../customer/auth/CustomerAuthProvider';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import {
  exchangeSupabaseSession,
  handleAlreadyVerifiedEmail,
  isVerificationLinkError,
  mapAuthCallbackError,
  verifySupabaseEmailLink,
} from '../customer/supabase/auth';
import { getSupabase } from '../customer/supabase/client';
import { ApiError } from '../customer/api/errors';
import { loadSignupEmail } from '../onboarding/onboardingStorage';

type CallbackState = 'working' | 'verified' | 'error';

export function CustomerAuthCallbackPage() {
  const navigate = useNavigate();
  const auth = useCustomerAuth();
  const [params] = useSearchParams();
  const [state, setState] = useState<CallbackState>('working');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // SR-006-2: notify-email-verified now returns an identical response
    // regardless of account state, so this can no longer tell us whether the
    // email was actually already verified — it can only fire the backend's
    // best-effort sync/notify side effect. Every caller of this helper
    // reaches it only after independent evidence the link failed for
    // reasons consistent with "already verified" (a Supabase verify error,
    // or our own exchange saying ACCOUNT_NOT_ACTIVE for a token Supabase did
    // recognise) — so it always proceeds to the reassurance page, which is
    // now honest about not asserting a fact it cannot confirm.
    async function redirectAlreadyVerified(email: string): Promise<true> {
      try {
        await handleAlreadyVerifiedEmail(email);
      } catch {
        /* best-effort — never block the redirect on this */
      }
      if (!cancelled) {
        navigate('/auth/email-verified', { replace: true, state: { email } });
      }
      return true;
    }

    async function completeWithSession(accessToken: string) {
      try {
        const result = await exchangeSupabaseSession(accessToken);
        if (result.kind === 'mfa' || result.kind === 'enrollment') {
          // An MFA-enrolled (or forced-re-enrollment) account cannot
          // complete sign-in from this token-only callback page — there is
          // no code-entry form here. Send them to the normal login page,
          // which fully supports both branches (SR-006-1).
          if (!cancelled) {
            navigate('/login?redirect=%2Fdashboard', { replace: true });
          }
          return;
        }
        await auth.signInWithTokens(result.accessToken, result.refreshToken);
        if (!cancelled) {
          setState('verified');
          navigate('/dashboard', { replace: true });
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_ACTIVE') {
          const email = loadSignupEmail() ?? params.get('email') ?? undefined;
          if (email && (await redirectAlreadyVerified(email))) {
            return;
          }
        }
        throw err;
      }
    }

    async function run() {
      try {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const callbackType = params.get('type') ?? hashParams.get('type');
        const tokenHash = params.get('token_hash') ?? hashParams.get('token_hash');
        const signupEmail =
          params.get('email') ??
          hashParams.get('email') ??
          loadSignupEmail() ??
          undefined;

        if (tokenHash && callbackType) {
          try {
            const session = await verifySupabaseEmailLink(tokenHash, callbackType);
            if (callbackType === 'recovery') {
              navigate('/reset-password', { replace: true });
              return;
            }
            if (!session?.access_token) {
              throw new Error('Email verified but no session was returned.');
            }
            await completeWithSession(session.access_token);
            return;
          } catch (verifyErr) {
            if (
              signupEmail &&
              verifyErr instanceof Error &&
              isVerificationLinkError(verifyErr) &&
              (await redirectAlreadyVerified(signupEmail))
            ) {
              return;
            }
            throw verifyErr;
          }
        }

        if (callbackType === 'recovery') {
          navigate('/reset-password', { replace: true });
          return;
        }

        const hashAccessToken = hashParams.get('access_token');
        if (hashAccessToken) {
          await completeWithSession(hashAccessToken);
          return;
        }

        const code = params.get('code');
        if (code) {
          try {
            const { data, error: exchangeError } = await getSupabase().auth.exchangeCodeForSession(code);
            if (exchangeError || !data.session?.access_token) {
              throw exchangeError ?? new Error('Could not complete sign-in from email link.');
            }
            await completeWithSession(data.session.access_token);
            return;
          } catch (codeErr) {
            if (
              signupEmail &&
              codeErr instanceof Error &&
              isVerificationLinkError(codeErr) &&
              (await redirectAlreadyVerified(signupEmail))
            ) {
              return;
            }
            throw codeErr;
          }
        }

        const { data, error: sessionError } = await getSupabase().auth.getSession();
        if (sessionError) throw sessionError;
        if (data.session?.access_token) {
          await completeWithSession(data.session.access_token);
          return;
        }

        if (signupEmail && (await redirectAlreadyVerified(signupEmail))) {
          return;
        }

        throw new Error('This link is invalid or has expired.');
      } catch (err) {
        if (cancelled) return;
        setError(mapAuthCallbackError(err));
        setState('error');
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [auth, navigate, params]);

  if (state === 'error') {
    return (
      <MarketingAuthShell>
        <InlineAlert tone="danger">{error ?? 'Verification failed.'}</InlineAlert>
        <SectionHeading as="h1" title="Link problem" size="md" className="mt-4 mb-2" />
        <p className="text-sm text-text-secondary">
          Request a new verification email from the sign-up page, or try logging in if you already
          verified.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/get-started" className="flex-1">
            <Button variant="secondary" fullWidth>
              Back to sign up
            </Button>
          </Link>
          <Link to="/login" className="flex-1">
            <Button variant="primary" fullWidth>
              Log in
            </Button>
          </Link>
        </div>
      </MarketingAuthShell>
    );
  }

  return (
    <MarketingAuthShell>
      <Badge tone="gold">Supabase Auth</Badge>
      <SectionHeading as="h1" title="Completing sign-in…" size="md" className="mt-4" />
      <p className="text-sm text-text-secondary">Finishing email verification.</p>
    </MarketingAuthShell>
  );
}
