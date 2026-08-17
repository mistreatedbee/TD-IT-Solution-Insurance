import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, SectionHeading } from '../../components';
import { InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  dismissCustomerAlert,
  listCustomerAlerts,
  type CustomerAlert,
} from '../../customer/api/alerts';

function mapAlertHref(href: string | null): string | undefined {
  if (!href) return undefined;
  if (href.startsWith('/dashboard')) return href;
  if (href === '/account/profile' || href === '/account/verification') {
    return href.replace('/account', '/dashboard');
  }
  if (href.startsWith('/account/')) return `/dashboard${href.slice('/account'.length)}`;
  if (href === '/verification-gate') return '/login';
  if (href.startsWith('/policies')) return '/dashboard';
  if (href.startsWith('/assets')) return '/dashboard';
  if (href === '/recovery') return '/dashboard/map';
  return href;
}

export function CustomerAlertsPage() {
  const [alerts, setAlerts] = useState<CustomerAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const page = await listCustomerAlerts({ limit: 50 });
      setAlerts(page.data);
    } catch (err) {
      setError(mapUserFacingError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function dismiss(alertId: string) {
    setDismissingId(alertId);
    try {
      await dismissCustomerAlert(alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      setError(mapUserFacingError(err));
    } finally {
      setDismissingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading as="h1" title="Alerts" size="md" className="mb-2" />
        <p className="text-sm text-text-secondary">
          Action items and updates for your protection. Critical security alerts cannot be disabled.
        </p>
      </div>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : alerts.length === 0 ? (
        <Card padding="md">
          <p className="font-semibold text-text-primary">All clear</p>
          <p className="mt-1 text-sm text-text-secondary">No alerts need your attention right now.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const href = mapAlertHref(alert.href);
            return (
              <Card key={alert.id} padding="md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge value={alert.severity} />
                    <span className="text-xs uppercase text-text-secondary">{alert.category}</span>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
                    disabled={dismissingId === alert.id}
                    onClick={() => void dismiss(alert.id)}
                  >
                    Dismiss
                  </button>
                </div>
                <p className="mt-2 font-semibold text-text-primary">{alert.title}</p>
                <p className="mt-1 text-sm text-text-secondary">{alert.body}</p>
                {href ? (
                  <Link to={href} className="mt-3 inline-block text-sm font-semibold text-primary hover:underline">
                    View details
                  </Link>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}

      <Link to="/dashboard/notifications" className="text-sm font-semibold text-primary hover:underline">
        Notification preferences
      </Link>
    </div>
  );
}
