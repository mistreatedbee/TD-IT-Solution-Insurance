import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { CustomerEmailVerifiedPage } from './CustomerEmailVerifiedPage';

function renderPage(entry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CustomerEmailVerifiedPage />
    </MemoryRouter>,
  );
}

describe('CustomerEmailVerifiedPage (R5.1 smoke)', () => {
  it('renders the reassurance copy with the email from router state and both actions', () => {
    renderPage({ pathname: '/auth/email-verified', state: { email: 'someone@example.com' } });

    expect(screen.getByRole('heading', { name: 'You can try signing in now' })).toBeInTheDocument();
    expect(screen.getByText(/If someone@example.com is already verified/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?redirect=%2Fdashboard');
    expect(screen.getByRole('link', { name: 'Sign up instead' })).toHaveAttribute('href', '/get-started');
  });

  it('falls back to generic copy when no email is known and mounts the design-system ground', () => {
    const { container } = renderPage('/auth/email-verified');

    expect(screen.getByText(/If your email is already verified/)).toBeInTheDocument();
    expect(container.querySelector('[data-td-backdrop="ground"][data-pattern="dots"]')).not.toBeNull();
    expect(container.querySelector('[data-surface="solid"]')).not.toBeNull();
  });
});
