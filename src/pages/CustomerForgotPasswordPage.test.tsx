import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerForgotPasswordPage } from './CustomerForgotPasswordPage';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers }));
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <CustomerForgotPasswordPage />
    </MemoryRouter>,
  );
}

// `screen.getByLabelText` relies on jsdom's `HTMLInputElement.labels`, which
// returns an empty NodeList for `required` inputs in this environment (see
// `src/invitations/InvitationAcceptPage.test.tsx`'s note) — target the email
// field directly instead.
function emailInput(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('input[type="email"]');
  if (!el) throw new Error('no input[type="email"] found');
  return el;
}

describe('CustomerForgotPasswordPage (INC-003 F-1)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls the backend reset-password/request endpoint with client: "web", never the Supabase SDK', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      expect(url).toContain('/auth/reset-password/request');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ email: 'staff@example.com', client: 'web' });
      return jsonResponse({ message: 'If this request can be actioned, you will receive an email shortly.' }, 202);
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderPage();
    await user.type(emailInput(), 'staff@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the identical generic-accepted confirmation regardless of whether the account exists (FR-15)', async () => {
    // The backend returns the same 202 body whether or not `findByEmail`
    // matched an account — assert the UI has no branch that could diverge.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ message: 'generic' }, 202)),
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(emailInput(), 'nonexistent@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument());
    // Same confirmation copy regardless of account existence — no branch on
    // a hypothetical "account not found" state exists in this component.
    expect(screen.queryByText(/account not found/i)).not.toBeInTheDocument();
  });

  it('surfaces a real rate-limit failure instead of the generic-accepted state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } }, 429),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(emailInput(), 'staff@example.com');
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));

    await waitFor(() => expect(screen.getByText(/Too many attempts/)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
  });
});
