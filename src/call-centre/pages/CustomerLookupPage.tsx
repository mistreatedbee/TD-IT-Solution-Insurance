import { FormEvent, useState } from 'react';
import { Button, Card, Input, SectionHeading } from '../../components';
import { DetailGrid, InlineAlert, LoadingState } from '../../dashboard/components/ui';
import {
  addCallCentreCaseNote,
  lookupCustomerByEmail,
  lookupCustomerByPhone,
  lookupCustomerByPolicyId,
  type SupportCustomerPolicy,
} from '../api/support-lookup';
import { ApiError } from '../../dashboard/api/errors';
import type { SupportCustomerLookup } from '../api/support-lookup';
import { formatPlanTierLabel, formatSupportLevel } from '../../lib/plan-catalog-display';

type SearchMode = 'email' | 'policyId' | 'phone';

const POLICY_ID_PATTERN = /^[a-f0-9]{24}$/i;
const PHONE_PATTERN = /^\+?[0-9\s()-]{7,20}$/;

function formatPolicyPrice(policy: SupportCustomerPolicy): string | null {
  if (policy.monthlyAmountCents == null) return null;
  return `R${(policy.monthlyAmountCents / 100).toFixed(0)}/month`;
}

function formatPolicyAssetUsage(policy: SupportCustomerPolicy, totalAssets: number): string {
  if (policy.registeredAssetCount != null && policy.maxAssets != null) {
    return `${policy.registeredAssetCount}/${policy.maxAssets} assets`;
  }
  if (policy.maxAssets != null) {
    return `${totalAssets}/${policy.maxAssets} assets`;
  }
  return `${totalAssets} assets`;
}

function RecoveryCasePanel({
  recoveryCase,
  onNoteAdded,
}: {
  recoveryCase: SupportCustomerLookup['recoveryCases'][number];
  onNoteAdded: (caseId: string, note: SupportCustomerLookup['recoveryCases'][number]['callCentreNotes'][number]) => void;
}) {
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAddNote(event: FormEvent) {
    event.preventDefault();
    const text = noteText.trim();
    if (!text) return;

    setSaving(true);
    setError(null);
    try {
      const data = await addCallCentreCaseNote(recoveryCase.id, text);
      onNoteAdded(recoveryCase.id, data.note);
      setNoteText('');
    } catch {
      setError('Could not save note. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-lg border border-border bg-background p-4">
      <p className="text-sm font-medium text-text-primary">
        {recoveryCase.referenceNumber} · {recoveryCase.status} ·{' '}
        {new Date(recoveryCase.reportedAt).toLocaleString()}
      </p>

      {recoveryCase.callCentreNotes.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-border pt-3 text-sm text-text-secondary">
          {recoveryCase.callCentreNotes.map((note) => (
            <li key={`${note.createdAt}-${note.agentAccountId}`}>
              <span className="block text-xs text-text-secondary">
                {new Date(note.createdAt).toLocaleString()}
              </span>
              {note.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-text-secondary">No call-centre notes yet.</p>
      )}

      <form className="mt-4 space-y-2" onSubmit={(e) => void onAddNote(e)}>
        <Input
          label="Add call-centre note"
          type="textarea"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Customer verified on call — …"
          rows={3}
          required
        />
        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
        <Button type="submit" size="sm" loading={saving}>
          Save note
        </Button>
      </form>
    </li>
  );
}

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
    if (searchMode === 'phone' && !PHONE_PATTERN.test(trimmed)) {
      setError('Enter a valid phone number (7–20 digits, optional + prefix).');
      setLoading(false);
      return;
    }

    try {
      const data =
        searchMode === 'email'
          ? await lookupCustomerByEmail(trimmed)
          : searchMode === 'phone'
            ? await lookupCustomerByPhone(trimmed)
            : await lookupCustomerByPolicyId(trimmed);
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError(
          searchMode === 'email'
            ? 'No customer found for that email.'
            : searchMode === 'phone'
              ? 'No customer found for that phone number.'
              : 'No customer found for that policy ID.',
        );
      } else {
        setError('Lookup failed. Try again or contact engineering.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleNoteAdded(
    caseId: string,
    note: SupportCustomerLookup['recoveryCases'][number]['callCentreNotes'][number],
  ) {
    setResult((current) => {
      if (!current) return current;
      return {
        ...current,
        recoveryCases: current.recoveryCases.map((recoveryCase) =>
          recoveryCase.id === caseId
            ? { ...recoveryCase, callCentreNotes: [...recoveryCase.callCentreNotes, note] }
            : recoveryCase,
        ),
      };
    });
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="Customer lookup" size="md" className="mb-2" />
      <p className="mb-6 text-sm text-text-secondary">
        Search by customer email, registered phone, or policy ID. Purpose-limited read — every lookup and note is audit-logged.
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
          variant={searchMode === 'phone' ? 'primary' : 'secondary'}
          onClick={() => {
            setSearchMode('phone');
            setQuery('');
            setError(null);
            setResult(null);
          }}
        >
          Phone
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
          label={
            searchMode === 'email'
              ? 'Customer email'
              : searchMode === 'phone'
                ? 'Registered phone'
                : 'Policy ID'
          }
          type={searchMode === 'email' ? 'email' : 'text'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            searchMode === 'email'
              ? 'customer@example.com'
              : searchMode === 'phone'
                ? '+27821234567'
                : '507f1f77bcf86cd799439011'
          }
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
          {result.subscription ? (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-text-primary">Subscription</h2>
              <div className="rounded-lg border border-border bg-background p-4 text-sm">
                <p className="font-medium text-text-primary">
                  {result.subscription.planName ?? formatPlanTierLabel(result.subscription.planSlug)}
                </p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-text-secondary">Asset usage</dt>
                    <dd>{result.subscription.assetUsageLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-text-secondary">Support level</dt>
                    <dd>{result.subscription.supportLevel}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : result.policies && result.policies.length > 0 ? (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-text-primary">Subscription</h2>
              <ul className="space-y-3 text-sm">
                {result.policies.map((policy) => (
                  <li key={policy.id} className="rounded-lg border border-border bg-background p-4">
                    <p className="font-medium text-text-primary">
                      {policy.planName ?? formatPlanTierLabel(policy.planTier)} · {policy.status}
                    </p>
                    <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                      {formatPolicyPrice(policy) ? (
                        <div>
                          <dt className="text-xs text-text-secondary">Monthly</dt>
                          <dd>{formatPolicyPrice(policy)}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="text-xs text-text-secondary">Asset usage</dt>
                        <dd>{formatPolicyAssetUsage(policy, result.assetCount)}</dd>
                      </div>
                      {policy.supportLevel ? (
                        <div>
                          <dt className="text-xs text-text-secondary">Support level</dt>
                          <dd>{formatSupportLevel(policy.supportLevel)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </li>
                ))}
              </ul>
            </div>
          ) : result.policyCount > 0 ? (
            <InlineAlert tone="info">
              This customer has {result.policyCount} policy(ies) and {result.assetCount} registered asset(s).
              Plan details are not available for this lookup.
            </InlineAlert>
          ) : null}
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
              <h2 className="mb-3 text-sm font-semibold text-text-primary">Open recovery cases</h2>
              <ul className="space-y-4">
                {result.recoveryCases.map((recoveryCase) => (
                  <RecoveryCasePanel
                    key={recoveryCase.id}
                    recoveryCase={recoveryCase}
                    onNoteAdded={handleNoteAdded}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
