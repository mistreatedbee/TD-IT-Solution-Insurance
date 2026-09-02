import { FormEvent, useState } from 'react';
import { Button, Card, Input, SectionHeading } from '../../components';
import { DetailGrid, InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { lookupCustomerByEmail, lookupCustomerByPolicyId } from '../api/support-lookup';
import { ApiError } from '../../dashboard/api/errors';
import type { SupportCustomerLookup } from '../api/support-lookup';

type SearchMode = 'email' | 'policyId';

const POLICY_ID_PATTERN = /^[a-f0-9]{24}$/i;

export function CustomerLookupPage() {
  const [searchMode, setSearchMode] = useState<SearchMode>('email');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SupportCustomerLookup | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const trimmed = query.trim();
    if (searchMode === 'policyId' && !POLICY_ID_PATTERN.test(trimmed)) {
      setError('Policy ID must be a 24-character hex MongoDB ObjectId.');
      setLoading(false);
      return;
    }

    try {
      const data =
        searchMode === 'email'
          ? await lookupCustomerByEmail(trimmed)
          : await lookupCustomerByPolicyId(trimmed);
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(
          searchMode === 'email'
            ? 'No customer found for that email.'
            : 'No customer found for that policy ID.',
        );
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
        Search by customer email or policy ID. Purpose-limited read — every lookup is audit-logged.
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={searchMode === 'email' ? 'primary' : 'secondary'}
          onClick={() => {
            setSearchMode('email');
            setQuery('');
            setError(null);
            setResult(null);
          }}
        >
          Email
        </Button>
        <Button
          type="button"
          size="sm"
          variant={searchMode === 'policyId' ? 'primary' : 'secondary'}
          onClick={() => {
            setSearchMode('policyId');
            setQuery('');
            setError(null);
            setResult(null);
          }}
        >
          Policy ID
        </Button>
      </div>

      <form className="mb-6 flex max-w-xl flex-col gap-3 sm:flex-row" onSubmit={(e) => void onSubmit(e)}>
        <Input
          label={searchMode === 'email' ? 'Customer email' : 'Policy ID'}
          type={searchMode === 'email' ? 'email' : 'text'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchMode === 'email' ? 'customer@example.com' : '507f1f77bcf86cd799439011'}
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
              { label: 'Account ID', value: result.accountId },
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
