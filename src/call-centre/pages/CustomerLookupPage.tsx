import { FormEvent, useState } from 'react';
import { Button, Card, Input, SectionHeading } from '../../components';
import { DetailGrid, InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { lookupCustomerByEmail } from '../api/support-lookup';
import { ApiError } from '../../dashboard/api/errors';
import type { SupportCustomerLookup } from '../api/support-lookup';

export function CustomerLookupPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SupportCustomerLookup | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await lookupCustomerByEmail(email.trim());
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('No customer found for that email.');
      } else {
        setError('Lookup failed. Try again or contact engineering.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Customer lookup" size="md" className="mb-2" />
      <p className="mb-6 text-sm text-text-secondary">
        Search by customer email. Purpose-limited read — every lookup is audit-logged.
      </p>

      <form className="mb-6 flex max-w-xl flex-col gap-3 sm:flex-row" onSubmit={(e) => void onSubmit(e)}>
        <Input
          label="Customer email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="customer@example.com"
          required
          autoComplete="off"
        />
        <Button type="submit" loading={loading}>
          Search
        </Button>
      </form>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? <LoadingState /> : null}

      {result ? (
        <div className="space-y-6">
          <DetailGrid
            rows={[
              { label: 'Email', value: result.email },
              { label: 'Account state', value: result.accountState },
              { label: 'Policies', value: String(result.policyCount) },
              { label: 'Assets', value: String(result.assetCount) },
              { label: 'Open recovery cases', value: String(result.openRecoveryCaseCount) },
            ]}
          />
          {result.assets.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-text-primary">Assets</h2>
              <ul className="space-y-2 text-sm text-text-secondary">
                {result.assets.map((asset) => (
                  <li key={asset.id}>
                    {asset.displayName} · {asset.assetType} · {asset.status}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.recoveryCases.length > 0 ? (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-text-primary">Open recovery cases</h2>
              <ul className="space-y-2 text-sm text-text-secondary">
                {result.recoveryCases.map((c) => (
                  <li key={c.id}>
                    {c.referenceNumber} · {c.status} · {new Date(c.reportedAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
