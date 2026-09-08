import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, Input, SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState } from '../../dashboard/components/ui';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import {
  SUPPORT_CASE_CATEGORIES,
  addSupportCaseNote,
  createSupportCase,
  formatSupportCaseCategory,
  getSupportCase,
  listMySupportCases,
  updateSupportCaseStatus,
  type SupportCaseCategory,
  type SupportCaseDetail,
  type SupportCaseStatus,
  type SupportCaseSummary,
  type UpdatableSupportCaseStatus,
} from '../api/support-cases';

const STATUS_FILTER_VALUES: SupportCaseStatus[] = ['open', 'in_progress', 'resolved', 'closed', 'escalated'];

/** Support-case status tones. `escalated` renders inert — this UI has no way to reach
 * that status (FR-18–21 not authorized) but the read-side type includes it, so it must
 * still render sensibly if it's ever observed on a case created via another surface. */
function supportCaseStatusTone(status: string): 'neutral' | 'gold' | 'emerald' {
  if (status === 'open' || status === 'in_progress') return 'gold';
  if (status === 'resolved') return 'emerald';
  return 'neutral';
}

function SupportCaseStatusBadge({ status }: { status: string }) {
  return <Badge tone={supportCaseStatusTone(status)}>{status.replace(/_/g, ' ')}</Badge>;
}

/** Renders `callerVerified` as a distinct, visible badge (SR-010-3) — every support case is
 * definitionally unverified today (no code path can set this `true`), so this should read
 * "Unverified" on every case until Tier 2 caller verification (C-010-1/C-010-4) ships. */
function CallerVerifiedBadge({ verified }: { verified: boolean }) {
  return <Badge tone={verified ? 'emerald' : 'gold'}>{verified ? 'Caller verified' : 'Unverified'}</Badge>;
}

const selectClasses =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors hover:border-slate-400 focus:border-primary focus:ring-2 focus:ring-accent-gold-deep/30';

/**
 * FR-17 — My Cases list. `scope=mine` only; there is no control anywhere in this
 * component that can request `scope=all` (SR-010-2, withheld server-side too).
 */
