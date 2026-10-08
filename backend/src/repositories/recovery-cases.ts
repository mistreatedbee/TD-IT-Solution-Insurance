/**
 * `recovery_cases` — theft/recovery case records for mobile + Security Dashboard.
 *
 * Feature 011 (SAPS case-number capture) note — SR-011-1 / C-011-9: this file is the
 * ONLY place `sapsCaseNumber` / `reportingStation` / `reportedToPoliceAt` /
 * `policeReportHistory` / `policeReportReminderSentAt` (collectively "police-report
 * fields") may be read off the raw document. The partner/security-company-facing read
 * paths (`listForPartnerOrg`, `findByIdForPartnerOrg`, and the write-path read-backs in
 * `claimForPartnerOrg`/`updateStatusForPartnerOrg`) apply a Mongo projection that
 * EXCLUDES these fields at the query level — they are never fetched into the row object
 * on that path, so neither `serializeOfferTierRecoveryCase` nor
 * `serializeClaimedTierRecoveryCase` can structurally see them even if a future edit
 * adds a field to either function. Do not "fix" the projection to include these fields
 * without a fresh security-review sign-off (security-review.md SR-011-1a).
 *
 * PDM-2 (compliance-review-security-partner-data-minimisation.md) extends this same
 * "excluded at the query level" discipline to a second, claim-state-tiered set of
 * fields — see `OFFER_TIER_FIELD_EXCLUSION_PROJECTION` / `CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION`
 * below, and the `PartnerVisibleCaseResult` doc comment for how `accountId` is handled
 * as a deliberate, documented exception to "excluded at the query level" (PDM-1/PDM-8).
 */
import { ObjectId, type Db, type Collection, type Document } from 'mongodb';
import { mongoCursorFilter, type MongoDecodedCursor } from '../lib/mongo-pagination.js';

export type RecoveryCaseStatus =
  | 'open'
  | 'investigating'
  | 'tracking'
  | 'recovered'
  | 'closed';

export interface LastKnownLocation {
  latitude: number;
  longitude: number;
  recordedAt: Date;
  accuracyMeters: number | null;
}

export interface CallCentreNote {
  agentAccountId: string;
  text: string;
  createdAt: Date;
}

/** Feature 011 (compliance-review-saps-case-data.md C-011-8) — append-only change
 * history for the police-report triple. One entry per field that ACTUALLY changed
 * value (api-design.md §2.5 no-op suppression — see setPoliceReportFields below). */
export interface PoliceReportChange {
  actorAccountId: string;
  field: 'sapsCaseNumber' | 'reportingStation' | 'reportedToPoliceAt';
  previousValue: string | null;
  newValue: string | null;
  changedAt: Date;
}

/** database-design.md §3 bounds — SR-011-3: caps unbounded customer-controlled growth
 * on a document every partner-dashboard page load fetches (with these fields projected
 * out, per SR-011-1a, but the array itself must still be bounded on write). Chosen as a
 * generous-but-finite ceiling: a real customer edits this triple a handful of times
 * (station first, case number once SMS'd, an occasional correction) — 50 entries is
 * roughly an order of magnitude above any plausible legitimate use, while still cheap
 * to store and cheap to reject well before the 16MB BSON document ceiling is a concern. */
export const MAX_POLICE_REPORT_HISTORY_ITEMS = 50;

/** compliance-review-saps-case-data.md §5 — retention floor for the police-report
 * triple: 5 years from case closure (`closedAt`), subject to `legalHold`/CT-4 override. */
export const POLICE_REPORT_RETENTION_YEARS = 5;

