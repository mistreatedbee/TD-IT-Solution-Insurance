import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { TdBackdrop, TdGlassCard } from '../../components/td';
import { TD_FOCUS, cx } from '../../components/td/cx';

/**
 * Shared shell behind login / signup / forgot-password / reset-password /
 * email-verified / auth-callback (and, via OnboardingShell, the wizard).
 *
 * Design System R5.1 (design-system/reference/README.md): the page ground is
 * TdBackdrop with the quiet "dots" pattern reserved for forms; every piece of
 * text sits on a TdGlassCard (glass for the brand strip, solid for the form)
 * so the 4.5:1 rule never depends on what glow is behind it. The ground is the
 * page root, so it follows html[data-theme] (Day/Night) at runtime.
 * Visuals only — no route, prop or behaviour change for any consumer.
 */
export function MarketingAuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <TdBackdrop pattern="dots" className="min-h-screen font-td-sans">
      <header className="mx-auto w-full max-w-[1120px] px-td-4 pt-td-4 sm:px-td-6">
        <TdGlassCard className="flex items-center justify-between gap-td-4 !p-td-3">
          <AuthBrand />
          <Link
            to="/"
            className={cx('body-sm rounded-td-md px-td-2 py-td-1 font-semibold text-td-link no-underline hover:underline', TD_FOCUS)}
          >
            Back to home
          </Link>
        </TdGlassCard>
      </header>
      <main className="mx-auto w-full px-td-4 pb-td-16 pt-td-8 sm:px-td-6">
        <div className={cx('mx-auto w-full', wide ? 'max-w-3xl' : 'max-w-md')}>
          <TdGlassCard variant="solid" hero className="p-td-5 sm:p-td-8">
            {children}
          </TdGlassCard>
        </div>
      </main>
    </TdBackdrop>
  );
}

/** Logo mark (Day/Night swap is pure CSS on html[data-theme]) plus the wordmark in the display face. */
function AuthBrand() {
  return (
    <Link to="/" className={cx('flex items-center gap-td-3 rounded-td-md no-underline', TD_FOCUS)} aria-label="TD IT Solution Insurance — home">
      <img src="/images/design/logo-mark.svg" alt="" aria-hidden="true" className="h-9 w-9 [[data-theme=night]_&]:hidden" />
      <img src="/images/design/logo-mark-on-dark.svg" alt="" aria-hidden="true" className="hidden h-9 w-9 [[data-theme=night]_&]:block" />
      <span className="font-td-display text-[20px] font-semibold leading-[24px] text-td-ink">TD IT Solution Insurance</span>
    </Link>
  );
}

export type AuthAlertTone = 'danger' | 'warning' | 'info';

const ALERT: Record<AuthAlertTone, { tone: string; Icon: LucideIcon }> = {
  // Token pairs documented in design-system/CONTRAST.md: danger on danger-bg,
  // warning on warning-bg, link on info-bg.
  danger: { tone: 'bg-td-danger-bg text-td-danger', Icon: CircleAlert },
  warning: { tone: 'bg-td-warning-bg text-td-warning', Icon: TriangleAlert },
  info: { tone: 'bg-td-info-bg text-td-link', Icon: Info },
};

/**
 * Inline status message for the auth surfaces (icon + sentence, role="alert").
 * Co-located here rather than added to src/components/td — candidate for a
 * shared TdInlineAlert once design-system-manager signs it off.
 */
export function AuthAlert({ tone, children, className }: { tone: AuthAlertTone; children: ReactNode; className?: string }) {
  const { tone: cls, Icon } = ALERT[tone];
  return (
    <div role="alert" className={cx('body-sm flex items-start gap-td-2 rounded-td-md px-td-4 py-td-3', cls, className)}>
      <Icon aria-hidden="true" strokeWidth={1.75} className="mt-px h-4 w-4 flex-none" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Inline text link on a card surface (link on bg-raised / glass-fill pairs). */
export function AuthLink({ to, children, state, className }: { to: string; children: ReactNode; state?: unknown; className?: string }) {
  return (
    <Link to={to} state={state} className={cx('rounded-td-sm font-semibold text-td-link underline-offset-2 hover:underline', TD_FOCUS, className)}>
      {children}
    </Link>
  );
}

/** Small uppercase eyebrow above a heading (sans, never slab). */
export function AuthEyebrow({ children }: { children: ReactNode }) {
  return <p className="body-sm mb-td-2 font-bold uppercase tracking-wide text-td-accent-text">{children}</p>;
}