export function SupportCasesListPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as SupportCaseStatus | null) ?? '';
  const category = params.get('category') ?? '';

  const [rows, setRows] = useState<SupportCaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listMySupportCases({
      status: status || undefined,
      category: category || undefined,
      limit: 25,
    })
      .then((page) => {
        if (cancelled) return;
        setRows(page.data);
        setCursor(page.pagination.nextCursor);
        setHasMore(page.pagination.hasMore);
      })
      .catch((err) => setError(mapUserFacingError(err, { context: 'generic' })))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, category]);

  async function loadMore() {
    if (!cursor) return;
    const page = await listMySupportCases({
      status: status || undefined,
      category: category || undefined,
      cursor,
      limit: 25,
    });
    setRows((prev) => [...prev, ...page.data]);
    setCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }

  function updateFilter(key: 'status' | 'category', value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <Card padding="lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading as="h1" title="My cases" size="md" />
        <Link to="/call-centre/cases/new">
          <Button size="sm">New case</Button>
        </Link>
      </div>
      <p className="mb-6 text-sm text-text-secondary">
        Support cases you created or have interacted with. Only your own cases are shown here.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-48">
          <label htmlFor="status-filter" className="mb-1.5 block text-sm font-medium text-slate-800">
            Status
          </label>
          <select
            id="status-filter"
            className={selectClasses}
            value={status}
            onChange={(e) => updateFilter('status', e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_FILTER_VALUES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="w-56">
          <label htmlFor="category-filter" className="mb-1.5 block text-sm font-medium text-slate-800">
            Category
          </label>
          <select
            id="category-filter"
            className={selectClasses}
            value={category}
            onChange={(e) => updateFilter('category', e.target.value)}
          >
            <option value="">All categories</option>
            {SUPPORT_CASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {formatSupportCaseCategory(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {loading ? (
        <LoadingState />
      ) : (
        <>
          <DataTable
            emptyMessage="No support cases match these filters."
            columns={[
              {
                key: 'referenceNumber',
                header: 'Case',
                render: (row) => (
                  <Link className="text-primary hover:underline" to={`/call-centre/cases/${row.id}`}>
                    {String(row.referenceNumber)}
                  </Link>
                ),
              },
              {
                key: 'category',
                header: 'Category',
                render: (row) => formatSupportCaseCategory(String(row.category)),
              },
              { key: 'status', header: 'Status', render: (row) => <SupportCaseStatusBadge status={String(row.status)} /> },
              {
                key: 'callerVerified',
                header: 'Caller',
                render: (row) => <CallerVerifiedBadge verified={Boolean(row.callerVerified)} />,
              },
              { key: 'accountId', header: 'Account', render: (row) => `${String(row.accountId).slice(0, 8)}…` },
              { key: 'createdAt', header: 'Created', render: (row) => new Date(String(row.createdAt)).toLocaleString() },
            ]}
            rows={rows as unknown as Array<Record<string, unknown>>}
          />
          {hasMore ? (
            <Button className="mt-4" variant="secondary" size="sm" onClick={() => void loadMore()}>
              Load more
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}

/**
 * FR-12 — create a support case. Reachable standalone (`/call-centre/cases/new`) or with
 * `?accountId=…` pre-filled from a customer-lookup result (matching the
 * accountId-supplied-by-agent pattern the backend already enforces — api-design.md §2.2).
 */
export function CreateSupportCasePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const prefilledAccountId = params.get('accountId') ?? '';

  const [accountId, setAccountId] = useState(prefilledAccountId);
  const [category, setCategory] = useState<SupportCaseCategory | ''>('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!category) {
      setError('Choose a category.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createSupportCase({
        accountId: accountId.trim(),
        category,
        description: description.trim(),
      });
      navigate(`/call-centre/cases/${created.id}`, { replace: true });
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'generic' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="lg">
      <SectionHeading as="h1" title="New support case" size="md" className="mb-2" />
      <p className="mb-6 text-sm text-text-secondary">
        Open a case against a customer account you have already looked up. Look up the customer first if you
        don't have their account ID —{' '}
        <Link className="text-primary hover:underline" to="/call-centre/lookup">
          go to customer lookup
        </Link>
        .
      </p>

      <form className="max-w-xl space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <Input
          label="Account ID"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          placeholder="Customer account UUID from lookup"
          hint="Must belong to a customer account you looked up — the backend validates and rejects any other account type."
          required
          autoComplete="off"
        />

        <div>
          <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-slate-800">
            Category
            <span className="ml-0.5 text-red-600" aria-hidden="true">
              *
            </span>
          </label>
          <select
            id="category"
            className={selectClasses}
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCaseCategory)}
            required
          >
            <option value="" disabled>
              Select a category
            </option>
            {SUPPORT_CASE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {formatSupportCaseCategory(c)}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Description"
          type="textarea"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What the customer reported…"
          required
        />

        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

        <Button type="submit" loading={saving}>
          Create case
        </Button>
      </form>
    </Card>
  );
}

const STATUS_TRANSITIONS: Record<SupportCaseStatus, UpdatableSupportCaseStatus[]> = {
  open: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['closed'],
  closed: [],
  escalated: [],
};

function StatusUpdateControl({
  supportCase,
  onUpdated,
}: {
  supportCase: SupportCaseDetail;
  onUpdated: (next: SupportCaseDetail) => void;
}) {
  const availableTransitions = STATUS_TRANSITIONS[supportCase.status] ?? [];
  const [nextStatus, setNextStatus] = useState<UpdatableSupportCaseStatus | ''>('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (availableTransitions.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        {supportCase.status === 'closed'
          ? 'This case is closed — no further status changes are available.'
          : supportCase.status === 'escalated'
            ? 'This case was escalated — status changes are managed on the resulting recovery case.'
            : 'No status changes are available for this case right now.'}
      </p>
    );
  }

  const requiresResolutionSummary = nextStatus === 'resolved' || nextStatus === 'closed';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!nextStatus) return;
    if (requiresResolutionSummary && !resolutionSummary.trim()) {
      setError('A resolution summary is required for this status change.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateSupportCaseStatus(
        supportCase.id,
        nextStatus,
        requiresResolutionSummary ? resolutionSummary.trim() : undefined,
      );
      onUpdated(updated);
      setNextStatus('');
      setResolutionSummary('');
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'generic' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => void onSubmit(e)}>
      <div className="w-56">
        <label htmlFor="next-status" className="mb-1.5 block text-sm font-medium text-slate-800">
          Update status to
        </label>
        <select
          id="next-status"
          className={selectClasses}
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as UpdatableSupportCaseStatus)}
        >
          <option value="" disabled>
            Select a status
          </option>
          {availableTransitions.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      {requiresResolutionSummary ? (
        <Input
          label="Resolution summary"
          type="textarea"
          rows={3}
          value={resolutionSummary}
          onChange={(e) => setResolutionSummary(e.target.value)}
          placeholder="What was resolved and how…"
          required
        />
      ) : null}

      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}

      <Button type="submit" size="sm" loading={saving} disabled={!nextStatus}>
        Save status
      </Button>
    </form>
  );
}