export interface RecoveryCaseDocument {
  id: string;
  accountId: string;
  assetId: string;
  partnerOrganizationId: string | null;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: Date;
  notes: string | null;
  callCentreNotes: CallCentreNote[];
  lastLocationAt: Date | null;
  lastLocation: LastKnownLocation | null;
  legalHold: boolean;
  /** Feature 011 — set once, when `status` transitions to `'closed'`
   * (see `updateStatusForPartnerOrg`). Drives the police-report retention clock
   * (database-design.md §5.2) — do NOT substitute `updatedAt` for this field. */
  closedAt: Date | null;
  /** Feature 011 (SAPS case-number capture) — customer-only fields. NEVER add these to
   * `serializeOfferTierRecoveryCase`, `serializeClaimedTierRecoveryCase`, or any
   * security-company/support-agent surface without a fresh compliance + security
   * review (C-011-9 / SR-011-1 / SR-011-7). */
  sapsCaseNumber: string | null;
  reportingStation: string | null;
  reportedToPoliceAt: Date | null;
  policeReportHistory: PoliceReportChange[];
  policeReportReminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RecoveryCaseDbRow {
  _id: ObjectId;
  accountId: string;
  assetId: string;
  partnerOrganizationId: string | null;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: Date;
  notes: string | null;
  callCentreNotes?: CallCentreNote[];
  lastLocationAt: Date | null;
  lastLocation: LastKnownLocation | null;
  legalHold: boolean;
  closedAt?: Date | null;
  // Optional because the partner-scoped read paths deliberately project these fields
  // OUT of the query (SR-011-1a) — on those rows, these keys are simply absent, not null.
  sapsCaseNumber?: string | null;
  reportingStation?: string | null;
  reportedToPoliceAt?: Date | null;
  policeReportHistory?: PoliceReportChange[];
  policeReportReminderSentAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** SR-011-1a — Mongo exclusion projection applied to every partner/security-company
 * read of `recovery_cases`. A field excluded here is never fetched into the row object
 * at all, so it cannot be serialised, logged, or spread by any code downstream of the
 * query — this is what makes C-011-9 a structural guarantee rather than a convention.
 * DO NOT remove a field from this projection without a fresh Stage 8 review. */
export const POLICE_REPORT_FIELD_EXCLUSION_PROJECTION: Document = {
  sapsCaseNumber: 0,
  reportingStation: 0,
  reportedToPoliceAt: 0,
  policeReportHistory: 0,
  policeReportReminderSentAt: 0,
};

function toCase(row: RecoveryCaseDbRow): RecoveryCaseDocument {
  return {
    id: row._id.toHexString(),
    accountId: row.accountId,
    assetId: row.assetId,
    partnerOrganizationId: row.partnerOrganizationId,
    status: row.status,
    referenceNumber: row.referenceNumber,
    reportedAt: row.reportedAt,
    notes: row.notes,
    callCentreNotes: row.callCentreNotes ?? [],
    lastLocationAt: row.lastLocationAt,
    lastLocation: row.lastLocation,
    legalHold: row.legalHold,
    closedAt: row.closedAt ?? null,
    sapsCaseNumber: row.sapsCaseNumber ?? null,
    reportingStation: row.reportingStation ?? null,
    reportedToPoliceAt: row.reportedToPoliceAt ?? null,
    policeReportHistory: row.policeReportHistory ?? [],
    policeReportReminderSentAt: row.policeReportReminderSentAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function generateReferenceNumber(): string {
  const date = new Date();
  const ymd =
    String(date.getUTCFullYear()) +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    String(date.getUTCDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `RC-${ymd}-${suffix}`;
}

export function serializeRecoveryCase(doc: RecoveryCaseDocument) {
  return {
    id: doc.id,
    assetId: doc.assetId,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    reportedAt: doc.reportedAt.toISOString(),
    notes: doc.notes,
    lastLocationAt: doc.lastLocationAt?.toISOString() ?? null,
  };
}

// PDM-1 (compliance-review-security-partner-data-minimisation.md §3/§4): `accountId`
// is withdrawn from every security-company-partner-facing response, at every claim
// stage, not only pre-claim — a claimed partner recovers an *asset*, identified by
// case reference and asset descriptors; the account id gives it nothing operational
// and gives it a persistent key to profile a customer across cases over time. It is
// deliberately NOT a field on `OfferTierRecoveryCase`/`ClaimedTierRecoveryCase` below
// (TypeScript cannot pass what the type doesn't have) rather than merely omitted by
// convention from a serializer that could drift. `serializeSecurityRecoveryCase` (the
// old, untiered serializer that unconditionally spread `accountId`) is removed —
// `serializeOfferTierRecoveryCase`/`serializeClaimedTierRecoveryCase` replace every
// call site in `routes/security-cases.ts`.

/**
 * PDM-2 (compliance-review-security-partner-data-minimisation.md §4) — an unclaimed
 * case ("offer tier") carries no operational need for `notes` (most likely field to
 * contain an address or a SAPS case number — F-9), `assetId`, `lastLocation`,
 * `lastLocationAt`, or `callCentreNotes`: an operator deciding whether to claim a case
 * needs only its reference/status/timestamps. Excluded at the Mongo projection level
 * (SR-011-1a pattern — "a field never fetched cannot be leaked"), not filtered after
 * the fact by the serializer alone.
 *
 * `accountId` is deliberately NOT in this projection, unlike the compliance review's
 * literal field list. ADR-0006 §18.3 requires every disclosed case — including
 * unclaimed/offer-tier rows an operator merely browses — to be logged with its
 * subject `accountId` as the audit trail's `targetAccountId` (PDM-8). Withholding it
 * from the DB fetch entirely would make that audit write impossible. The field is
 * fetched (for the audit write only) and is structurally absent from
 * `OfferTierRecoveryCase`/`ClaimedTierRecoveryCase` and never reaches
 * `serializeOfferTierRecoveryCase`/`serializeClaimedTierRecoveryCase` or the HTTP
 * response — PDM-1's guarantee is enforced at the response-serializer boundary for
 * this one field, not the query boundary, and that boundary is exercised by a
 * dedicated regression test (`recovery-cases.test.ts`).
 */
export const OFFER_TIER_FIELD_EXCLUSION_PROJECTION: Document = {
  ...POLICE_REPORT_FIELD_EXCLUSION_PROJECTION,
  notes: 0,
  assetId: 0,
  lastLocation: 0,
  lastLocationAt: 0,
  callCentreNotes: 0,
};

/**
 * PDM-2 — a claimed case ("Tier 1") additionally excludes `callCentreNotes` and
 * `lastLocation`, which compliance confirmed are fetched today with no actual use
 * (F-5 — neither has ever been in `serializeRecoveryCase`'s output). Does NOT exclude
 * `notes`/`assetId`/`lastLocationAt`: those are operationally relevant once a case is
 * claimed. See the `accountId` note on `OFFER_TIER_FIELD_EXCLUSION_PROJECTION` above —
 * the same reasoning applies here.
 */
export const CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION: Document = {
  ...POLICE_REPORT_FIELD_EXCLUSION_PROJECTION,
  callCentreNotes: 0,
  lastLocation: 0,
};

type OfferTierCaseDbRow = Pick<
  RecoveryCaseDbRow,
  '_id' | 'accountId' | 'partnerOrganizationId' | 'status' | 'referenceNumber' | 'reportedAt' | 'createdAt' | 'updatedAt'
>;

type ClaimedTierCaseDbRow = Omit<
  RecoveryCaseDbRow,
  | 'callCentreNotes'
  | 'lastLocation'
  | 'sapsCaseNumber'
  | 'reportingStation'
  | 'reportedToPoliceAt'
  | 'policeReportHistory'
  | 'policeReportReminderSentAt'
>;

/** The shape returned by `serializeOfferTierRecoveryCase` — structurally has no
 * `accountId`, `notes`, `assetId`, `lastLocation`, `lastLocationAt`, or
 * `callCentreNotes` field, so none of those can ever reach that serializer. */
export interface OfferTierRecoveryCase {
  id: string;
  partnerOrganizationId: string | null;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: Date;
  updatedAt: Date;
}

/** The shape returned by `serializeClaimedTierRecoveryCase` — structurally has no
 * `accountId`, `callCentreNotes`, or `lastLocation` field. */
export interface ClaimedTierRecoveryCase {
  id: string;
  assetId: string;
  partnerOrganizationId: string | null;
  status: RecoveryCaseStatus;
  referenceNumber: string;
  reportedAt: Date;
  notes: string | null;
  lastLocationAt: Date | null;
  updatedAt: Date;
}

function toOfferTierCase(row: OfferTierCaseDbRow): OfferTierRecoveryCase {
  return {
    id: row._id.toHexString(),
    partnerOrganizationId: row.partnerOrganizationId,
    status: row.status,
    referenceNumber: row.referenceNumber,
    reportedAt: row.reportedAt,
    updatedAt: row.updatedAt,
  };
}

function toClaimedTierCase(row: ClaimedTierCaseDbRow): ClaimedTierRecoveryCase {
  return {
    id: row._id.toHexString(),
    assetId: row.assetId,
    partnerOrganizationId: row.partnerOrganizationId,
    status: row.status,
    referenceNumber: row.referenceNumber,
    reportedAt: row.reportedAt,
    notes: row.notes,
    lastLocationAt: row.lastLocationAt,
    updatedAt: row.updatedAt,
  };
}

/** `ClaimedTierRecoveryCase` built from a full, already-converted
 * `RecoveryCaseDocument` (used by the claim/PATCH write paths, which keep
 * `accountId` available internally for notification dispatch — see
 * `toClaimedTierCase`'s doc comment — but must never let it reach the response). */
export function toClaimedTierView(doc: RecoveryCaseDocument): ClaimedTierRecoveryCase {
  return {
    id: doc.id,
    assetId: doc.assetId,
    partnerOrganizationId: doc.partnerOrganizationId,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    reportedAt: doc.reportedAt,
    notes: doc.notes,
    lastLocationAt: doc.lastLocationAt,
    updatedAt: doc.updatedAt,
  };
}

export function serializeOfferTierRecoveryCase(doc: OfferTierRecoveryCase) {
  return {
    id: doc.id,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    reportedAt: doc.reportedAt.toISOString(),
    partnerOrganizationId: doc.partnerOrganizationId,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeClaimedTierRecoveryCase(doc: ClaimedTierRecoveryCase) {
  return {
    id: doc.id,
    assetId: doc.assetId,
    status: doc.status,
    referenceNumber: doc.referenceNumber,
    reportedAt: doc.reportedAt.toISOString(),
    notes: doc.notes,
    lastLocationAt: doc.lastLocationAt?.toISOString() ?? null,
    partnerOrganizationId: doc.partnerOrganizationId,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** PDM-4 (compliance-review-security-partner-data-minimisation.md F-10) — the wrap-up
 * window: once a case the caller's org claimed has been `recovered`/`closed` for more
 * than this many days, it drops out of that org's own list/detail/count. This is
 * partner VISIBILITY, not deletion — `recovery_cases`' own retention (the
 * police-report 5-year clock, Feature 011) is unaffected, and `legalHold` does NOT
 * extend partner visibility (a hold preserves our record; it is not a reason to keep
 * showing it to a third party). */
export const PARTNER_CASE_WRAP_UP_WINDOW_DAYS = 90;

function wrapUpCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - PARTNER_CASE_WRAP_UP_WINDOW_DAYS);
  return cutoff;
}

/**
 * PDM-3/PDM-4 — the ONLY predicate defining whether a case this org has claimed is
 * still visible to it. `buildPartnerOrgQuery` (list/count) and `findByIdForPartnerOrg`
 * (detail) both call this so list, count, and detail cannot structurally diverge
 * (extends C-012-3 to the detail route, per PDM-3/F-4).
 */
export function claimedCaseVisiblePredicate(partnerOrganizationId: string): Document {
  return {
    partnerOrganizationId,
    $or: [
      { status: { $nin: ['recovered', 'closed'] } },
      { closedAt: null },
      { closedAt: { $gt: wrapUpCutoff() } },
    ],
  };
}

/**
 * PDM-3 — the shared-pool branch: every partner org sees every unassigned,
 * still-open case (RR-012-1's cross-tenant pool signal, unchanged by PDM-1..4 —
 * narrowing Problem A, universal pool visibility, is out of scope here).
 */
export function unclaimedCaseVisiblePredicate(): Document {
  return { partnerOrganizationId: null, status: 'open' as RecoveryCaseStatus };
}

/**
 * Feature 012 (api-design.md §3 / security-review.md §10.5, C-012-3) — the SAME
 * partner-visible filter used by both `listForPartnerOrg` and `countForPartnerOrg`.
 * Extracted so the two paths cannot drift apart (C-012-3: a count's population may
 * never exceed what the same caller can read via its sibling list route). Do not
 * hand-duplicate this `$or` clause anywhere else — narrowing this filter (e.g. to
 * close RR-012-2) MUST be done here so both callers narrow together.
 */
export function buildPartnerOrgQuery(
  partnerOrganizationId: string,
  filters: { status?: RecoveryCaseStatus },
): Document {
  const statusFilter = filters.status ? { status: filters.status } : {};
  return {
    $or: [claimedCaseVisiblePredicate(partnerOrganizationId), unclaimedCaseVisiblePredicate()],
    ...statusFilter,
  };
}

/** Tagged result of a partner-scoped read — `tier` drives which serializer the route
 * layer uses; `accountId` is exposed ONLY for the caller to pass to PDM-8 audit
 * logging (ADR-0006 §18.3), never to the HTTP response (see the tier types' doc
 * comments and the `accountId` note above `OFFER_TIER_FIELD_EXCLUSION_PROJECTION`).
 * `createdAt` is exposed ONLY for `buildPage()`'s cursor encoding — it is not part of
 * either tier's response shape and is never passed to a serializer. */
export type PartnerVisibleCaseResult =
  | { tier: 'claimed'; accountId: string; createdAt: Date; case: ClaimedTierRecoveryCase }
  | { tier: 'offer'; accountId: string; createdAt: Date; case: OfferTierRecoveryCase };

function compareDesc(
  a: { createdAt: Date; _id: ObjectId },
  b: { createdAt: Date; _id: ObjectId },
): number {
  const diff = b.createdAt.getTime() - a.createdAt.getTime();
  if (diff !== 0) return diff;
  return b._id.toHexString().localeCompare(a._id.toHexString());
}

/**
 * SR-009S-6 — a claimed case may only move FORWARD through this lifecycle:
 * `investigating` -> `tracking` -> `recovered`/`closed`, and `recovered` -> `closed`
 * (an operator administratively closing a case whose asset was already recovered,
 * per the `closedAt`-preservation note above). No entry here ever points back to an
 * earlier stage. Without this, an operator could PATCH a `closed`/`recovered` case
 * back to `investigating` (or any earlier status), defeating the PDM-4 90-day
 * wrap-up window indefinitely by perpetually re-opening and re-closing a case. `open`
 * is deliberately absent as a source: a claimed case is never `open` (claiming moves
 * it straight to `investigating` via `claimForPartnerOrg`, not this map), and absent
 * as a target: "reopening" is not a status change on an existing claimed case, it
 * would require a fresh unclaimed case.
 */
export const RECOVERY_CASE_FORWARD_TRANSITIONS: Record<RecoveryCaseStatus, readonly RecoveryCaseStatus[]> = {
  open: [],
  investigating: ['tracking', 'recovered', 'closed'],
  tracking: ['recovered', 'closed'],
  recovered: ['closed'],
  closed: [],
};

/** SR-009S-6 — true iff `to` is a permitted forward move from `from`. Used both by
 * the route layer (to reject before writing an audit row) and defensively inside
 * `updateStatusForPartnerOrg` itself, so the guarantee holds even if a future call
 * site forgets the route-layer check. */
export function isForwardStatusTransition(from: RecoveryCaseStatus, to: RecoveryCaseStatus): boolean {
  return RECOVERY_CASE_FORWARD_TRANSITIONS[from].includes(to);
}

/**
 * Safely ANDs together filter fragments that may each independently carry a
 * top-level `$or` key (`claimedCaseVisiblePredicate()`/`unclaimedCaseVisiblePredicate()`
 * and `mongoCursorFilter()` both can). A naive object spread (`{ ...a, ...b }`) silently
 * drops `a`'s `$or` whenever `b` also has one — the later spread's key wins — which would
 * have quietly dropped the partner-visibility predicate entirely on every paginated
 * request past page 1 (a cursor is always present from page 2 onward). Empty fragments
 * are dropped so `find({})` isn't wrapped in a pointless `$and: [{}]`.
 */
function andFilters(...filters: Document[]): Document {
  const nonEmpty = filters.filter((f) => Object.keys(f).length > 0);
  if (nonEmpty.length === 0) return {};
  if (nonEmpty.length === 1) return nonEmpty[0]!;
  return { $and: nonEmpty };
}

export function createRecoveryCasesRepo(db: Db) {
  const collection = (): Collection<RecoveryCaseDbRow> =>
    db.collection<RecoveryCaseDbRow>('recovery_cases');

  return {
    async createForAccount(
      accountId: string,
      assetId: string,
      notes: string | null,
      partnerOrganizationId: string | null,
    ): Promise<RecoveryCaseDocument> {
      const now = new Date();
      const doc: Omit<RecoveryCaseDbRow, '_id'> = {
        accountId,
        assetId,
        partnerOrganizationId,
        status: 'open',
        referenceNumber: generateReferenceNumber(),
        reportedAt: now,
        notes,
        callCentreNotes: [],
        lastLocationAt: null,
        lastLocation: null,
        legalHold: false,
        closedAt: null,
        sapsCaseNumber: null,
        reportingStation: null,
        reportedToPoliceAt: null,
        policeReportHistory: [],
        policeReportReminderSentAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const result = await collection().insertOne(doc as RecoveryCaseDbRow);
      return toCase({ _id: result.insertedId, ...doc });
    },

    async listByAccount(
      accountId: string,
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<RecoveryCaseDocument[]> {
      const rows = await collection()
        .find({ accountId, ...mongoCursorFilter(cursor) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray();
      return rows.map(toCase);
    },

    async findByIdForAccount(accountId: string, caseId: string): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const row = await collection().findOne({ _id: new ObjectId(caseId), accountId });
      return row ? toCase(row) : null;
    },

    /**
     * PDM-2 — queried as two independent, separately-projected branches (claimed-by-
     * caller, and the shared unclaimed-open pool) rather than one `$or` query with a
     * single projection, because the two branches need different field exclusions
     * (`OFFER_TIER_FIELD_EXCLUSION_PROJECTION` vs `CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION`)
     * and Mongo cannot vary a projection per matched document within one query. Each
     * branch is fetched sorted `(createdAt desc, _id desc)` and capped at `limit`; the
     * top `limit` of the merged union is necessarily contained in the top `limit` of
     * each branch individually (standard k-way-merge bound), so this is both correct
     * and no more expensive than the single-query form once merged client-side.
     */
    async listForPartnerOrg(
      partnerOrganizationId: string,
      filters: { status?: RecoveryCaseStatus },
      limit: number,
      cursor: MongoDecodedCursor | null,
    ): Promise<PartnerVisibleCaseResult[]> {
      const cursorFilter = mongoCursorFilter(cursor);
      const statusFilter = filters.status ? { status: filters.status } : {};

      const claimedRows = (await collection()
        .find(andFilters(claimedCaseVisiblePredicate(partnerOrganizationId), statusFilter, cursorFilter))
        .project(CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit)
        .toArray()) as unknown as ClaimedTierCaseDbRow[];

      // Unclaimed cases are always status 'open' — only query this branch when the
      // caller's status filter (if any) doesn't rule it out, mirroring
      // `buildPartnerOrgQuery`'s $or semantics exactly (PDM-3 shared predicate).
      const includeUnclaimed = !filters.status || filters.status === 'open';
      const offerRows = includeUnclaimed
        ? ((await collection()
            .find(andFilters(unclaimedCaseVisiblePredicate(), cursorFilter))
            .project(OFFER_TIER_FIELD_EXCLUSION_PROJECTION)
            .sort({ createdAt: -1, _id: -1 })
            .limit(limit)
            .toArray()) as unknown as OfferTierCaseDbRow[])
        : [];

      const claimed: Array<PartnerVisibleCaseResult & { _id: ObjectId }> = claimedRows.map((row) => ({
        tier: 'claimed' as const,
        accountId: row.accountId,
        createdAt: row.createdAt,
        case: toClaimedTierCase(row),
        _id: row._id,
      }));
      const offered: Array<PartnerVisibleCaseResult & { _id: ObjectId }> = offerRows.map((row) => ({
        tier: 'offer' as const,
        accountId: row.accountId,
        createdAt: row.createdAt,
        case: toOfferTierCase(row),
        _id: row._id,
      }));

      const merged = [...claimed, ...offered].sort(compareDesc).slice(0, limit);
      return merged.map(({ tier, accountId, createdAt, case: c }) => ({
        tier,
        accountId,
        createdAt,
        case: c,
      }) as PartnerVisibleCaseResult);
    },

    /**
     * Feature 012 FR-4 — `GET /v1/security/cases/count`. Reuses `buildPartnerOrgQuery`
     * verbatim (C-012-3) so this can never diverge from `listForPartnerOrg`'s own
     * filter. `countDocuments()` — no `limit`, no cursor, no page-size ceiling
     * (F-012-2 resolved by construction, api-design.md §6).
     */
    async countForPartnerOrg(
      partnerOrganizationId: string,
      filters: { status?: RecoveryCaseStatus },
    ): Promise<number> {
      return collection().countDocuments(buildPartnerOrgQuery(partnerOrganizationId, filters));
    },

    /**
     * PDM-3's unclaimed-branch narrowing applies to the claim match clause too: this
     * must only succeed against a case visible via `unclaimedCaseVisiblePredicate()`,
     * the same predicate `buildPartnerOrgQuery`/`findByIdForPartnerOrg` use, so a claim
     * can never succeed against a case this org could not also have seen via list/
     * detail. Note for §18.8(a)(1)/C-A: the caller's audited `fromStatus` for a claim
     * is always the literal `'open'`, because this match clause requires it — never a
     * value re-derived from a separate, possibly-stale pre-read.
     */
    async claimForPartnerOrg(
      partnerOrganizationId: string,
      caseId: string,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      // SR-011-1a: project police-report fields out of this write-path read-back too —
      // every partner-facing response must be built from a row that never had these
      // fields loaded. `accountId` IS fetched here (needed internally for
      // `scheduleCustomerRecoveryCaseChange` and PDM-8 audit logging) — the route layer
      // is responsible for never letting it reach the HTTP response (PDM-1), via
      // `toClaimedTierView`/`serializeClaimedTierRecoveryCase`.
      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(caseId), ...unclaimedCaseVisiblePredicate() },
        { $set: { partnerOrganizationId, status: 'investigating', updatedAt: new Date() } },
        { returnDocument: 'after', projection: POLICE_REPORT_FIELD_EXCLUSION_PROJECTION },
      );
      return result ? toCase(result as unknown as RecoveryCaseDbRow) : null;
    },

    /**
     * PDM-2/PDM-3 — tiered, two-step lookup: try the claimed-by-caller branch first
     * (Tier 1 projection), then the shared unclaimed-open pool (offer-tier projection).
     * Both branches share their predicate with `buildPartnerOrgQuery` (PDM-3 — list,
     * count and detail cannot structurally diverge) and with PDM-4's 90-day wrap-up
     * window. Returns a tagged result so the route layer picks the matching serializer;
     * `accountId` is returned alongside (never inside) `case` — see the tier types'
     * doc comments.
     */
    async findByIdForPartnerOrg(
      partnerOrganizationId: string,
      caseId: string,
    ): Promise<PartnerVisibleCaseResult | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const _id = new ObjectId(caseId);

      const claimedRow = (await collection().findOne(
        { _id, ...claimedCaseVisiblePredicate(partnerOrganizationId) },
        { projection: CLAIMED_TIER_FIELD_EXCLUSION_PROJECTION },
      )) as unknown as ClaimedTierCaseDbRow | null;
      if (claimedRow) {
        return {
          tier: 'claimed',
          accountId: claimedRow.accountId,
          createdAt: claimedRow.createdAt,
          case: toClaimedTierCase(claimedRow),
        };
      }

      const offerRow = (await collection().findOne(
        { _id, ...unclaimedCaseVisiblePredicate() },
        { projection: OFFER_TIER_FIELD_EXCLUSION_PROJECTION },
      )) as unknown as OfferTierCaseDbRow | null;
      if (offerRow) {
        return {
          tier: 'offer',
          accountId: offerRow.accountId,
          createdAt: offerRow.createdAt,
          case: toOfferTierCase(offerRow),
        };
      }

      return null;
    },

    /**
     * ADR-0006 §18.8 ruling (b), condition C-A: `expectedStatus` makes this a
     * compare-and-set on the status the caller's pre-read actually observed, not a
     * TOCTOU guess. The mutation filter now includes `status: expectedStatus`; a
     * concurrent status change between the caller's pre-read and this call causes the
     * match to miss (returns `null`), which the route layer must map to its existing
     * `NOT_FOUND` response, never a 2xx (§18.8 C-B).
     */
    async updateStatusForPartnerOrg(
      partnerOrganizationId: string,
      caseId: string,
      status: RecoveryCaseStatus,
      expectedStatus: RecoveryCaseStatus,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      // SR-009S-6 — defense-in-depth: reject a backward/sideways transition even if the
      // route layer's own check (security-cases.ts PATCH handler) were ever bypassed or
      // forgotten by a future call site. The route layer is expected to reject this
      // BEFORE writing the privileged_state_change audit row; this is a second,
      // independent guard, not the primary one.
      if (!isForwardStatusTransition(expectedStatus, status)) return null;
      // SR-review fix: a case must already be claimed by this org (partnerOrganizationId
      // must already equal the caller's org) before its status can be changed here. Claiming
      // an unclaimed case (partnerOrganizationId: null) is only permitted via
      // claimForPartnerOrg, which enforces the open -> investigating transition. Without this
      // restriction an operator could claim AND close/resolve an unclaimed case in one PATCH,
      // bypassing the investigation step entirely.
      //
      // Feature 011 / SR-011-4 + C-011-11 (security-review.md §9.2/§9.6, §10.2): `closedAt`
      // is set here, once, on FIRST entry into EITHER terminal status — `'closed'` OR
      // `'recovered'` — this is the sole status-transition write path for recovery_cases
      // today (no customer-side or admin-side close path exists). The retention clock
      // starts on entry to any terminal state per compliance-specialist's ruling: a
      // `recovered` case whose asset was found is finished, and there is no basis for
      // treating it as perpetually live merely because no operator later pressed
      // "closed". Without this, the police-report retention-expiry job
      // (database-design.md §5) would never match a `recovered`-and-never-`closed` case,
      // and the police-report triple would be retained indefinitely.
      //
      // "First entry" matters: a case can legitimately move `recovered` -> `closed`
      // (operator administratively closes a case whose asset was already recovered).
      // `closedAt` must NOT be overwritten on that second terminal transition —
      // database-design.md §5.2 already ruled out resetting the retention clock on
      // edit, and clobbering `closedAt` here would silently extend retention past what
      // the ruling intends. So this only sets `closedAt` when it isn't already set.
      const setFields: { status: RecoveryCaseStatus; updatedAt: Date; closedAt?: Date } = {
        status,
        updatedAt: new Date(),
      };
      if (status === 'closed' || status === 'recovered') {
        // Deliberately no projection here: this is an internal read used only to
        // decide whether to set `closedAt`, never returned or serialised. The
        // partner-facing exclusion projection is applied on the write-path read-back
        // below, which is what actually reaches the caller.
        const existing = await collection().findOne({
          _id: new ObjectId(caseId),
          partnerOrganizationId,
        });
        if (existing && (existing as unknown as { closedAt: Date | null }).closedAt == null) {
          setFields.closedAt = new Date();
        }
      }
      const result = await collection().findOneAndUpdate(
        {
          _id: new ObjectId(caseId),
          partnerOrganizationId,
          // §18.8 C-A: compare-and-set on the status the caller's pre-read observed.
          status: expectedStatus,
        },
        { $set: setFields },
        { returnDocument: 'after', projection: POLICE_REPORT_FIELD_EXCLUSION_PROJECTION },
      );
      return result ? toCase(result as unknown as RecoveryCaseDbRow) : null;
    },

    async getLocationForCase(
      accountId: string,
      caseId: string,
    ): Promise<LastKnownLocation | null> {
      const doc = await this.findByIdForAccount(accountId, caseId);
      return doc?.lastLocation ?? null;
    },

    async appendCallCentreNote(
      caseId: string,
      agentAccountId: string,
      text: string,
    ): Promise<RecoveryCaseDocument | null> {
      if (!ObjectId.isValid(caseId)) return null;
      const note: CallCentreNote = {
        agentAccountId,
        text,
        createdAt: new Date(),
      };
      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(caseId) },
        {
          $push: { callCentreNotes: note },
          $set: { updatedAt: new Date() },
        },
        { returnDocument: 'after' },
      );
      return result ? toCase(result) : null;
    },

    /**
     * Feature 011 (SAPS case-number capture) — customer-only. Sets/clears one or more of
     * `sapsCaseNumber` / `reportingStation` / `reportedToPoliceAt` on a caller-owned case,
     * appending one `PoliceReportChange` history entry per field that actually changed
     * value (api-design.md §2.5 — no-op suppression: a field re-submitted with the same
     * value produces no history entry and does not count against the maxItems cap).
     *
     * Read-modify-write inside the repository (not a bare `$set`) because `previousValue`
     * has to be computed from the current document — architecture-review.md §5.
     */
    async setPoliceReportFields(
      accountId: string,
      caseId: string,
      actorAccountId: string,
      changes: Partial<{
        sapsCaseNumber: string | null;
        reportingStation: string | null;
        reportedToPoliceAt: Date | null;
      }>,
    ): Promise<
      | { ok: true; case: RecoveryCaseDocument }
      | { ok: false; reason: 'not_found' }
      | { ok: false; reason: 'retention_expired' }
      | { ok: false; reason: 'history_limit_exceeded' }
    > {
      if (!ObjectId.isValid(caseId)) return { ok: false, reason: 'not_found' };
      const current = await collection().findOne({ _id: new ObjectId(caseId), accountId });
      if (!current) return { ok: false, reason: 'not_found' };

      // SR-011-2: reject rather than accept-then-silently-purge on a case whose
      // police-report retention window has already expired (database-design.md §5.3's
      // purge job would clear this on its next run with no user-visible signal).
      // C-011-11 (security-review.md §9.2/§10.2): `closedAt` is now set on entry to
      // EITHER terminal status (`'closed'` or `'recovered'`), so this check must cover
      // both — checking `status === 'closed'` only would let a PATCH succeed against an
      // already-expired `recovered` case (accept-then-silently-purge), reintroducing the
      // exact SR-011-2 failure mode via the second route.
      if (
        (current.status === 'closed' || current.status === 'recovered') &&
        current.closedAt != null &&
        !current.legalHold &&
        current.closedAt <= retentionCutoff()
      ) {
        return { ok: false, reason: 'retention_expired' };
      }

      const toDateOnlyString = (d: Date | null): string | null =>
        d ? d.toISOString().slice(0, 10) : null;

      const existingHistory = current.policeReportHistory ?? [];
      const newEntries: PoliceReportChange[] = [];
      const setUpdate: Record<string, string | Date | null> = {};

      if ('sapsCaseNumber' in changes) {
        const previousValue = current.sapsCaseNumber ?? null;
        const newValue = changes.sapsCaseNumber ?? null;
        if (previousValue !== newValue) {
          newEntries.push({
            actorAccountId,
            field: 'sapsCaseNumber',
            previousValue,
            newValue,
            changedAt: new Date(),
          });
          setUpdate.sapsCaseNumber = newValue;
        }
      }
      if ('reportingStation' in changes) {
        const previousValue = current.reportingStation ?? null;
        const newValue = changes.reportingStation ?? null;
        if (previousValue !== newValue) {
          newEntries.push({
            actorAccountId,
            field: 'reportingStation',
            previousValue,
            newValue,
            changedAt: new Date(),
          });
          setUpdate.reportingStation = newValue;
        }
      }
      if ('reportedToPoliceAt' in changes) {
        const previousValue = toDateOnlyString(current.reportedToPoliceAt ?? null);
        const newValue = toDateOnlyString(changes.reportedToPoliceAt ?? null);
        if (previousValue !== newValue) {
          newEntries.push({
            actorAccountId,
            field: 'reportedToPoliceAt',
            previousValue,
            newValue,
            changedAt: new Date(),
          });
          setUpdate.reportedToPoliceAt = changes.reportedToPoliceAt ?? null;
        }
      }

      // Nothing actually changed (every provided field was a no-op resubmission) —
      // return the current state as-is, no write, no history entry.
      if (newEntries.length === 0) {
        return { ok: true, case: toCase(current) };
      }

      if (existingHistory.length + newEntries.length > MAX_POLICE_REPORT_HISTORY_ITEMS) {
        return { ok: false, reason: 'history_limit_exceeded' };
      }

      const result = await collection().findOneAndUpdate(
        { _id: new ObjectId(caseId), accountId },
        {
          $set: { ...setUpdate, updatedAt: new Date() },
          $push: { policeReportHistory: { $each: newEntries } },
        },
        { returnDocument: 'after' },
      );
      if (!result) return { ok: false, reason: 'not_found' };
      return { ok: true, case: toCase(result) };
    },
  };
}

function retentionCutoff(): Date {
  const cutoff = new Date();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - POLICE_REPORT_RETENTION_YEARS);
  return cutoff;
}

export type RecoveryCasesRepo = ReturnType<typeof createRecoveryCasesRepo>;
