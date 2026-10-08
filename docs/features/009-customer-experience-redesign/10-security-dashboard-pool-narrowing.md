# 10. Security Company Dashboard — unclaimed-pool exposure: query/schema/serializer design

**Author:** `backend-architect`. **Date:** 2026-10-08. **Status:** design spec for `backend-engineer`,
pending a chaired Stage 8 security review and a parallel `compliance-specialist` ruling on the
pool model's lawfulness. **This document does not rule on whether the shared-pool model is lawful
or must become admin-assigned dispatch** — that ruling belongs to `compliance-specialist` per the
CTO's instruction. It designs the query/schema/API shape needed to support either outcome, with
admin-assigned dispatch as the recommended default and the current shared-pool behaviour preserved
as an explicit, documented fallback.

See also `docs/organization/adr/0006-privileged-access-audit-correlation.md` §18 for the audit-trail
design (RR-012-2) that sits alongside this one — that design is written to work unchanged under
either outcome described here.

---

## 1. What exists today, and the two problems with it

`backend/src/repositories/recovery-cases.ts:192-204` (`buildPartnerOrgQuery`):

```ts
export function buildPartnerOrgQuery(
  partnerOrganizationId: string,
  filters: { status?: RecoveryCaseStatus },
): Document {
  const statusFilter = filters.status ? { status: filters.status } : {};
  return {
    $or: [
      { partnerOrganizationId },
      { partnerOrganizationId: null, status: 'open' as RecoveryCaseStatus },
    ],
    ...statusFilter,
  };
}
```

**Problem A — universal pool visibility.** Every partner org sees *every* unassigned `open` case on
the platform, not just cases plausibly relevant to it (geography, asset type, capacity). This was
already flagged, not newly found here: `security-review.md` (Feature 012) §3.2 confirmed the query
is "deliberate and correct" as a claim-queue mechanism but recorded it as **RR-012-1** — a partner
can poll a cheap, unlogged signal that some customer somewhere reported a theft — and separately
**RR-012-2** (no audit trail at all on the routes that serve this query), which ADR-0006 §18 now
designs.

**Problem B — customer-identity disclosure pre-claim.** `serializeSecurityRecoveryCase`
(`recovery-cases.ts:175-182`) includes `accountId` unconditionally:

```ts
export function serializeSecurityRecoveryCase(doc: RecoveryCaseDocument) {
  return {
    ...serializeRecoveryCase(doc),
    accountId: doc.accountId,
    partnerOrganizationId: doc.partnerOrganizationId,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
```

An operator browsing the unclaimed pool — cases this org has not claimed and may never claim — sees
the customer's `accountId` before any relationship (claim) exists between this partner org and that
customer. Combined with Problem A, this means **every partner org on the platform can enumerate the
account identifiers of every customer with an open, unassigned theft report**, which is a materially
larger disclosure than "this org's claimed caseload."

Both problems compound: narrowing the query (Problem A) without also conditioning the serializer
(Problem B) still leaks identity for whatever remains visible; fixing the serializer without
narrowing the query still lets every org enumerate case *volume and metadata* platform-wide even if
`accountId` is withheld.

---

## 2. Recommended default: admin-assigned dispatch

### 2.1 Why this is the recommended default, not the fallback