function AddNoteForm({
  caseId,
  onNoteAdded,
}: {
  caseId: string;
  onNoteAdded: (note: SupportCaseDetail['notes'][number]) => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const result = await addSupportCaseNote(caseId, trimmed);
      onNoteAdded(result.note);
      setText('');
    } catch (err) {
      setError(mapUserFacingError(err, { context: 'generic' }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-2" onSubmit={(e) => void onSubmit(e)}>
      <Input
        label="Add note"
        type="textarea"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Call summary, action taken, next steps…"
        required
      />
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      <Button type="submit" size="sm" loading={saving}>
        Save note
      </Button>
    </form>
  );
}

/** FR-17 detail / FR-14 notes / FR-15-16 status update. No escalation affordance anywhere
 * on this page — FR-18–21 is not authorized for implementation (api-design.md §7). */
export function SupportCaseDetailPage({ caseId }: { caseId: string }) {
  const [supportCase, setSupportCase] = useState<SupportCaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSupportCase(caseId)
      .then((data) => {
        if (!cancelled) setSupportCase(data);
      })
      .catch((err) => {
        if (!cancelled) setError(mapUserFacingError(err, { context: 'generic' }));
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (error) return <InlineAlert tone="danger">{error}</InlineAlert>;
  if (!supportCase) return <LoadingState />;

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading as="h1" title={`Case ${supportCase.referenceNumber}`} size="md" />
          <div className="flex items-center gap-2">
            <CallerVerifiedBadge verified={supportCase.callerVerified} />
            <SupportCaseStatusBadge status={supportCase.status} />
          </div>
        </div>
        <DetailGrid
          rows={[
            { label: 'Category', value: formatSupportCaseCategory(supportCase.category) },
            { label: 'Account', value: supportCase.accountId },
            { label: 'Created', value: new Date(supportCase.createdAt).toLocaleString() },
            { label: 'Updated', value: new Date(supportCase.updatedAt).toLocaleString() },
            { label: 'Resolution summary', value: supportCase.resolutionSummary ?? '—' },
          ]}
        />
        <div className="mt-4">
          <h2 className="mb-1 text-sm font-semibold text-text-primary">Description</h2>
          <p className="text-sm text-text-secondary">{supportCase.description}</p>
        </div>
      </Card>

      <Card padding="lg">
        <SectionHeading as="h2" title="Update status" size="md" className="mb-3" />
        <StatusUpdateControl supportCase={supportCase} onUpdated={setSupportCase} />
        <p className="mt-4 text-xs text-text-secondary">
          Escalation to a recovery case is not yet available from this dashboard.
        </p>
      </Card>

      <Card padding="lg">
        <SectionHeading as="h2" title="Notes" size="md" className="mb-3" />
        {supportCase.notes.length > 0 ? (
          <ul className="mb-4 space-y-3 text-sm text-text-secondary">
            {supportCase.notes.map((note, idx) => (
              <li key={`${note.createdAt}-${idx}`} className="rounded-lg border border-border bg-background p-3">
                <span className="block text-xs text-text-secondary">{new Date(note.createdAt).toLocaleString()}</span>
                {note.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-text-secondary">No notes yet.</p>
        )}
        <AddNoteForm
          caseId={supportCase.id}
          onNoteAdded={(note) =>
            setSupportCase((current) => (current ? { ...current, notes: [...current.notes, note] } : current))
          }
        />
      </Card>
    </div>
  );
}
