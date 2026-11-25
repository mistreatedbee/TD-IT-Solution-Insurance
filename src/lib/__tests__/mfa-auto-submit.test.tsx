/**
 * Owner request 2026-11-20: the 6-digit MFA code submits itself on the 6th
 * digit. Covers the shared hook plus each web code-entry surface: admin
 * step-up dialog, MFA enrolment step (invitation + login recovery),
 * privileged (admin / security / call-centre) sign-in and customer sign-in.
 * Customer onboarding and password-reset MFA are exercised by their own
 * existing suites, which now rely on auto-submit (no Verify click).
 */
import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeOtp, useOtpAutoSubmit } from '../useOtpAutoSubmit';
import { StepUpDialog } from '../../admin/components/StepUpDialog';
import { MfaEnrollmentStep } from '../../invitations/MfaEnrollmentStep';
import { PrivilegedLoginPage } from '../../dashboard/components/PrivilegedLoginPage';
import { DashboardAuthProvider } from '../../dashboard/auth/DashboardAuthProvider';
import { CustomerLoginPage } from '../../pages/CustomerLoginPage';
import { CustomerAuthProvider } from '../../customer/auth/CustomerAuthProvider';
import { ApiError } from '../../dashboard/api/errors';

const mockEnrollVerify = vi.fn();
vi.mock('../../api/invitations', () => ({
  mfaEnroll: vi.fn(async () => ({ qrCodeSvg: '<svg></svg>', manualEntryKey: 'ABCD', enrollmentId: 'enr-1' })),
  mfaEnrollVerify: (...a: unknown[]) => mockEnrollVerify(...a),
}));

const TOKENS = { accessToken: 'a', refreshToken: 'r', expiresIn: 900, sessionId: 's' };
const invalid = () => new ApiError(401, { error: { code: 'MFA_CHALLENGE_INVALID', message: 'Invalid code' } } as never);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function codeInput(name = 'code'): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!el) throw new Error(`no input ${name}`);
  return el;
}

describe('normalizeOtp', () => {
  it('keeps digits only and caps at 6', () => {
    expect(normalizeOtp(' 123 456 ')).toBe('123456');
    expect(normalizeOtp('12-34-5678')).toBe('123456');
    expect(normalizeOtp('abc')).toBe('');
  });
});

function Harness({ submit, disabled = false }: { submit: (c: string) => Promise<void>; disabled?: boolean }) {
  const [code, setCode] = useState('');
  const { onCodeChange, submitCode } = useOtpAutoSubmit({
    value: code,
    setValue: setCode,
    submit: async (c) => {
      try {
        await submit(c);
      } catch {
        setCode('');
      }
    },
    autoSubmitDisabled: disabled,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submitCode(code);
      }}
    >
      <input name="code" aria-label="code" value={code} onChange={(e) => onCodeChange(e.target.value)} />
      <button type="submit">Verify</button>
    </form>
  );
}

