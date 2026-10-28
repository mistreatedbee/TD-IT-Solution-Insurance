import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Input, SectionHeading } from '../../components';
import { DetailGrid, InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { ApiError } from '../../dashboard/api/errors';
import {
  addCallCentreCaseNote,
  getRecoveryCaseForCallCentre,
  type SupportRecoveryCaseDetail,
} from '../api/support-lookup';

function RecoveryCaseStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'recovered' || status === 'closed'
      ? 'emerald'
      : status === 'open' || status === 'investigating' || status === 'tracking'
        ? 'gold'
        : 'neutral';
  return <Badge tone={tone}>{status.replace(/_/g, ' ')}</Badge>;
}

/**
 * Candidate #2 — call-centre-scoped recovery-case detail view
 * (`GET /v1/support/recovery-cases/:idOrReference`). Reachable either by a case's Mongo
 * id (e.g. linked from `CustomerLookupPage`'s open-recovery-cases list) or by typing a
 * `RC-YYYYMMDD-XXXX` reference number directly — an agent on a call is more likely to
 * have been given the reference number than the internal id (same rationale as the
 * backend route itself).
 *
 * Deliberately does not render location coordinates or any SAPS police-report field —
 * the backend response never includes them for this route, so there is nothing to
 * withhold client-side; this component's type (`SupportRecoveryCaseDetail`) simply
 * doesn't declare them.
 */
export function RecoveryCaseDetailPage({ idOrReference }: { idOrReference?: string }) {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState(idOrReference ?? '');
  const [recoveryCase, setRecoveryCase] = useState<SupportRecoveryCaseDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(idOrReference));
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    if (!idOrReference) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRecoveryCaseForCallCentre(idOrReference)
      .then((data) => {
        if (!cancelled) setRecoveryCase(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError('No recovery case found for that ID or reference number.');
        } else {
          setError('Could not load this case. Try again or contact engineering.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrReference]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = searchValue.trim();
    if (!trimmed) return;
    navigate(`/call-centre/recovery-cases/${encodeURIComponent(trimmed)}`);
  }

  async function onAddNote(event: FormEvent) {
    event.preventDefault();
    if (!recoveryCase) return;
    const text = noteText.trim();
    if (!text) return;

    setSavingNote(true);
    setNoteError(null);
    try {
      const data = await addCallCentreCaseNote(recoveryCase.id, text);
      setRecoveryCase((current) =>
        current ? { ...current, callCentreNotes: [...current.callCentreNotes, data.note] } : current,
      );
      setNoteText('');
    } catch {
      setNoteError('Could not save note. Try again.');
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <SectionHeading as="h1" title="Recovery case detail" size="md" className="mb-2" />
        <p className="mb-4 text-sm text-text-secondary">
          Look up a case by its internal ID or by its reference number (e.g.{' '}
          <code>RC-20261023-X7K2</code>). Every lookup is audit-logged. Location coordinates and police
          report details are never shown here.
        </p>
        <form className="flex max-w-xl flex-col gap-3 sm:flex-row" onSubmit={onSearch}>
          <Input
            label="Case ID or reference number"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="RC-20261023-X7K2"
            autoComplete="off"
            required
          />
          <Button type="submit">Search</Button>
        </form>
      </Card>

      {loading ? <LoadingState /> : null}
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      {recoveryCase ? (
        <Card padding="lg">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionHeading as="h2" title={`Case ${recoveryCase.referenceNumber}`} size="md" />
            <RecoveryCaseStatusBadge status={recoveryCase.status} />
          </div>
          <DetailGrid
            rows={[
              { label: 'Account ID', value: recoveryCase.accountId },
              { label: 'Asset ID', value: recoveryCase.assetId },
              { label: 'Reported', value: new Date(recoveryCase.reportedAt).toLocaleString() },
              {
                label: 'Closed',
                value: recoveryCase.closedAt ? new Date(recoveryCase.closedAt).toLocaleString() : '—',
              },
              {
                label: 'Last location update',
                value: recoveryCase.lastLocationAt
                  ? new Date(recoveryCase.lastLocationAt).toLocaleString()
                  : '—',
              },
              { label: 'Notes', value: recoveryCase.notes ?? '—' },
            ]}
          />

          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Call-centre notes</h3>
            {recoveryCase.callCentreNotes.length > 0 ? (
              <ul className="mb-4 space-y-2 border-t border-border pt-3 text-sm text-text-secondary">
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
              <p className="mb-4 text-sm text-text-secondary">No call-centre notes yet.</p>
            )}

            <form className="space-y-2" onSubmit={(e) => void onAddNote(e)}>
              <Input
                label="Add call-centre note"
                type="textarea"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Call summary, action taken, next steps…"
                hint="Don't include personal details about other people (e.g. names of suspects) — only describe what happened."
                rows={3}
                required
              />
              {noteError ? <InlineAlert tone="danger">{noteError}</InlineAlert> : null}
              <Button type="submit" size="sm" loading={savingNote}>
                Save note
              </Button>
            </form>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