The shared-pool model's lawfulness is compliance's call, not architecture's — but the engineering
default should be the model that fails safe if that ruling goes against the pool: an assignment
step is strictly more restrictive than a shared pool (it is a pool of size "however many orgs an
admin chooses," which can equal "all of them" as a degenerate case, but defaults to "none until
assigned"). Building the shared-pool model as the only shape and retrofitting assignment later would
require a second migration and a second Stage 8 review of the same surface; building assignment now
and keeping the pool as a config-gated fallback costs one extra field set and one branch in a query
builder that already branches on `filters.status`.

### 2.2 Schema additions — `RecoveryCaseDocument` / `RecoveryCaseDbRow`

```ts
export interface RecoveryCaseDocument {
  // ...existing fields unchanged...

  /** Admin-assigned dispatch (recommended model, §2). The partner org an admin has
   * invited to claim this case. Distinct from `partnerOrganizationId`, which only
   * ever holds the org that has actually claimed the case (set by claimForPartnerOrg).
   * Null until an admin assigns the case; an admin may reassign (clearing and
   * resetting this field) while the case remains unclaimed (`partnerOrganizationId`
   * still null) — reassignment after claim is out of scope for v1 (an already-claimed
   * case belongs to the claiming org; re-routing a claimed case is an escalation
   * workflow, not a dispatch one, and is not designed here). */
  assignedPartnerOrganizationId: string | null;
  assignedAt: Date | null;
  /** The admin account id that made the assignment — actor, for ADR-0006 AUD-1
   * parity if/when an admin-side assignment endpoint gets its own audit trail
   * (out of scope here: no `/admin/security-cases*` route exists yet). */
  assignedBy: string | null;
}
```

Bounded, append-only `dispatchHistory` (mirroring the `policeReportHistory` pattern at
`recovery-cases.ts:37-46`, capped the same way `MAX_POLICE_REPORT_HISTORY_ITEMS` caps its sibling)
is a reasonable v2 addition if reassignment-before-claim turns out to happen often enough to need an
audit of *who else* was offered a case before the eventual claimant — **not designed here**, v1 only
needs the current assignee.

**No schema change to `partnerOrganizationId`.** It keeps its existing, narrow meaning ("the org that
has claimed this case") exactly as today — this is the same discipline ADR-0006 AUD-2 applied to
`app.account_audit_log.account_id` ("keeps its existing meaning … do not repurpose it").

### 2.3 `buildPartnerOrgQuery` — dispatch-mode-aware, single shared helper preserved

C-012-3 (`security-review.md` §1/§7, restated in code at `recovery-cases.ts:184-191`: "the SAME
partner-visible filter used by both `listForPartnerOrg` and `countForPartnerOrg` … Extracted so the
two paths cannot drift apart") **must continue to hold under this change.** The fix is a single
function with a mode parameter — not two divergent query-builders, and not an `if` duplicated at each
call site:

```ts
export type RecoveryCaseDispatchMode = 'admin_assigned' | 'shared_pool';

/**
 * C-012-3: the SAME partner-visible filter used by listForPartnerOrg, countForPartnerOrg,
 * AND claimForPartnerOrg's match clause (§2.4) — narrowing this is done HERE and only here.
 * `dispatchMode` is a platform-wide config value (ctx.env, not a per-request parameter —
 * a caller-supplied dispatch mode would let a partner org opt itself into the wider pool),
 * ruled by compliance-specialist, read from one place so list/count/claim cannot disagree
 * about which model is live.
 */
export function buildPartnerOrgQuery(
  partnerOrganizationId: string,
  filters: { status?: RecoveryCaseStatus },
  dispatchMode: RecoveryCaseDispatchMode,
): Document {
  const statusFilter = filters.status ? { status: filters.status } : {};
  const visibility =
    dispatchMode === 'admin_assigned'
      ? {
          $or: [
            { partnerOrganizationId },
            { assignedPartnerOrganizationId: partnerOrganizationId, status: 'open' as RecoveryCaseStatus },
          ],
        }
      : {
          // Fallback — today's behaviour, preserved verbatim, gated behind an explicit
          // mode rather than deleted, in case compliance clears the pool model as-is.
          $or: [
            { partnerOrganizationId },
            { partnerOrganizationId: null, status: 'open' as RecoveryCaseStatus },
          ],
        };
  return { ...visibility, ...statusFilter };
}
```

`dispatchMode` is **not** a request parameter, a header, or anything caller-influenced — it is a
server-side config value (`ctx.env.RECOVERY_CASE_DISPATCH_MODE` or equivalent), read once per request
from context exactly as `ctx.recoveryCases` already is, so there is no lever by which a partner org
could request the wider view. `listForPartnerOrg` and `countForPartnerOrg` (`recovery-cases.ts:262-
294`) both pass the same `ctx`-derived mode through unchanged — this is what keeps "the list and
count must narrow together" (C-012-3) true by construction rather than by two call sites happening to
agree today.

### 2.4 `claimForPartnerOrg` — must narrow with the query, not just the list

This is the gap a query-only fix would leave: `claimForPartnerOrg` (`recovery-cases.ts:296-310`)
today matches `{ partnerOrganizationId: null, status: 'open' }` — i.e., it lets **any** org claim
**any** unassigned case, independent of what the list/count routes show them. If the list is narrowed
to admin-assigned cases but the claim match clause is not, an operator who somehow learns a `caseId`
(support ticket, log line, guesswork on a predictable id — though these are Mongo ObjectIds, not
guessable) for a case assigned to a *different* org could still claim it. The match clause must
narrow identically to the read path:

```ts
async claimForPartnerOrg(
  partnerOrganizationId: string,
  caseId: string,
  dispatchMode: RecoveryCaseDispatchMode,
): Promise<RecoveryCaseDocument | null> {
  if (!ObjectId.isValid(caseId)) return null;
  const matchClause =
    dispatchMode === 'admin_assigned'
      ? { _id: new ObjectId(caseId), assignedPartnerOrganizationId: partnerOrganizationId, status: 'open' }
      : { _id: new ObjectId(caseId), partnerOrganizationId: null, status: 'open' }; // fallback, today's behaviour
  const result = await collection().findOneAndUpdate(
    matchClause,
    { $set: { partnerOrganizationId, status: 'investigating', updatedAt: new Date() } },
    { returnDocument: 'after', projection: POLICE_REPORT_FIELD_EXCLUSION_PROJECTION },
  );
  return result ? toCase(result as unknown as RecoveryCaseDbRow) : null;
},
```

This is the write-side mirror of C-012-3: a claim must only succeed against a case this org could
also have seen via the list/count routes under the same `dispatchMode`. **Required test:** attempt to
claim a case assigned to a different org (or, in a mixed-rollout window, a case from before the mode
flag was introduced) and assert `404`, not `200`.

### 2.5 Admin-side assignment endpoint — named, not designed here

Admin-assigned dispatch needs an admin action that sets `assignedPartnerOrganizationId`/`assignedAt`/
`assignedBy`. **No `/admin/security-cases*` or `/admin/recovery-cases*` route exists in
`backend/src/routes/` today** (confirmed by grep — Feature 004's admin surface covers only
policies/assets). Designing that endpoint's full contract is out of scope for this note; it is named
here only so the dependency is visible: admin-assigned dispatch is not deployable until that endpoint
(and its own authz/audit review — an admin assigning a case to a specific commercial partner is
itself a privileged action with its own ADR-0006 Trail A disclosure, since the admin is reading/
acting on a customer's case record) exists. **This is a prerequisite, not a blocker to the design in
this document** — the schema and query-side changes above are valid and buildable regardless of
whether the assignment endpoint ships in the same release.

---

## 3. Serializer — conditional withholding of customer-identifying fields pre-claim

### 3.1 Design

`accountId` must be withheld whenever the responding case is **not yet claimed by the requesting
org** — i.e., whenever `doc.partnerOrganizationId !== callerPartnerOrganizationId`. This covers both
dispatch modes identically: in `admin_assigned` mode, a case assigned-but-not-yet-claimed to this org
still has `partnerOrganizationId: null` until `claimForPartnerOrg` runs, so it is correctly withheld
right up to the claim transition; in `shared_pool` mode (fallback), the same condition correctly
withholds identity for every pool case regardless of which org eventually claims it.

```ts
export function serializeSecurityRecoveryCase(
  doc: RecoveryCaseDocument,
  context: { callerPartnerOrganizationId: string },
) {
  const isClaimedByCaller = doc.partnerOrganizationId === context.callerPartnerOrganizationId;
  return {
    ...serializeRecoveryCase(doc),
    accountId: isClaimedByCaller ? doc.accountId : null,
    partnerOrganizationId: doc.partnerOrganizationId,
    assignedToCaller: doc.assignedPartnerOrganizationId === context.callerPartnerOrganizationId,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
```

Every call site in `security-cases.ts` must supply `context.callerPartnerOrganizationId` from
`req.auth!.partnerOrganizationId!` (already resolved by `requirePartnerOrg`, no new lookup). For
`claim` and `PATCH` responses `isClaimedByCaller` is always `true` by the time serialization runs
(the repository calls that produced `claimed`/`updated` already required
`partnerOrganizationId === caller`), so those two call sites are unaffected in practice — the
parameter is added for signature consistency with list/detail, not because claim/PATCH need new
behaviour.

**`assignedToCaller` is a new boolean, not a re-exposure of `assignedPartnerOrganizationId`.** The
raw field would let an operator infer whether a *different* named org exists (by its absence) — the
mobile/web client only needs "is this mine to claim," not which other org, if any, it might be
assigned to instead. This mirrors the same withholding discipline as `accountId`: expose the minimum
the UI needs to decide whether to show a "Claim" button, not the full assignment record.

### 3.2 What this document deliberately does not decide

- **Whether `assetId`, `referenceNumber`, or other fields also need pre-claim withholding.** The task
  calling for this design is explicit that the parallel compliance review, not this document, rules
  on "what fields should be withheld pre-claim." `accountId` is designed here because it is the field
  named in the task and the one with an unambiguous identity-disclosure reading (a UUID that
  resolves, via other privileged surfaces, directly to one customer). `referenceNumber`
  (`RC-20260101-ABCD`-shaped, `recovery-cases.ts:153-161`) and `assetId` (an opaque Mongo id with no
  attached serializer exposing VIN/serial on this path) are lower-sensitivity by construction, but
  the final list is compliance's call, not an architecture default. The serializer shape above
  (`context`-gated field-by-field) is deliberately written so that adding `assetId: isClaimedByCaller
  ? doc.assetId : null` later is a one-line change, not a redesign.
- **Whether `lastLocationAt`** (already included in `serializeRecoveryCase`, inherited by the security
  serializer) needs the same gating. It is a timestamp, not a location — the underlying `lastLocation`
  object (lat/lng) is already never serialized on this path today, in either state — but compliance
  should confirm whether "an unassigned case had a location ping as recently as 4 minutes ago" is
  itself a signal worth withholding pre-claim. Flagged, not resolved.

---

## 4. Summary of concrete changes for `backend-engineer`

1. `backend/src/repositories/recovery-cases.ts`: add `assignedPartnerOrganizationId` / `assignedAt` /
   `assignedBy` to `RecoveryCaseDocument` and `RecoveryCaseDbRow` (+ `toCase()`); add
   `RecoveryCaseDispatchMode` type; update `buildPartnerOrgQuery()` to branch on mode (§2.3); update
   `claimForPartnerOrg()` to narrow its match clause identically (§2.4); update
   `serializeSecurityRecoveryCase()` to take a `context` parameter and conditionally withhold
   `accountId` (§3.1).
2. `backend/src/routes/security-cases.ts`: thread `dispatchMode` from `ctx.env` into
   `listForPartnerOrg`/`countForPartnerOrg`/`claimForPartnerOrg`; pass `{ callerPartnerOrganizationId:
   req.auth!.partnerOrganizationId! }` into every `serializeSecurityRecoveryCase()` call.
3. `ctx` / config: add the `RECOVERY_CASE_DISPATCH_MODE` env value (or equivalent config surface),
   owned by whoever owns `backend/src/context.ts`'s env shape today; default recommended to
   `admin_assigned` once the admin-assignment endpoint (§2.5) exists, `shared_pool` until then so
   current pilot behaviour is not silently broken by a mode flip with no assignment UI behind it.
4. `compliance-specialist`: rule on pool-model lawfulness; confirm or extend the pre-claim withheld-
   field list beyond `accountId` (§3.2).
5. `cybersecurity-architect`: Stage 8 re-review of `buildPartnerOrgQuery`/`claimForPartnerOrg`
   narrowing and the serializer gating, alongside ADR-0006 §18's audit-trail design — these two
   designs are meant to land in the same Stage 9 diff and be reviewed together, since the audit
   records in §18.3/§18.4 are only as meaningful as the visibility they describe.
6. **Required tests (Stage 10, named here so they are not rediscovered late):** (a) list/count return
   identical populations under both dispatch modes for the same filters (C-012-3, now also covering
   the new mode branch); (b) claim fails `404` against a case not visible to the caller under the
   active mode; (c) `accountId` is `null` in list/detail responses for any case where
   `partnerOrganizationId !== caller`, and non-null once claimed; (d) a dispatch-mode flip with no
   data migration does not strand `shared_pool`-era unassigned cases (`partnerOrganizationId: null`,
   `assignedPartnerOrganizationId: null`) permanently invisible under `admin_assigned` mode — either
   an explicit backfill assigns them, or the admin assignment endpoint's absence is a known, accepted
   gap for the cutover window.
