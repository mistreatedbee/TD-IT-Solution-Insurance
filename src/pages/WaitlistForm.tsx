import { FormEvent, useId, useState } from 'react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { ArrowLink } from '../components/ArrowLink';
import { submitToWaitlist, WaitlistNotConnectedError } from '../lib/waitlistApi';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubmitStatus = 'idle' | 'submitting' | 'unavailable' | 'error';

/**
 * Waitlist lead-capture form (ui-design.md Section 8).
 *
 * Submission is genuinely functional up through client-side validation and
 * the call to `submitToWaitlist`, but there is no backend endpoint yet
 * (see src/lib/waitlistApi.ts). Rather than show ui-design.md's literal
 * "You're on the list" success copy — which would falsely imply the email
 * was actually saved — this form shows an honest "not connected yet"
 * state when submission is attempted. That is a deliberate, documented
 * deviation from the Stage 4 mock copy, made under frontend-engineer's
 * authority to avoid shipping a UI that lies about data being persisted;
 * it is not a reinterpretation of the compliance-mandated POPIA notice
 * copy or field requirements, which are implemented verbatim below.
 */
export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const statusRegionId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailError('Enter your email address.');
      return;
    }
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(undefined);
    setStatus('submitting');

    try {
      await submitToWaitlist({ email: trimmedEmail, name: name.trim() || undefined });
      // Unreachable today (the stub always throws), kept so this form
      // requires no rework once a real endpoint lands.
      setStatus('idle');
    } catch (err) {
      if (err instanceof WaitlistNotConnectedError) {
        setStatus('unavailable');
      } else {
        setStatus('error');
      }
    }
  }

  if (status === 'unavailable') {
    return (
      <div aria-live="polite" id={statusRegionId} className="rounded-2xl border border-slate-200 bg-white p-6 text-left">
        <Badge tone="neutral">Not connected yet</Badge>
        <p className="mt-3 text-base text-text-secondary">
          Thanks for your interest — we're not able to save waitlist entries yet, because this
          form isn't connected to a backend. Nothing you entered was stored. Please check back
          soon, or once it's available, email us at{' '}
          <span className="font-medium">[SUPPORT EMAIL — pending]</span> and we'll add you to the
          list directly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="text-left" aria-describedby={`${statusRegionId}-popia`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="waitlist-email"
          label="Email address"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError}
          autoComplete="email"
        />
        <Input
          label="Full name (optional)"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </div>

      <p id={`${statusRegionId}-popia`} className="mt-4 text-base text-text-secondary">
        We'll only use your email to let you know when TD IT Solution Insurance launches. We
        won't send you marketing, and we won't share your details with anyone else. You can ask us
        to delete them at any time — see our{' '}
        <ArrowLink href="/privacy" size="sm">
          Privacy Policy
        </ArrowLink>
        .
      </p>

      <div className="mt-6">
        <Button type="submit" variant="primary" size="lg" loading={status === 'submitting'}>
          Get Notified
        </Button>
      </div>

      {status === 'error' && (
        <p aria-live="polite" className="mt-4 text-sm text-red-600">
          Something went wrong submitting the form. Try again, or email us directly at{' '}
          [SUPPORT EMAIL — pending] and we'll add you to the list.
        </p>
      )}
    </form>
  );
}
