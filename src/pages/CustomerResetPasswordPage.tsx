import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Input, SectionHeading } from '../components';
import { InlineAlert } from '../dashboard/components/ui';
import { useCustomerAuth } from '../customer/auth/CustomerAuthProvider';
import { MarketingAuthShell } from '../customer/components/MarketingAuthShell';
import { mapSupabaseAuthError, updatePasswordWithSupabase } from '../customer/supabase/auth';
import { getSupabase } from '../customer/supabase/client';

const PASSWORD_MIN_LENGTH = 10;

export function CustomerResetPasswordPage() {
  const navigate = useNavigate();
  const auth = useCustomerAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        setReady(Boolean(data.session));
      })
      .catch(() => setReady(false));
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const result = await updatePasswordWithSupabase(password);
      if (result.kind === 'mfa' || result.kind === 'enrollment') {
        // SR-006-1: the account has (or must enroll) a second factor —
        // the password was changed, but completing sign-in needs the MFA
        // step this page has no UI for. Send the customer to /login, which
        // fully supports both branches.
        navigate('/login?redirect=%2Fdashboard', { replace: true });
        return;
      }
      await auth.signInWithTokens(result.accessToken, result.refreshToken);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(mapSupabaseAuthError(err instanceof Error ? err : { message: 'Could not reset password.' }));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <MarketingAuthShell>
        <SectionHeading as="h1" title="Reset link required" size="md" className="mb-2" />
        <p className="text-sm text-text-secondary">
          Open the password reset link from your email on this device first.
        </p>
        <Link to="/forgot-password" className="mt-6 inline-block">
          <Button variant="primary">Request a new link</Button>
        </Link>
      </MarketingAuthShell>
    );
  }

  return (
    <MarketingAuthShell>
      <SectionHeading as="h1" title="Choose a new password" size="md" className="mb-2" />
      <p className="mb-6 text-sm text-text-secondary">Secured by Supabase Auth.</p>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      <form className="mt-4 space-y-4" onSubmit={onSubmit}>
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          required
        />
        <Input
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <Button type="submit" fullWidth loading={loading}>
          Update password
        </Button>
      </form>
    </MarketingAuthShell>
  );
}