describe('useOtpAutoSubmit', () => {
  it('submits once on the 6th typed digit, not before', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async () => undefined);
    render(<Harness submit={submit} />);
    await user.type(codeInput(), '12345');
    expect(submit).not.toHaveBeenCalled();
    await user.type(codeInput(), '6');
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('123456');
  });

  it('submits a pasted code with a space', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async () => undefined);
    render(<Harness submit={submit} />);
    await user.click(codeInput());
    await user.paste('123 456');
    expect(submit).toHaveBeenCalledWith('123456');
  });

  it('ignores the manual button and further input while a submit is in flight', async () => {
    const user = userEvent.setup();
    const pending = deferred<void>();
    const submit = vi.fn(() => pending.promise);
    render(<Harness submit={submit} />);
    await user.type(codeInput(), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    await user.type(codeInput(), '7');
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve());
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('after a wrong code waits for a new 6th digit', async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockRejectedValueOnce(new Error('bad')).mockResolvedValueOnce(undefined);
    render(<Harness submit={submit} />);
    await user.type(codeInput(), '111111');
    await waitFor(() => expect(codeInput().value).toBe(''));
    await user.type(codeInput(), '22222');
    expect(submit).toHaveBeenCalledTimes(1);
    await user.type(codeInput(), '2');
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenLastCalledWith('222222');
  });

  it('does not auto-submit while disabled (rate-limit cool-down)', async () => {
    const user = userEvent.setup();
    const submit = vi.fn(async () => undefined);
    render(<Harness submit={submit} disabled />);
    await user.type(codeInput(), '123456');
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('StepUpDialog auto-submit', () => {
  it('verifies on the 6th digit, no double submit, then a new code after a wrong one', async () => {
    const user = userEvent.setup();
    const onVerified = vi.fn();
    const first = deferred<never>();
    const verify = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ stepUpToken: 't' });
    render(
      <StepUpDialog
        onVerified={onVerified}
        onCancel={vi.fn()}
        requestChallenge={async () => ({ stepUpChallengeToken: 'chal' }) as never}
        verify={verify}
      />,
    );
    await waitFor(() => codeInput());
    await user.type(codeInput(), '111111');
    expect(verify).toHaveBeenCalledTimes(1);
    // Manual button while verifying is a no-op (input/button disabled + guard).
    await user.click(screen.getByRole('button', { name: /Verify and continue/ }));
    expect(verify).toHaveBeenCalledTimes(1);
    await act(async () => first.reject(invalid()));
    await waitFor(() => expect(codeInput().value).toBe(''));
    await user.click(codeInput());
    await user.paste('222 222');
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenLastCalledWith('chal', '222222');
  });
});

describe('MfaEnrollmentStep auto-submit', () => {
  beforeEach(() => mockEnrollVerify.mockReset());

  it('verifies on the 6th digit, then a new code after a wrong one', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    mockEnrollVerify.mockRejectedValueOnce(invalid()).mockResolvedValueOnce(TOKENS);
    render(<MfaEnrollmentStep enrollmentTicket="ticket" onSuccess={onSuccess} onTerminalError={vi.fn()} />);
    await waitFor(() => codeInput());
    await user.type(codeInput(), '111111');
    await waitFor(() => expect(codeInput().value).toBe(''));
    expect(mockEnrollVerify).toHaveBeenCalledTimes(1);
    await user.type(codeInput(), '22222');
    expect(mockEnrollVerify).toHaveBeenCalledTimes(1);
    await user.type(codeInput(), '2');
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(TOKENS));
    expect(mockEnrollVerify).toHaveBeenLastCalledWith('enr-1', '222222');
  });

  it('does not auto-submit during the rate-limit cool-down', async () => {
    const user = userEvent.setup();
    mockEnrollVerify.mockRejectedValueOnce(
      new ApiError(429, { error: { code: 'RATE_LIMITED', message: 'Slow down' } } as never),
    );
    render(<MfaEnrollmentStep enrollmentTicket="ticket" onSuccess={vi.fn()} onTerminalError={vi.fn()} />);
    await waitFor(() => codeInput());
    await user.type(codeInput(), '111111');
    await waitFor(() => expect(codeInput().value).toBe(''));
    await user.type(codeInput(), '222222');
    expect(mockEnrollVerify).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function stubLoginFetch(userType: string, challengeCalls: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url.endsWith('/session/refresh')) return Promise.reject(new Error('no session'));
      if (url.endsWith('/auth/login') && method === 'POST') {
        return jsonResponse({ mfaRequired: true, mfaChallengeToken: 'chal-1', expiresIn: 300 });
      }
      if (url.endsWith('/auth/mfa/challenge') && method === 'POST') {
        challengeCalls.push(JSON.parse(String(init?.body)).code);
        if (challengeCalls.length === 1) {
          return jsonResponse({ error: { code: 'MFA_CHALLENGE_INVALID', message: 'Invalid code' } }, 401);
        }
        return jsonResponse(TOKENS);
      }
      if (url.endsWith('/account/me')) {
        return jsonResponse({
          id: 'acct-1',
          email: 'x@example.com',
          userType,
          accountState: 'active',
          mfaRequired: true,
          mfaEnrolled: true,
          partnerOrganizationId: null,
        });
      }
      return jsonResponse({});
    }),
  );
}

describe.each([
  {
    name: 'PrivilegedLoginPage (admin / security / call-centre sign-in)',
    userType: 'admin',
    field: 'mfa-code',
    signInButton: 'Sign in',
    home: 'Admin home',
    ui: (
      <MemoryRouter initialEntries={['/admin/login']}>
        <DashboardAuthProvider config={{ storageKey: 'td-admin-refresh-token', allowedUserType: 'admin' }}>
          <Routes>
            <Route path="/admin/login" element={<PrivilegedLoginPage title="Admin sign in" subtitle="" defaultRedirect="/admin" />} />
            <Route path="/admin" element={<div>Admin home</div>} />
          </Routes>
        </DashboardAuthProvider>
      </MemoryRouter>
    ),
  },
  {
    name: 'CustomerLoginPage (customer sign-in)',
    userType: 'customer',
    field: null,
    signInButton: 'Log in',
    home: 'Customer home',
    ui: (
      <MemoryRouter initialEntries={['/login']}>
        <CustomerAuthProvider>
          <Routes>
            <Route path="/login" element={<CustomerLoginPage />} />
            <Route path="/dashboard" element={<div>Customer home</div>} />
          </Routes>
        </CustomerAuthProvider>
      </MemoryRouter>
    ),
  },
])('$name auto-submit', ({ userType, field, signInButton, home, ui }) => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs in on the 6th digit; a wrong code clears and waits for a new one; never double submits', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    stubLoginFetch(userType, calls);
    render(ui);
    const email = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[type="email"]');
      if (!el) throw new Error('no email');
      return el;
    });
    await user.type(email, 'x@example.com');
    await user.type(document.querySelector<HTMLInputElement>('input[type="password"]') as HTMLInputElement, 'password123');
    await user.click(screen.getByRole('button', { name: signInButton }));
    const mfa = () =>
      field ? codeInput(field) : (screen.getByLabelText(/Authentication code/) as HTMLInputElement);
    await waitFor(() => mfa());

    await user.type(mfa(), '111111');
    await waitFor(() => expect(mfa().value).toBe(''));
    expect(calls).toEqual(['111111']);

    await user.click(mfa());
    await user.paste('222 222');
    await waitFor(() => expect(screen.getByText(home)).toBeInTheDocument());
    expect(calls).toEqual(['111111', '222222']);
  });
});
