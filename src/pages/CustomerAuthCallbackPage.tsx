import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, SectionHeading } from '../components';
import { InlineAlert } from '../dashboard/components/ui';
import { useCustomerAuth } from '../customer/auth/CustomerAuthProvider';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { exchangeSupabaseSession, mapSupabaseAuthError } from '../customer/supabase/auth';
import { getSupabase } from '../customer/supabase/client';
import { ApiError } from '../customer/api/errors';

type CallbackState = 'working' | 'verified' | 'error';

export function CustomerAuthCallbackPage() {
  const navigate = useNavigate();
  const auth = useCustomerAuth();
  const [params] = useSearchParams();
  const [state, setState] = useState<CallbackState>('working');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function completeWithSession(accessToken: string) {
      const tokens = await exchangeSupabaseSession(accessToken);
      await auth.signInWithTokens(tokens.accessToken, tokens.refreshToken);
      if (!cancelled) {
        setState('verified');
        navigate('/get-started', { replace: true });
      }
    }

    async function run() {
      try {
        const callbackType = params.get('type');
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const hashType = hashParams.get('type');

        if (callbackType === 'recovery' || hashType === 'recovery') {
          navigate('/reset-password', { replace: true });
          return;
        }

        const code = params.get('code');
        if (code) {
          const { data, error: exchangeError } = await getSupabase().auth.exchangeCodeForSession(code);
          if (exchangeError || !data.session?.access_token) {
            throw exchangeError ?? new Error('Could not complete sign-in from email link.');
          }
          await completeWithSession(data.session.access_token);
          return;
        }

        const { data, error: sessionError } = await getSupabase().auth.getSession();
        if (sessionError) throw sessionError;
        if (data.session?.access_token) {
          await completeWithSession(data.session.access_token);
          return;
        }

        throw new Error('This link is invalid or has expired.');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'ACCOUNT_NOT_ACTIVE') {
          setError('Email verified in Supabase — log in once your account is active.');
        } else {
          setError(mapSupabaseAuthError(err instanceof Error ? err : { message: 'Verification failed.' }));
        }
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
          <Link to="/signup" className="flex-1">
            <Button variant="secondary" fullWidth>
              Sign up again
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
