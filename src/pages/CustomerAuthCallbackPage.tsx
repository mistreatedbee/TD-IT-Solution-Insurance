import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, SectionHeading } from '../components';
import { InlineAlert } from '../dashboard/components/ui';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import {
  ALLOWED_EMAIL_LINK_TYPES,
  handleAlreadyVerifiedEmail,
  isVerificationLinkError,
  mapAuthCallbackError,
  verifySupabaseEmailLink,
} from '../customer/supabase/auth';
import { getSupabase } from '../customer/supabase/client';
import { loadSignupEmail } from '../onboarding/onboardingStorage';

type CallbackState = 'working' | 'verified' | 'error';

/**
 * Email-link landing page (signup verification and password-recovery links).
 *
 * INC-003 A-13 / A-17 (A-5 threat model §5): this page used to establish a
 * session from ANY URL-borne credential — a raw `#access_token`, a
 * `token_hash` of any OTP type, a PKCE `code`, or whatever GoTrue session
 * happened to be lingering in `localStorage` — and then exchange it for a
 * backend session and land the visitor on `/dashboard`. None of those were
 * tied to anything this browser started, so a link carrying an attacker's
 * token silently signed the victim into the ATTACKER's account (login CSRF).
 * Now:
 *  - the raw `#access_token` branch and the lingering-session branch are gone;
 *  - `type` is allow-listed to `signup` / `recovery` before any SDK call;
 *  - verifying an email NEVER signs anyone in: the GoTrue session verifyOtp
 *    creates is cleared locally and the user is sent to sign in with their
 *    password (`/auth/email-verified` → `/login`);
 *  - credentials are stripped from the address bar / history on entry, so
 *    no exit path (including the error state) leaves them in the URL.
 * A `recovery` link is not redeemed here at all (INC-003 A-24): its
 * token_hash is forwarded to `/reset-password` in router state and verified
 * server-side by the backend, so no browser recovery session is planted.
 */
function scrubCredentialsFromUrl(): void {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  if (!search && !hash) return;
  window.history.replaceState(window.history.state, '', pathname);
}

async function clearBrowserGoTrueSession(): Promise<void> {
  try {
    await getSupabase().auth.signOut({ scope: 'local' });
  } catch {
    /* best-effort — nothing on this page uses the session afterwards */
  }
}

export function CustomerAuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [state, setState] = useState<CallbackState>('working');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // SR-006-2: notify-email-verified now returns an identical response
    // regardless of account state, so this can no longer tell us whether the
    // email was actually already verified — it can only fire the backend's
    // best-effort sync/notify side effect. It then proceeds to the
    // reassurance page, which is honest about not asserting a fact it cannot
    // confirm and routes the user to sign in with their password.
    async function redirectToSignIn(email: string | undefined): Promise<void> {
      if (email) {
        try {
          await handleAlreadyVerifiedEmail(email);
        } catch {
          /* best-effort — never block the redirect on this */
        }
      }
      if (!cancelled) {
        setState('verified');
        navigate('/auth/email-verified', { replace: true, state: email ? { email } : undefined });
      }
    }

    async function run() {
      try {
        // Read once, then scrub — every later exit (success, redirect,
        // error) leaves a credential-free URL behind.
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const callbackType = params.get('type') ?? hashParams.get('type');
        const tokenHash = params.get('token_hash') ?? hashParams.get('token_hash');
        const code = params.get('code');
        const signupEmail =
          params.get('email') ??
          hashParams.get('email') ??
          loadSignupEmail() ??
          undefined;
        scrubCredentialsFromUrl();

        // A-17: only the two link types the product issues on web. A
        // magic-link / invite / email-change / bare `email` link must never
        // reach the SDK from this page.
        if (callbackType !== null && !ALLOWED_EMAIL_LINK_TYPES.has(callbackType)) {
          throw new Error('This link is invalid or has expired.');
        }

        if (tokenHash) {
          if (!callbackType) {
            throw new Error('This link is invalid or has expired.');
          }
          if (callbackType === 'recovery') {
            // INC-003 A-24: do NOT redeem a recovery link in the browser —
            // that planted a browser recovery session, which is what made a
            // forged recovery link a login-CSRF vector (§13.4 residual).
            // Hand the token to /reset-password in router state (never the
            // URL); it submits it to the backend's server-side resetToken
            // verification.
            // INC-003 §15.3: the address must come from the link itself,
            // never the stored signup email (a shared browser could hold
            // someone else's).
            const linkEmail = params.get('email') ?? hashParams.get('email');
            if (!linkEmail) {
              throw new Error('This link is invalid or has expired.');
            }
            navigate('/reset-password', { replace: true, state: { resetToken: tokenHash, email: linkEmail } });
            return;
          }
          try {
            await verifySupabaseEmailLink(tokenHash, callbackType);
          } catch (verifyErr) {
            if (
              signupEmail &&
              verifyErr instanceof Error &&
              isVerificationLinkError(verifyErr)
            ) {
              await redirectToSignIn(signupEmail);
              return;
            }
            throw verifyErr;
          }
          // A-13: verified — but do not sign in on the strength of a link.
          await clearBrowserGoTrueSession();
          await redirectToSignIn(signupEmail);
          return;
        }

        if (callbackType === 'recovery') {
          navigate('/reset-password', { replace: true });
          return;
        }

        if (code) {
          // PKCE: only completes in the browser holding the code verifier.
          // Still verification only — no sign-in (A-13 item 3).
          try {
            const { error: exchangeError } = await getSupabase().auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          } catch (codeErr) {
            if (signupEmail && codeErr instanceof Error && isVerificationLinkError(codeErr)) {
              await redirectToSignIn(signupEmail);
              return;
            }
            throw codeErr;
          }
          await clearBrowserGoTrueSession();
          await redirectToSignIn(signupEmail);
          return;
        }

        if (signupEmail) {
          await redirectToSignIn(signupEmail);
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
  }, [navigate, params]);

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
