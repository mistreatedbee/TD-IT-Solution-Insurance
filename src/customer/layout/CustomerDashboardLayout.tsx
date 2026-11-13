import { LogOut } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { TdBackdrop, TdButton, TdGlassCard, TdNavBar, type TdNavLinkRenderProps } from '../../components/td';
import { TD_FOCUS, cx } from '../../components/td/cx';
import { LoadingState } from '../../dashboard/components/ui';
import { useCustomerAuth } from '../auth/CustomerAuthProvider';
import { AuthAlert, AuthLink } from '../components/MarketingAuthShell';

export function CustomerDashboardGate() {
  const auth = useCustomerAuth();
  const location = useLocation();

  if (auth.status === 'hydrating') {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <LoadingState />
      </div>
    );
  }

  if (auth.status === 'wrong-role') {
    return (
      <TdBackdrop className="flex min-h-full items-center justify-center p-6 font-td-sans">
        <TdGlassCard variant="solid" className="w-full max-w-md">
          <AuthAlert tone="warning">
            This area is for customer accounts. Admin and security partner staff should use their
            dedicated portals.
          </AuthAlert>
          <div className="body-sm mt-td-4 flex flex-col gap-td-2">
            <AuthLink to="/admin/login">Admin portal</AuthLink>
            <AuthLink to="/security/login">Security partner portal</AuthLink>
            <TdButton variant="secondary" className="mt-td-2 self-start" onClick={() => void auth.signOut()}>
              Sign out
            </TdButton>
          </div>
        </TdGlassCard>
      </TdBackdrop>
    );
  }

  if (auth.status !== 'signed-in') {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  return <Outlet />;
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/plan', label: 'Change plan' },
  { href: '/dashboard/map', label: 'Map' },
  { href: '/dashboard/alerts', label: 'Alerts' },
  { href: '/dashboard/verification', label: 'Verification' },
  { href: '/get-started', label: 'Add coverage' },
  { href: '/dashboard/profile', label: 'Profile' },
  { href: '/dashboard/notifications', label: 'Notifications' },
  { href: '/dashboard/account', label: 'Account' },
];

/** react-router Link for TdNavBar so dashboard navigation stays in-SPA. */
function renderRouterLink({ href, ...rest }: TdNavLinkRenderProps) {
  return <Link to={href} {...rest} />;
}

/**
 * Customer dashboard shell (Design System R5.2). The page ground is TdBackdrop with no pattern
 * (rings are reserved for map/tracking screens), mounted at the layout root so it follows
 * html[data-theme]. The brand strip and the nav are separate glass surfaces on the ground, so
 * no glass is nested and no text sits on a glow. Child pages keep the same main padding the
 * previous shell had, so their own canvases still align.
 */
export function CustomerDashboardLayout() {
  const auth = useCustomerAuth();
  const location = useLocation();

  return (
    <TdBackdrop className="min-h-full font-td-sans">
      <header className="mx-auto flex w-full max-w-[1120px] flex-col gap-td-4 px-td-4 pt-td-4 sm:px-td-6">
        <TdGlassCard hero className="flex flex-wrap items-center justify-between gap-td-4 !p-td-4">
          <Link
            to="/dashboard"
            className={cx('flex min-w-0 items-center gap-td-3 rounded-td-md no-underline', TD_FOCUS)}
            aria-label="TD IT Solution Insurance — customer dashboard"
          >
            <img src="/images/design/logo-mark.svg" alt="" aria-hidden="true" className="h-9 w-9 flex-none [[data-theme=night]_&]:hidden" />
            <img src="/images/design/logo-mark-on-dark.svg" alt="" aria-hidden="true" className="hidden h-9 w-9 flex-none [[data-theme=night]_&]:block" />
            <span className="min-w-0">
              <h1 className="display-md m-0 text-td-ink">Customer dashboard</h1>
              {auth.account ? <span className="body-sm block truncate text-td-ink-muted">{auth.account.email}</span> : null}
            </span>
          </Link>
          <TdButton variant="glass" icon={<LogOut />} onClick={() => void auth.signOut()}>
            Log out
          </TdButton>
        </TdGlassCard>
        <TdNavBar
          items={NAV_ITEMS}
          currentHref={location.pathname}
          label="Customer dashboard"
          renderLink={renderRouterLink}
        />
      </header>
      <main className="mx-auto w-full max-w-[1120px] p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </TdBackdrop>
  );
}
