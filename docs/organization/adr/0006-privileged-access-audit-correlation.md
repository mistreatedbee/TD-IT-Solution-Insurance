# ADR-0006: Privileged-Access Audit Trails Across Two Data Stores — Keep Both, Mandate the Join Key

Status: **Ratified** — `cto`, 2026-08-11 (§16), also standing in for `solution-architect`, which has no role file in `.claude/agents/` and for which `.cursor/rules/00-house-rules.mdc` names `cto` the fallback owner. Ratification carries **five `cto` rulings** (R-1 … R-5, §16) that close the shape decision and the concurrence conditions this document left open, and it is **conditional** on the four items listed at §16.5 — none of which reopens the central decision. **AUD-7(b) is ratified as a guarantee only; its specification remains open** on `compliance-specialist`'s C-13 path (§14.3, §16.4). **The security-architecture requirements AUD-1 … AUD-11 below are binding now** under `cybersecurity-architect`'s standing authority over trust-boundary and audit-architecture design (`06-security-standards.md` §Governance; the same authority under which `security-review.md` §6 ratified the session-policy table and SR-10 mandated the `privileged_data_access` event type in the first place). What awaits ratification is the ADR-level *packaging* — the platform-wide precedent this sets for every future domain's privileged-access trail — not the individual control decisions, which are mine.
Date: 2026-08-11
Deciders: `cybersecurity-architect` (proposing and deciding). Consulted: `backend-architect` (`001-authentication/api-design.md` §11.E, which named this gap and expressly declined to resolve it), `database-architect` (`004-policy-asset-management/database-addendum-001.md` §1.1, which ruled the storage-location question and expressly left the cross-domain question open). Concurrence required before this closes: `security-engineer` (AUD-8, AUD-11), `compliance-specialist` (AUD-7). Ratification: `solution-architect` + `cto`.

---

## 0. Decision, stated up front

**Option (b): the two trails stay in two stores, and are linked by a mandated, server-derived join key present identically in both.**

**The join key is *not* a request ID.** That is the finding that shaped this decision: **no single HTTP request on the platform today writes to both trails** — I verified this endpoint by endpoint (§2.2) — so a request-scoped correlation id would correlate nothing. A per-request id would have been architecture theatre: a field in two tables that never once holds the same value in both.

The unit of reconstruction that actually matters is **one admin sitting against one customer**, and the key that identifies it is:

> **(subject account id, actor identity, actor session id, timestamp within ±5 s)** — every element server-derived, none caller-supplied.

Both trails already carry actor and subject in some form. Neither carries a session id. The Postgres trail cannot currently express actor and subject at the same time. So the work this ADR mandates is small and almost entirely additive: **two new fields on each trail, zero new indexes for the correlation query itself, and one structural correction to a schema that shipped without the actor/subject separation its sibling table already has.**

A request-scoped id is still mandated (AUD-5) — but as a support/forensic tie between an audit row and the application log line for the same request, and as a pre-positioned join key for the day a single endpoint *does* touch both stores (AUD-9). It is explicitly not the cross-store correlation mechanism.

---

## 1. Numbering note — why 0006 and not 0004

`docs/organization/adr/` contains 0001–0003. 0004 and 0005 are **reserved by name in already-filed review documents** and taking either would create exactly the stale-label problem `security-review.md` §11 (FU-18) already flagged:

| Number | Reserved for | Referenced by |
|---|---|---|
| **0004** | PII deletion vs. anonymisation pattern (FU-03) | `architecture-review.md` §7, `compliance-review-supabase.md` §6.2.3 and §13, `smtp-vendor-selection.md` §9 (which considered and declined it) |
| **0005** | Platform session-token contract (FU-18, backend-minted tokens) | `api-design.md` §8 and §10, `security-review.md` §11 and §13, `003-mobile-app-foundation/architecture.md` **M-09** |

`05-development-standards.md` forbids renumbering *after* ratification. Two documented reservations plus a third unnumbered candidate (FU-08's third-persistence-surface ADR, whose original "ADR-0003" label was consumed by the hosting decision) is a numbering hazard, not a tidy sequence. **This ADR claims 0006; FU-08's persistence ADR should claim 0007.** If `solution-architect` prefers to compact the numbering, doing so is free right now — this document is unratified — and impossible later.

---

## 2. Context — what actually exists, verified in the repository

### 2.1 The two trails

| | Trail A | Trail B |
|---|---|---|
| Store | Supabase Postgres | MongoDB |
| Object | `app.account_audit_log`, `event_type = 'privileged_data_access'` | `admin_access_log` collection |
| Origin | SR-10, `security-review.md` §8 | `004/api-design.md` §3.1 → `004/database-addendum-001.md` |
| Owner | Identity Service | Policy & Asset Service |
| Shape | one `account_id` column; `event_type`, `attempted_identifier`, `ip_address`, `user_agent`, `legal_hold`, `created_at` | `actorAccountId`, `targetAccountId` (nullable), `resourceType`, `resourceId`, `endpoint`, `ipAddress`, `userAgent`, `legalHold`, `createdAt` |
| Status in code | **live.** `backend/src/repositories/audit-log.ts`, called from `routes/invitations.ts:89` and `routes/internal.ts:36`. Migration 030 added the enum value. | **paper only.** No MongoDB cluster, no collection, no `admin_access_log` writer, no `/admin/policies*` or `/admin/assets*` route exists in `backend/src/`. |
| Retention | 12 months, ratified (`compliance-review-supabase.md` §6.1, re-confirmed against FAIS) | **12 months**, ruled and recorded in `004/database-addendum-001.md` §3.3 (FU-A8/FU-A2, 2026-08-11) — ceiling with `legalHold` carve-out |

Also relevant and not yet implemented: `001-authentication/api-design.md` §11.E's `GET /v1/admin/accounts` and `GET /v1/admin/accounts/{id}`, which will write Trail A. No admin router exists in `backend/src/routes/` at all today.

**Consequence worth stating plainly: almost everything this ADR mandates lands before the code that would carry it is written.** The exceptions are the two existing call sites, which need a small field backfill. That is the cheapest possible moment, which is the entire reason this gate class exists at design time.

### 2.2 The empirical question the task asked: does any single endpoint call write both?

Every endpoint that writes, or is contracted to write, a privileged-access record:

| Endpoint | Contract | Reads from | Writes to |
|---|---|---|---|
| `POST /v1/invitations` | 001 §7 (live) | Postgres | **A only** |
| `GET /v1/internal/accounts/{id}/status` | 001 §7 (live) | Postgres | **A only** |
| `GET /v1/admin/audit-log` | 001 §7, SR-10 | Postgres | **A only** |
| `GET /v1/admin/accounts` | 001 §11.E | Postgres | **A only** |
| `GET /v1/admin/accounts/{id}` | 001 §11.E | Postgres | **A only** |
| `GET /v1/admin/policies` | 004 §6 | MongoDB | **B only** |
| `GET /v1/admin/policies/{policyId}` | 004 §6 | MongoDB | **B only** |
| `GET /v1/admin/assets` | 004 §6 | MongoDB | **B only** |
| `GET /v1/admin/assets/{assetId}` | 004 §6 | MongoDB | **B only** |

**Nine endpoints, nine single-store writes, zero overlap.** No endpoint in either contract reads across the two stores, by deliberate design — `004/api-design.md` §2/§4.3 built the domain read path to hold no Supabase credential and take no synchronous Supabase dependency, and `001/api-design.md` §11.E's field design deliberately refuses to reach into the other domain.

What *does* span both is the **Admin Dashboard page**: a "customer detail" view showing the account plus their policies and assets is three HTTP requests (`GET /admin/accounts/{id}`, `GET /admin/policies?accountId=`, `GET /admin/assets?accountId=`), each with its own request id, writing three audit rows across two stores. The fan-out is in the browser, not the server.

So the fragmentation is real at the **user-action level** and absent at the **request level**. Option (c)'s premise ("maybe no single action spans both") is false for the dashboard as designed; a per-request correlation id's premise ("one request writes both") is false for the API as designed. Both of the obvious answers are wrong for the same reason: the boundary that matters is a *sitting*, not a *request*.

### 2.3 What SR-10 was actually trying to guarantee

SR-10 exists because `06-security-standards.md` line 30 requires audit logging for *"access to another user's data by an admin/support/security-company operator"*, and `app.audit_event_type` had no value that could express it. `security-review.md` §7's authorization sweep put it sharply: *"The standard is not satisfiable with the current schema."*

SR-10's own required-change text was **never identity-scoped**: *"Emit it from `GET /v1/admin/audit-log` **and from every future admin/support/operator read of another account's data**."* And `security-review.md` §5.3 recorded the same obligation as a *binding forward constraint* for the security-company surface specifically: *"every operator access to a customer's data is an audit event (SR-10)."*

**The guarantee SR-10 was buying is subject-keyed and platform-wide: for any given customer, the platform can enumerate every privileged access to their data, by whom, when.** It is not "the identity domain keeps a log." That framing decides this ADR:

- Trail B is a **legitimate second implementation of one platform obligation**, not a competing invention. `database-architect` was right to put it in MongoDB (§3 below agrees, on independent security grounds it did not claim).
- But the obligation is only met if the **subject-keyed query works across both trails**. Today it does not — for three reasons, all of which this ADR fixes:
  1. Trail A has one `account_id` column and its two live call sites use it for opposite things (`invitations.ts` = actor, `internal.ts` = subject). A subject-keyed query over Trail A therefore returns a mixture of subjects and actors. (`api-design.md` §11.E named this; the call-site half is `authentication-engineer`'s in-flight fix, the **schema** half is unfixed and is AUD-2.)
  2. Neither trail carries anything that groups rows into one sitting.
  3. **A bulk list call records no subject at all** — Trail B's `targetAccountId` is null for an unfiltered list, and Trail A's list-call convention records the actor. An admin who pulls an unfiltered `GET /admin/policies` has read hundreds of customers' data and no row says so for any of them. That is a direct, current failure of SR-10's guarantee and is AUD-3(b). It is arguably a more serious gap than the correlation question that prompted this ADR.

### 2.4 Compliance stakes

`compliance-review-supabase.md` has already reviewed this platform once for precisely this class of gap — a log whose completeness or retention was assumed rather than established — and its findings set the standard I am applying:

- §6.3 finding 1 closed off exactly the shortcut this decision must not take: *"Supabase platform logs may never be cited as satisfying FR-12's audit-logging requirement."* A trail that exists but cannot be queried for the question you need answered is not a control. The same reasoning applies to two trails that exist but cannot be joined.
- §6.2.1's ruling that *"a vendor writing the log does not make the responsible party's retention-limitation obligation disappear"* has an exact mirror here: **a second service writing its own log does not make the platform's accountability obligation two half-obligations.**
- §6.1's model of an acceptable control is *"automated-and-evidenced enforcement rather than a policy statement."* A correlation story that lives only in a paragraph of prose is a policy statement.
- POPIA s23 (a data subject asking who accessed their information) and s22 breach-scoping both ask the subject-keyed question directly. Whether s23 obliges us to answer it is `compliance-specialist`'s determination, not mine — but the technical capability to answer it must exist either way, and it is the same capability incident response needs.

---

## 3. Why not (a) — merge the two trails into one store

Rejected. Both merge directions are security regressions, not merely operational ones.

**Merging Trail B into Postgres** (the direction `api-design.md` §11.E speculated about):

1. **It hands a Supabase credential to a service that today holds none.** `004/api-design.md` §2 states it as a property, not an aspiration: *"this service never writes to Supabase and holds no Supabase credential."* That is a structural blast-radius boundary — it is the reason a compromise of the policy/asset domain does not reach the identity store. Trading it away to co-locate a log is a bad trade, and it is the kind of trade I am chartered to refuse. `security-review.md` §2.1's TB-2/TB-3 and R-1 (*"`service_role` compromise = total identity-store compromise"*) exist precisely to keep the number of holders of that credential at one service.
2. **It makes fail-closed auditing unaffordable — and fail-closed auditing is the whole point.** AUD-10 below rules that a failed audit write must fail the request rather than return another customer's data unlogged. That ruling is nearly free today, because in *both* domains the audit write lands in the same store the read just came from: no new dependency, no new failure mode. Under a merge, `GET /v1/admin/policies` would fail closed **on Supabase availability** — a Supabase outage would take down admin policy reads that have no other reason to care about Supabase. The alternative would be to fail *open* and serve customer data with no audit record, which I will not accept. **Option (b) is what makes the strong audit-integrity ruling affordable.** That is the strongest argument in this document and it is not one either source document made.
3. It reintroduces the synchronous cross-store dependency on the admin read path that `004/api-design.md` §4.3 deliberately designed out, and `database-addendum-001.md` §1.1 reason 1 already made this point correctly.

**Merging Trail A into MongoDB** is worse and was never seriously on the table: it would move the identity domain's security-forensic record out of the only store that has a reviewed retention ruling (12 months, `compliance-review-supabase.md` §6.1), a working purge function with a `legal_hold` carve-out, a meta-audit table (`app.retention_purge_runs`), and a compliance-reviewed data classification — and it would orphan FR-12 and `GET /v1/admin/audit-log`, which read that table directly.

**A third option some would reach for — a shared "audit sink" endpoint on Identity Service that other services POST to — is prohibited (AUD-9).** It makes every domain's mandatory-audit path depend on Identity Service availability, and it opens a write route into the identity store's evidentiary table reachable with a second service's credential. `security-review.md` §2.1 already names TB-6 (`/internal/*`, static shared key) as *"the weakest boundary in the design"*; adding an evidentiary-write capability to that boundary class is the opposite of the direction SR-13 requires.

**Note on ADR-0002:** merging would have **amended a ratified ADR's data-ownership boundary** and would therefore unambiguously have required its own ADR. Option (b) does not amend it. ADR-0002 §Decision scopes Supabase's audit ownership narrowly and precisely — *"authentication audit events (login/logout/reset/MFA events per FR-12)"* — and assigns *"policies, assets, GPS/location history, and claims"* to MongoDB. A log of who read policy and asset documents is a record *about that domain's data*, not an authentication event. **Trail B was already inside ADR-0002's ruling.** This ADR therefore *clarifies* ADR-0002 by stating the corollary explicitly rather than reversing anything, and **none of ADR-0002's five revisit triggers is fired** by it.

---

## 4. Why not (c) — genuinely independent, with a documented rationale

Rejected, and the reason is not the theoretical one.

It is true that no single request spans both stores (§2.2), and a rationale of the form *"no single user action spans both domains in practice"* would have been a defensible basis for (c) — but it is **factually false for the Admin Dashboard as designed**. The Phase 1 Admin Dashboard's named need (`08-roadmap.md`: *"view customers, policies, assets"*) is a view that spans both domains by definition, and §11.E was written specifically to supply the missing third of it.

More decisively: the question incident response and compliance actually ask is not *"what did one request do."* It is:

> **"Did admin Y access customer X's data, what did they see, and when?"**

That question spans both trails inherently — the answer is partly "their account record" (Trail A) and partly "their vehicle policy and their registered assets, including the asset with a GPS device on it" (Trail B). This is the platform's highest-consequence insider scenario and it sits directly on `security-review.md` §2.3's attack-tree goal — a privileged session is *"the eventual route to real-time asset location."* An investigator who can enumerate half of what a suspect admin looked at cannot answer whether that admin was building a target list.

(c) would be acceptable only if both trails independently answered the subject-keyed question completely. **They do not** — §2.3's three defects mean the join key is not merely un-mandated, it is not *present*. Accepting (c) would therefore not be "documented acceptance of fragmentation"; it would be silent acceptance that SR-10's guarantee is unmet in the domain where the sensitive data actually lives. `security-review.md` §10's own rule applies to me here: silent risk acceptance is not permitted, and this risk is too cheap to fix to be worth accepting.

**What (c) does get right, and what this ADR keeps from it:** correlation belongs at the **application/read layer**, not in the write path. `database-addendum-001.md` §1.1's closing paragraph called it — *"an application-layer read across two stores, keyed on `actorAccountId`, which both collections already carry identically-shaped."* That is the right shape. This ADR's contribution is that the key it named is **necessary but not sufficient**, and that "already carry identically-shaped" is not true of Trail A today.

---

## 5. Decision — the mandated mechanism

Precise enough for `backend-architect` and `database-architect` to implement with no further design input from me. DDL and validator *shapes* remain `database-architect`'s to formalize; the *guarantees* below are mine and are not negotiable at the shape level.

### AUD-1 — The join key (definitional)

Both trails must carry, for every `privileged_data_access`-class record:

| Element | Trail A (Postgres) | Trail B (MongoDB) | Provenance |
|---|---|---|---|
| Subject (whose data) | `account_id` — **unchanged meaning** | `targetAccountId` | server-derived from the request's resource resolution |
| Bulk subjects (list calls) | AUD-3(b) | AUD-3(b) | server-derived from the result set |
| Actor (account) | `actor_account_id` **(new)** | `actorAccountId` | `req.auth.accountId` — signature-verified backend-minted JWT |
| Actor (service) | `actor_service` **(new)** | n/a today | `req.internalCaller` (SR-13 per-consumer identity) |
| Sitting | `actor_session_id` **(new)** | `actorSessionId` **(new)** | `req.auth.sessionId` — the `session_id` claim |
| Time | `created_at` | `createdAt` | store default / application clock, ±5 s tolerance per AUD-6 |

Reconstruction groups by `actorSessionId` and orders by timestamp. A sitting is a session, not a page view: this deliberately correlates at a coarser grain than a browser tab, because the grain that matters is "one admin's working session against one customer," and session id is the coarsest identifier that is **unforgeable** (AUD-4).

### AUD-2 — Trail A (Postgres): actor/subject separation is a schema correction, not a convention

`app.account_audit_log` must be able to record actor and subject **simultaneously**. Today it cannot, and the two live call sites consequently disagree — `invitations.ts:89` records the actor, `internal.ts:36` records the subject. No call-site convention can fix a one-column table; `api-design.md` §11.E was correct that this *"should have been caught at SR-10's own review."* It was mine to catch. It is fixed here.

**This is not a novel shape.** `app.account_state_transitions` in the same schema already carries exactly this pattern — `account_id` (subject) plus `actor_account_id` (actor, `on delete set null`, with its own partial index `account_state_transitions_actor_account_id`). `account_audit_log` simply did not get it. Proposed migration (031-series, `database-architect` formalizes):

```sql
alter table app.account_audit_log
  add column actor_account_id uuid null references app.accounts (id) on delete set null,
  add column actor_service    text null,
  add column actor_session_id uuid null,   -- soft reference to app.sessions.id: deliberately NO foreign key
  add column audit_request_id uuid null;   -- AUD-5

create index account_audit_log_actor_created_at
  on app.account_audit_log (actor_account_id, created_at desc)
  where actor_account_id is not null;
```

Binding constraints on that shape:

- **`account_id` keeps its existing meaning: the subject.** It is what `account_audit_log_account_id_created_at` and `GET /v1/admin/audit-log?accountId=` already mean, and what `on delete set null` was chosen to protect. Do not repurpose it; the actor moves to the new column.
- **`actor_session_id` carries no foreign key, deliberately.** `app.sessions.account_id` is `on delete cascade` from `app.accounts`, and `app.sessions` has its own still-open retention question (`security-review.md` §11, addendum §1.3). An FK would either cascade-delete the audit row or null out the correlation key when the session row goes away. A soft reference is the only shape that survives its referent — the same reasoning that made `account_id` `on delete set null` rather than `cascade`. Record that in a column comment so a future engineer does not "fix" the missing FK.
- **`actor_service` exists because internal callers are not accounts.** `internal.ts`'s caller is a service authenticated by `X-Internal-Service-Key`, and SR-13 requires per-consumer caller identity (`req.internalCaller` already exists in code). Without this column, every service-to-service privileged read is **unattributed** — a trail that records that customer X's status was read but not by whom.
- **Recommended `CHECK` (`database-architect`'s call, and I recommend taking it):** for `event_type = 'privileged_data_access'`, at least one of `actor_account_id` / `actor_service` must be non-null. This makes "unattributed privileged access" structurally impossible rather than something every call site has to remember — the class of control this role prefers on principle.

### AUD-3 — Trail B (MongoDB), and the bulk-disclosure hole in both trails

**(a) Two field additions** to `database-addendum-001.md` §1.2/§1.3, in the same spirit as that document's own `userAgent`/`legalHold` parity additions:

```jsonc
actorSessionId: "9f2c…",   // AUD-1. Required, non-null: every write to this collection
                            // originates from a bearer-authenticated admin request.
auditRequestId: "3b71…",   // AUD-5. Server-generated, non-evidentiary, nullable.
```

Validator: add `actorSessionId` to `required` with `bsonType: "string"`; `auditRequestId` as `bsonType: ["string","null"]`, not required. If a non-session actor (a service, a scheduled job) ever needs to write to this collection, that is a validator amendment **and** a re-threat-model trigger — it is the Mongo-side equivalent of the `actor_service` problem AUD-2 just solved, and it must not be solved by quietly relaxing `required`.

**No new index is needed for the correlation query.** Both trails' *existing* subject-side indexes are the entry points: `account_audit_log_account_id_created_at` and the partial `{ targetAccountId: 1, createdAt: -1 }` from addendum §2. The linkage costs four fields across two stores and zero index maintenance. That cost profile is a large part of why (b) beats (c) — there is almost nothing to accept a risk *about*.

**(b) Bulk list calls must record the subjects they actually disclosed.** This is the SR-10 completeness failure from §2.3(3) and it applies to **both** trails. A single row with a null/actor-only subject for a call that returned 200 customers' policies does not satisfy "enumerate every privileged access to customer X's data" for any of those 200 customers.

The **guarantee** is mine and is binding: *a subject-keyed query must return bulk disclosures as well as targeted ones.* The **shape** is `database-architect`'s. My preferred shape, symmetric across both stores and one row per call:

- Trail B: `targetAccountIds: [ "…", … ]` — the distinct account ids present in the returned page (bounded by `limit`, max 200 per `004` §5), plus `resultCount`. `targetAccountId` stays as-is for detail calls. Multikey index on `targetAccountIds` if and when the subject-keyed query needs it.
- Trail A: `disclosed_account_ids uuid[]` with a GIN index, for `GET /v1/admin/accounts` list calls. Same semantics.

The acceptable alternative, if `database-architect` prefers it, is **one audit row per disclosed subject** — which needs no new column or index on Trail A and makes the existing subject-side indexes answer the query exactly, at the cost of up to 200 inserts per list call and materially faster audit-table growth. Either is fine; **silently keeping the null-subject bulk row is not.** Capacity impact of whichever is chosen is a `cloud-infrastructure-architect` note, low risk at the Phase 1 volumes both source documents describe.

**Gate consequence:** AUD-3 blocks the Stage 8 Security Review for Feature 004 (which has not run — `004/api-design.md` P-14 still names it as outstanding) and blocks implementation of §11.E's two endpoints. Neither is implemented, so this costs schedule nothing.

### AUD-4 — Correlation identifiers are server-derived. A client-supplied id may never be a join key.

`requestIdMiddleware` (`backend/src/middleware/error-handler.ts:45`) accepts a client-supplied `x-request-id` when it is UUID-shaped — that is SR-18 working as designed, and SR-18 is unchanged by this ADR.

**But it disqualifies that value from ever being audit-correlation evidence.** The threat is not an external attacker; it is the insider my charter requires me to assume: an admin (or a partner-org security-company operator, once that surface exists) who wants their own trail to be hard to reconstruct. A caller-chosen correlation field lets them **split** one sitting into unrelated ids or **merge** their activity into a colliding id shared with an innocent session. Evidence with caller-controlled provenance is not evidence.

`actorAccountId` and `actorSessionId` come from a signature-verified, revocation-checked, backend-minted token (`middleware/authenticate.ts`) and cannot be chosen by the caller without the signing key. That is the property that makes them usable, and it is the reason FU-18's backend-minted-token ruling keeps paying dividends in places nobody predicted (`security-review.md` §6 recorded the first such case).

### AUD-5 — Record a request id in both trails, server-generated only, and never as the join key

Add to `requestIdMiddleware`, alongside the existing behaviour:

```ts
req.auditRequestId = randomUUID();   // always server-generated; never read from a header
```

`req.requestId` keeps its current SR-18 semantics (possibly client-supplied, echoed in the `x-request-id` response header and the error envelope). The structured log line for a request carries **both**. **Audit writers record only `auditRequestId`.** Cost: one line. Value: three things.

1. An investigator holding an audit row can find the application log line for that exact request, and vice versa.
2. A support ticket citing the `requestId` an admin saw in an error envelope can be tied to server-side records without trusting the client-supplied value as evidence.
3. It is the join key already in place for AUD-9's growth case, the day one request does write both trails — at which point the correlation *is* request-scoped and no schema change is needed to exploit it.

Stated explicitly so it is not misread: **`auditRequestId` is not the cross-store join key today and will never hold the same value in both trails under the current endpoint set.** Documenting that is the point; a future engineer who finds the field in two tables must not conclude it correlates them.

### AUD-6 — Clock discipline and the tolerance I am accepting

Trail A's `created_at` comes from the Supabase Postgres clock (`default now()`); Trail B's `createdAt` comes from the Node process clock on Render. Two clocks.

**Ruling: keep both, and do not introduce an application-supplied timestamp into `app.account_audit_log`.** An evidentiary row's time should come from the store that holds it, not from the caller that wrote it — accepting an app-supplied `created_at` on the audit table to buy cross-store precision would trade a stronger property for a weaker one.

**Accepted tolerance: ±5 seconds for cross-store ordering.** Ordering *within* a store remains authoritative and exact. Cross-store ordering within 5 seconds is **not asserted** and must not be relied on in an investigation or in any statement to a regulator or data subject. This is adequate because the reconstruction unit is a sitting measured in minutes, and NTP synchronisation on both platforms bounds real skew far below the tolerance. Note honestly: **NTP synchronisation on Render and Supabase is a platform default I have not verified** (same class as `security-review.md`'s OI-8 — configuration I cannot inspect from inside this repository). If a future requirement ever needs exact cross-store interleaving — "did the admin view the account before or after the location ping" — the answer is a monotonic sequence issued by one store, not a tighter clock, and that is a revisit trigger (§10), not something to bodge later.

### AUD-7 — Retention symmetry, and legal hold must cross the boundary

**(a) Reconstruction window = min(retention of Trail A, retention of Trail B).** `database-addendum-001.md` §3.3 already recommends 12 months for Trail B, matching Trail A's ratified period. I now attach a security-architecture requirement to that recommendation: **the two periods must be equal, or the resulting asymmetry must be written down as a stated limit on reconstruction.** `compliance-specialist` retains full authority to set a different number — including a different one per trail if regulation requires it — but the consequence ("privileged-access reconstruction is only possible for the shorter window") must be a documented, owned statement, not something an investigator discovers mid-incident.

**(b) A legal hold on one trail must extend to the correlated rows in the other.** Both trails carry `legal_hold`/`legalHold`, both are set manually, and neither document contemplates a hold that spans stores. A hold placed on Trail A's rows for an investigation while Trail B's correlated rows age out of retention produces a **half-preserved evidence set** — the worst possible outcome, because it looks complete. **Requirement on the C-4(b) legal-hold operational process (`compliance-specialist` process + `backend-architect` surface):** placing a hold on a privileged-access event must place it on both trails for the correlated `(actor, subject, window)` tuple. This is a process requirement, not a schema one; the fields already exist on both sides.

### AUD-8 — The reconstruction procedure must exist as a runbook, not as prose in this ADR

**Authoritative procedure (FU-A4, discharged 2026-08-11):** [`docs/organization/runbooks/aud-8-privileged-access-reconstruction.md`](../runbooks/aud-8-privileged-access-reconstruction.md). The illustrative SQL below predates R-1's closed shape; the runbook is written against one row per disclosed subject plus one call-scoped row with `result_count`.

Correlation fields with no documented procedure are theatre. **Required: a two-query reconstruction runbook, owned by `security-engineer`, in place before the first production privileged account** — the same trigger as SR-24, for the same reason (both are the human half of a control whose technical half is finished). **Not** a dashboard, not a UI, not a compliance-reporting feature: two queries and a documented merge. The concrete content:

**Subject-keyed — "every privileged access to customer X between T1 and T2":**

```sql
-- Trail A
select created_at, event_type, actor_account_id, actor_service, actor_session_id,
       ip_address, user_agent, audit_request_id
from app.account_audit_log
where event_type = 'privileged_data_access'
  and (account_id = $1 or $1 = any(disclosed_account_ids))   -- per AUD-3(b)'s chosen shape
  and created_at between $2 and $3
order by created_at desc;
```

```javascript
// Trail B
db.admin_access_log.find({
  $or: [{ targetAccountId: X }, { targetAccountIds: X }],
  createdAt: { $gte: T1, $lte: T2 }
}).sort({ createdAt: -1 });
```

Merge on `(actorAccountId, actorSessionId)`; order by timestamp with AUD-6's ±5 s caveat; group by `actorSessionId` — one group is one sitting. **Actor-keyed** ("everything admin Y looked at") is the mirror image, using `account_audit_log_actor_created_at` and Trail B's `{ actorAccountId, createdAt: -1 }`.

**Known false-positive the runbook must document:** `privileged_data_access` is currently also emitted by `POST /v1/invitations` (`invitations.ts:89`), which is a privilege-*granting* action, not a read of another account's data. It dilutes the subject-keyed query with rows that are not accesses. **Flagged to `backend-architect` + `database-architect`, not fixed here:** either a distinct event type for privilege-granting actions (my recommendation — it is a different event class with a different meaning in an investigation) or a documented filter in the runbook. This is adjacent to, but distinct from, the actor/subject call-site fix `authentication-engineer` is landing separately.

### AUD-9 — Prohibitions and the growth rule

**Prohibited without a new ADR:**

- **Dual-writing** Feature 004's admin reads into Trail A as well. That is option (a) with extra steps: same Supabase credential in the domain service, same availability coupling, plus a duplicated record to reconcile.
- **A generic "record an audit event" endpoint on Identity Service** for other services to call. §3 gives the reasons; SR-13's assessment of that boundary class is the short version.
- **Shipping either trail to a third-party log aggregator or SIEM as the correlation mechanism.** No SIEM exists; C-10 already prohibits Supabase log drains; and a third copy of privileged-access PI carries its own retention, residency (OI-3's class of problem) and access-control obligations. This *is* the right answer eventually — see §10's revisit trigger — but "eventually" means "when a SIEM is procured and reviewed," not "instead of two fields."

**Growth rule — recorded now so it is not rediscovered later.** If any future endpoint reads across both stores in one request — an admin "customer 360" aggregate view, a Security Company Dashboard case view showing account + asset + location, any GPS location read joined to account data — then:

1. it writes to **both** trails within that request;
2. both rows carry the **same `auditRequestId`** (AUD-5), which at that point becomes a genuine, exact cross-store join key;
3. it must be **re-threat-modelled before it ships** — a single endpoint that reads identity *and* asset *and* location data for one customer is a new trust boundary and the highest-value target on the platform, not an incremental read endpoint. That is my call to make and I am pre-committing to making it.

**Third-trail rule — GPS location access.** The next privileged-access trail to be built is "who looked at where a customer's asset is," and it is the platform's most sensitive access class by a wide margin (`06-security-standards.md`: location data is sensitive personal data because it reveals customer behaviour patterns). **It inherits this ADR by default:** it lives in the store that holds the data it describes (MongoDB, per ADR-0002), it carries the AUD-1 join key with identical field names and semantics, **it inherits AUD-7 — retention symmetry and cross-store legal hold — in full**, and **no new correlation mechanism may be invented for it.** Two elements of that inheritance are specific enough to this trail that leaving them implicit would defeat the lock, so they are stated here rather than left to be discovered when the trail is designed:

- **AUD-7 is inherited, but the retention *period* is not inherited as a number (C-16(a)).** AUD-7(a)'s `min()` rule applies to three trails exactly as it applies to two — which is precisely why the third period must be ruled rather than defaulted. Taking the 12 months `compliance-specialist` ruled for Trails A and B (§14.2) by silent inheritance would shorten the reconstruction window for the platform's most sensitive access class on the strength of a ruling that never considered it, and a location-access record is the one most likely to need a *long* hold — theft, recovery, criminal proceedings, fraud investigation. **The location trail's period, and therefore its effect on `min()`, are `compliance-specialist`'s ruling before that trail ships**; if the periods differ, AUD-7(a)'s documented-asymmetry requirement binds across all three trails, not just the two. AUD-7(b)'s cross-store hold requirement extends to it on the same terms, on whatever specification closes C-13.
- **A purpose / case reference is mandatory and is part of the record (C-16(b)).** AUD-1's four elements say who, whose data, which sitting, and when. None of them says *why*, and for this trail *why* is the question. The location-access trail — and **any partner-organisation operator access**, per §12's Security-Company-Dashboard trigger, whichever trail it lands in — must carry a purpose or case reference alongside the AUD-1 key: a recovery case, a theft report, a claim reference. It must resolve to a case that exists independently of the access, so that it is checkable afterwards rather than being an operator's free-text assertion at the moment of looking. These are the two classes where a read needs a *reason to exist*, where volume is low enough that capturing it costs nothing, and where the question asked afterwards is not "did they look" but "were they entitled to look **on this occasion**" — and for the partner case it is the only field that makes a POPIA s23 answer meaningful. **This does not extend to Trails A and B**, which carry no purpose field in Phase 1 by `compliance-specialist`'s proportionality ruling (§14.7): a justification prompt on every admin dashboard page view produces "investigating" ten thousand times and degrades the trail's evidential value rather than improving it. Field name and shape are `database-architect`'s, as everywhere else in §5; that the field exists and is required is mine.

`gps-integration-engineer` and `database-architect` do not need to re-litigate this; a deviation is a re-threat-model trigger, not a local design choice. This rule is the single largest reason this decision is ADR-level rather than a feature note (§6).

*(The two bulleted elements above enter AUD-9 as ratification-condition amendments **C-16(a)** and **C-16(b)** — requested by `compliance-specialist` at §14.2.5 and §14.7, accepted by `cto` at §16.4 and §16.5 item 1, and folded into my requirement text by `cybersecurity-architect` on 2026-08-11. They are amendments, not original §5 text. Nothing else in AUD-9 changes: the prohibitions and the growth rule stand as filed.)*

### AUD-10 — A failed audit write fails the request

Neither source document states what happens if the mandatory audit write fails. Ruling, for every endpoint that returns another account's data:

> **The audit write is part of the response, not a side effect. If it fails, the request fails (5xx) and the data is not returned.**

Fail-closed, consistent with SR-16's ruling that privileged-session paths do not fail open. Returning a customer's policy, asset or account data with no audit record is precisely the outcome SR-10 exists to prevent, and "the log write threw" is not a reason to make an exception. As §3 argued, this ruling is affordable **only because** each trail sits in the same store as the read it describes — the audit write introduces no dependency the read did not already have. `004/api-design.md` §4.4 already requires the write to be synchronous and pre-response; this makes its failure semantics explicit.

Ordering: write the audit record **before** serialising the response. A record of an access that then failed for another reason is a harmless false positive; an access with no record is a compliance failure.

### AUD-11 — Both trails must be append-only by *privilege*, not by convention

Extends SR-3's least-privilege principle, which covered Postgres only because Feature 001 never touched MongoDB. Both trails are evidentiary; both must be write-once for the application credential.

- **Postgres:** the SR-3 least-privilege application role gets `insert` and `select` on `app.account_audit_log` and **no `update` or `delete`**. It needs neither: purging runs inside `app.purge_expired_audit_log()`, which is `security definer` and therefore does not require the caller to hold `delete`. Setting a `legal_hold` requires `update` — that must be a **separate, human-invoked credential or a `security definer` function**, per the AUD-7(b)/C-4(b) process, not a capability the request-path role carries. `security-engineer` verifies the actual grants against this at Stage 9/13; today `SUPABASE_DB_URL` is still the project superuser (SR-3, open), so this is currently unenforced and is named as such.
- **MongoDB:** MongoDB supports per-collection action grants. The application user gets `find` + `insert` on `admin_access_log` and **not** `update`/`remove`; the future purge job (addendum §3.2) runs as a distinct user holding `remove` on that collection only. Owners: `database-architect` (role definition) + `cloud-infrastructure-architect` (Atlas configuration) + `security-engineer` (verification). This is the first Mongo-side least-privilege requirement on the platform and should be the template when other collections get the same treatment.

**Rationale:** the threat is an insider or an application-layer bug deleting the record of an access. `database-addendum-001.md` §6 correctly asserts that entries are *"immutable once written, never updated"* — this makes that assertion enforced rather than described. It also partially discharges the access-control half of the review that addendum's §9 and §6 reserved for this role.

### AUD-12 — Field-sensitivity finding for `admin_access_log` (partial discharge of P-13/P-14 for this collection only)

`database-addendum-001.md` §6 deliberately left its `cybersecurity-architect` review item unchecked. Discharging the part that concerns this collection, and only that part:

- **`ipAddress` and `userAgent` are behavioural PII about an internal user**, of the same class as `app.account_audit_log`'s existing columns, which `compliance-review-supabase.md` §2.1 has already classified. Retention-bounded (AUD-7), not encrypted at field level.
- **No field-level-encryption trigger fires.** `security-review.md` §12 set the rule: the field-level-encryption evaluation re-triggers on the first location or payment field. This collection has neither — `resourceId` is an opaque ObjectId, and the collection records *that* an asset was viewed, never *where the asset is*. **Forward constraint:** if a future location-access trail records coordinates, a route, or any derived location value rather than only a reference, that trigger fires and the evaluation happens before it ships.
- **Access control on reading the trail is not designed anywhere yet, and I am not designing it here.** No endpoint in either contract exposes either trail to a security-company operator or a support agent (`004` §4.4, ruling C8), and `GET /v1/admin/audit-log` is admin-only. The first endpoint that exposes privileged-access records to any surface needs its own review, because a trail of who accessed customer data is itself a map of internal behaviour and, in the partner-org case, would leak one organisation's activity to another. Named as a forward constraint, not covered by this ADR.
- **`004/api-design.md`'s P-14** (VIN, device serials, estimated value on `policies`/`assets`) is **not** discharged and remains outstanding for Feature 004's Stage 8.

---

## 6. Why this is an ADR, when the SMTP vendor decision was not

`integration-architect` set the precedent in `smtp-vendor-selection.md` §9: apply `05-development-standards.md`'s test — *"expensive to reverse, affects multiple teams, or sets a precedent"* — reason it out loud, and file at the proportionate level. I am applying the same test and reaching the opposite conclusion, and the inputs differ in ways worth stating so this reads as consistency rather than inconsistency.

| Test | SMTP (declined ADR) | This decision |
|---|---|---|
| Expensive to reverse? | No — one internal interface, commodity protocol, swap = credentials + DNS | **The fields, no** (additive, no data migration). **The rule, yes** — "audit ownership follows data ownership; correlation is an application-layer read on a mandated join key" is inherited by every future domain trail, and unwinding it once three or four trails exist is a genuine migration |
| Affects multiple teams? | Yes, but consumption-only | **Yes, and normatively** — binds `backend-architect`, `database-architect`, `security-engineer`, `compliance-specialist`, and pre-decides a question for `gps-integration-engineer` and the Security Company Dashboard before either role reaches it |
| Sets a precedent? | **No** — applies the existing vendor-register method to a smaller vendor | **Yes, unambiguously** — this is the platform's first ruling on how audit data behaves under ADR-0002's polyglot split, and the next trail to need it (GPS location access) is the most sensitive access class the platform will ever have |
| Governing-document signal | `CLAUDE.md` names payment gateway, GPS vendor, hosting as the ADR-weight vendor calls; SMTP is not among them | Not a vendor call at all. It is a cross-store architecture rule that **interprets and extends a ratified ADR** (ADR-0002) by declaring what its data-ownership split implies for audit data |

The asymmetry between the options is itself informative and worth recording: **the option I rejected (merge) would have required an ADR because it amends ADR-0002's ownership boundary. The option I chose does not amend it — but the rule it establishes will be inherited by name.** That inheritance is what needs to live in `docs/organization/adr/` rather than in a feature folder. The concrete failure mode I am designing against: `gps-integration-engineer` opens a Stage 6/7 design for location-access auditing in some future sprint, does not read `docs/features/004-policy-asset-management/`, and invents a third correlation scheme. An ADR plus the AUD-7/AUD-9 line in `06-security-standards.md` (§11, FU-A5) is what prevents that; a decision doc in a feature folder is not.

**If `solution-architect` or `cto` disagrees with this classification,** demoting it to a feature-level decision document is a retitle-and-move that loses none of the analysis — the mirror image of the escalation path `smtp-vendor-selection.md` §9 offered. The AUD-1 … AUD-12 requirements bind either way, under the authority named in this document's Status line.

---

## 7. Threat-model delta

Recorded here and folded into the platform threat model; `security-review.md` §2 remains the current baseline artifact for Feature 001's surfaces.

**New/changed trust boundary:** none. This ADR adds no channel, no credential, no network path, and no new store. That is a deliberate property of choosing (b) — it is the only one of the three options with a zero trust-boundary delta.

**STRIDE delta, privileged-access surface:**

| | Before | After |
|---|---|---|
| **Repudiation** | An admin's activity across the two domains is reconstructible only as two disconnected halves, and the Postgres half's actor/subject meaning is ambiguous. A bulk list call leaves no subject record at all. **This is the material gap.** | Sitting-level reconstruction across both stores on an unforgeable key; bulk disclosures subject-queryable (AUD-3(b)); unattributed privileged access structurally prevented (AUD-2's `CHECK`) |
| **Tampering** | Application credential can `update`/`delete` audit records in both stores; append-only is asserted in prose | Append-only enforced by privilege in both stores (AUD-11) |
| **Information disclosure** | Data returnable with a failed audit write (unspecified) | Fail-closed (AUD-10) |
| Spoofing / EoP / DoS | unchanged | unchanged — no new authN path, no new authZ decision, no new load-bearing dependency |

**Extension to `security-review.md` §2.3's attack tree** — new branch on `GOAL: hold a valid session for an admin / security-company-operator account`, downstream of the goal rather than a route to it:

```
POST-COMPROMISE (or malicious insider): build a target list for a physical theft
├── G1. Enumerate customers                          → GET /admin/accounts        (Trail A)
├── G2. Find high-value assets                       → GET /admin/assets           (Trail B)
├── G3. Confirm coverage / recovery posture          → GET /admin/policies         (Trail B)
├── G4. Locate the asset in real time                → NO ENDPOINT EXISTS YET  ** the one that matters **
└── G5. Evade reconstruction of G1–G4
    ├── G5a. Split the trail with per-request client-chosen ids  → CLOSED by AUD-4
    ├── G5b. Rely on bulk list calls leaving no subject record   → CLOSED by AUD-3(b)
    ├── G5c. Delete or edit own audit rows                       → CLOSED by AUD-11
    └── G5d. Rely on the two halves never being joined           → CLOSED by AUD-1/AUD-8
```

G1–G3 are detectable-after-the-fact only; nothing here prevents an authorised admin from making authorised reads, and nothing should — the control for that is least privilege plus detection, and detection requires the trail to be joinable. **G4 is the branch this platform exists to protect and no endpoint serves it yet.** When one is specified, AUD-9's growth rule and re-threat-model requirement fire, and this ADR is the reason the audit machinery it needs will already be in place.

**Hand-off to `qa-architect` / `automation-qa-engineer`** (this role's standing obligation — test cases the threat model generates, for the Stage 10 plan):

1. An admin detail read writes exactly one record carrying actor, subject, and session id — and the actor and subject are **different columns with the correct values** (regression test for the §2.3(1) defect class).
2. An unfiltered admin list read is discoverable by a subject-keyed query for a customer in the returned page (AUD-3(b)).
3. An internal service-to-service status read records a caller identity, not a null actor (AUD-2).
4. Two calls in one session share `actorSessionId`; two calls in different sessions do not (AUD-1).
5. A client-supplied `x-request-id` never appears in either trail (AUD-4/AUD-5).
6. A forced audit-write failure yields a 5xx and **no customer data in the response body** (AUD-10).
7. The application credential cannot `update` or `delete` a row in either trail (AUD-11) — this one is `security-engineer`'s to verify against real grants, not a unit test.

---

## 8. Residual risks accepted

Per this role's standing rule, silent acceptance is not permitted. Each is accepted *because* a requirement above bounds it.

| ID | Residual risk | Why accepted | Bounded by | Owner / review |
|---|---|---|---|---|
| **RR-1** | Correlation is **sitting-level, not action-level.** Two concurrent activities in one session are one group. | The forensic question is "did admin Y access customer X's data, and when," not "in which browser tab." Finer grain would require a client-supplied id, which AUD-4 prohibits for good reason. | `actorSessionId` + timestamps; AUD-9 upgrades to exact request-level joins the moment a single request writes both | `cybersecurity-architect`; revisit per §10 |
| **RR-2** | **Cross-store ordering within ±5 s is not assertable.** | Two stores, two clocks; the alternative (app-supplied timestamps on an evidentiary table) is a worse property. Reconstruction unit is minutes. | AUD-6, documented in the AUD-8 runbook so no investigation or regulator-facing statement over-claims precision | `cybersecurity-architect` + `site-reliability-engineer` |
| **RR-3** | Reconstruction is a **manual two-query procedure** with no tooling. A rushed investigation may skip it or do it wrong. | No compliance dashboard exists or is scoped; building one speculatively would be a feature nobody has asked for. | AUD-8 runbook, required before the first production privileged account (SR-24 timing) | `security-engineer` |
| **RR-4** | `privileged_data_access` is **semantically overloaded** — `POST /v1/invitations` emits it and is not a data read. Subject-keyed queries return false positives until split. | Pre-existing (SR-10's own doing, mine to own); harmless in the safe direction (over-inclusive, not under-inclusive). | AUD-8's documented filter; recommendation to `backend-architect`/`database-architect` to split the event type | `backend-architect`; next contract version |
| **RR-5** | **Two purge jobs and two legal-hold mechanisms.** A hold correctly applied in one store and missed in the other yields a half-preserved evidence set that looks complete. | Inherent to (b); the alternative is (a), whose costs §3 rejects. | AUD-7(b) makes cross-store hold an explicit requirement of the C-4(b) process rather than an assumption | `compliance-specialist` + `database-architect` |
| **RR-6** | **AUD-11 is currently unenforced on both sides** — `SUPABASE_DB_URL` is still the project superuser (SR-3, open), and no Mongo cluster or role exists yet. | Both are pre-existing open items with owners, not new exposure created here. | SR-3 (Postgres, `[S9]`), AUD-11 (Mongo, at cluster provisioning), `security-engineer` verification at Stage 9/13 | `security-engineer` + `cloud-infrastructure-architect` |
| **RR-7** | **Architecture drift**: everything here is design. Trail B has no cluster, no collection, no writer; §11.E's endpoints have no route. | Unavoidable at design time, and being at design time is the point — this is the cheapest moment to mandate all of it. | AUD-3's gate condition on Feature 004's Stage 8; §7's QA hand-off; `security-engineer`'s design-conformance check at Stage 9 | `security-engineer`; continuous |

---

## 9. Consequences

- The platform gains a **subject-keyed, cross-store answer** to "who accessed this customer's data," which is the question SR-10 was written to make answerable, POPIA s22 breach-scoping needs, and a POPIA s23 request would ask.
- **Two stores, two audit trails, permanently** — accepted deliberately. Every future domain adds a trail rather than rows to a central one, and each must carry AUD-1's key. Correlation is always an application-layer read.
- **`app.account_audit_log` gains four columns and one index** and finally matches the actor/subject shape its sibling `app.account_state_transitions` has had since Stage 6.
- **`admin_access_log` gains two fields plus AUD-3(b)'s bulk-subject shape** before it is ever created, so `database-addendum-001.md`'s migration steps 8–10 absorb them with no second migration.
- **Feature 004's Stage 8 gains a gate condition** (AUD-3) and Feature 001's §11.E endpoints gain implementation prerequisites (AUD-2, AUD-3(b), AUD-5, AUD-10). Nothing built is invalidated; two live call sites need a field backfill.
- **`06-security-standards.md` gains a normative line** (FU-A5) so the rule binds roles that never read either feature folder.
- **A future SIEM becomes an aggregation layer, not a redesign** — both trails will already carry a common key and common field semantics.

## 10. What does NOT change

- **ADR-0002 is not amended.** Identity data and its authentication audit events stay in Supabase; policy/asset/GPS/claims data and *its* access audit trail stay in MongoDB. No revisit trigger of ADR-0002 fires. This ADR states a corollary that was already inside ADR-0002's ruling.
- **ADR-0003 is untouched.** No new service, host, process or network path.
- **`database-addendum-001.md` §1.1's MongoDB ruling stands, and I concur with it** — on its own three reasons *and* on the additional ground it did not claim (§3's fail-closed-affordability argument, which is stronger than the availability argument it did make).
- **SR-18 is unchanged.** Client-supplied `x-request-id` continues to be accepted when UUID-shaped, echoed, and logged. AUD-5 adds a second, server-only id rather than changing the first.
- **SR-10 is not superseded**; it is extended to be satisfiable across two stores, which was always its stated scope (*"every future admin/support/operator read of another account's data"*).
- **Retention periods are not set here.** `compliance-specialist` owns both numbers. AUD-7 constrains the *relationship* between them and the consequence of asymmetry, not the values.
- **No decision is made about exposing either trail to any surface.** No new endpoint, no new read path, no change to who can see audit data.

## 11. Follow-ups

| ID | Item | Owner (A) | Blocks |
|---|---|---|---|
| **FU-A1** | Migration adding `actor_account_id`, `actor_service`, `actor_session_id`, `audit_request_id` + the actor index (+ AUD-3(b)'s bulk-subject shape and AUD-2's recommended `CHECK`) to `app.account_audit_log` | `database-architect` | Implementation of `GET /v1/admin/accounts*` (§11.E); backfill of the two live call sites |
| **FU-A2** | `admin_access_log` shape/validator updated for `actorSessionId`, `auditRequestId`, AUD-3(b); addendum §1.2/§1.3/§2 amended in place | `database-architect` | **Feature 004 Stage 8 Security Review** |
| **FU-A3** | `req.auditRequestId` in `requestIdMiddleware`; audit writer signature extended (actor, actor service, actor session, audit request id, disclosed subjects); the two live call sites updated to the new field semantics — coordinated with `authentication-engineer`'s in-flight actor/subject fix so it is one change, not two | `backend-architect` (contract) + `backend-engineer` / `authentication-engineer` (impl) | AUD-1 being real rather than schema-only |
| **FU-A4** | AUD-8 reconstruction runbook, both directions, with the RR-4 filter documented | `security-engineer` | Before the first production privileged account (SR-24 timing) |
| **FU-A5** | One normative line in `06-security-standards.md` §"Data protection & privacy": *a privileged-access audit trail lives in the store that holds the data it describes, carries the platform join key (subject, actor, actor session, timestamp), is append-only by privilege, and fails closed.* | `cybersecurity-architect` (on ratification of this ADR) | The rule binding roles that read neither feature folder — the GPS case |
| **FU-A6** | AUD-11's Mongo role split (`find`+`insert` for the app user, `remove` for the purge user) defined and applied at cluster provisioning | `database-architect` + `cloud-infrastructure-architect`, verified `security-engineer` | Append-only being enforced rather than asserted on Trail B |
| **FU-A7** | AUD-7(b) cross-store legal-hold requirement folded into the C-4(b) hold process | `compliance-specialist` (process) + `backend-architect` (surface) | Go-live, with C-4(b) |
| **FU-A8** | Retention period for `admin_access_log`, and confirmation the two trails' periods are equal or the asymmetry documented (AUD-7(a)) | `compliance-specialist` | Feature 004's purge job; usable reconstruction window |
| **FU-A9** | Split `privileged_data_access` so privilege-*granting* actions are a distinct event type (RR-4) | `backend-architect` + `database-architect` | Nothing today; precision of the subject-keyed query |

**Status of this table at ratification (`cto`, §16) — the table itself is left as originally filed:**

| ID | Status |
|---|---|
| FU-A1 | **Applied** — `migrations/032` (enum values) + `migrations/033` (columns, comments, `CHECK`s, `account_audit_log_actor_created_at`) on the live Supabase project (2026-08-11). Explicitly additive to 031 per `security-engineer` (a). Carries R-1's shape decision in its header comment. |
| FU-A3 | **Implemented and deployable** — `req.auditRequestId`, the extended writer (`record`, `recordBulkDisclosure`), and both live call sites. Migrations 032–033 applied 2026-08-11. |
| FU-A5 | **Discharged** — filed by `cybersecurity-architect`, 2026-08-11, as two bullets in `06-security-standards.md` §"Data protection & privacy": the store/join-key/append-only/fail-closed rule, and the third-trail inheritance as amended by C-16(a)/(b), both citing this ADR. *(Row updated post-ratification by `cybersecurity-architect`; as filed at ratification it read: "**Live obligation** on `cybersecurity-architect` as of ratification (§16.7 R-5).")* |
| FU-A8 | **Discharged** by `compliance-specialist` (§14.9): 12 months, both trails. |
| FU-A9 | **Discharged** by `cto` ruling R-2 (§16.2) — pulled forward rather than deferred; RR-4 closes structurally. |
| FU-A4 | **Discharged (document)** — filed by `security-engineer`, 2026-08-11, at [`docs/organization/runbooks/aud-8-privileged-access-reconstruction.md`](../runbooks/aud-8-privileged-access-reconstruction.md). Written against R-1's shape; both reconstruction directions; RR-4 via `privilege_granted` / `event_type`, not the null heuristic. **Not executable in production until FU-A11** (§16.5 item 2). |
| FU-A2 | **Discharged** — `database-addendum-001.md` Amendment A1 completed by `database-architect`, 2026-08-11: shape/validator (§1.3), AUD-11 role split (§1.4), indexes (§2), 12-month retention (§3.3), migration list (§4), checklist (§6), handoff (§7). Paper design only — no collection/writer/route yet. R-1 accepted with no objection. |
| FU-A6, FU-A7 | Open, unchanged owners. |
| FU-A10 … FU-A12 | New at ratification — §16.6. |
| FU-A13, FU-A14 | **New post-ratification — §17.6.** FU-A13: Trail A's subject-side and purge indexes were designed at `001-authentication/database-design.md` §3 but never migrated until `034` (applied 2026-08-11 — §17.8); §16.1's and §5's "existing index" claims are corrected at §17.1. Purge scheduling and deploy-time schema check still open. FU-A14: AUD-9's mandatory purpose/case reference (C-16(b)) has no case entity to resolve against, and none is planned — §17.3. |

*(Verification note, `cto` 2026-08-11, §17: the FU-A1, FU-A2, FU-A4 and FU-A5 rows above were checked against the artifacts and the live database rather than accepted as filed. All four hold. FU-A1's migrations are applied and catalog-verified; FU-A2's Amendment A1 carries the validator, indexes, retention and migration list it claims; FU-A5's two bullets are in `06-security-standards.md` with C-16(a)/(b) folded in; FU-A4's runbook exists and is written against R-1's shape. Re-checked at end of session: `GET /v1/admin/accounts` now exists and calls `recordBulkDisclosure()`, so §16.8's "no live bulk call site" no longer holds — §17.7. FU-A13 indexes applied via migration `034` same day — §17.8.)*

## 12. Revisit triggers

- **A single endpoint reads across both stores in one request** → AUD-9's growth rule applies, `auditRequestId` becomes an exact join key, and the endpoint is re-threat-modelled before it ships.
- **A third privileged-access trail is proposed with a different correlation scheme** — in particular a GPS/location-access trail. It should inherit AUD-1 unchanged; a proposed deviation reopens this ADR rather than being settled locally.
- **An exact cross-store ordering requirement appears** (e.g. proving an admin viewed an account before or after a location event) → RR-2's tolerance is no longer adequate; the answer is a monotonic sequence issued by one store, not a tighter clock.
- **A SIEM or centralised log platform is procured and security-reviewed** → aggregating both trails becomes the right answer and this ADR's AUD-9 prohibition is lifted, by amendment.
- **The Security Company Dashboard gains any data-read endpoint** → a partner-org actor enters this trail, partner-org scoping must appear in the join key's actor side, and `security-review.md` §5.3's re-threat-model commitment fires.
- **`compliance-specialist` sets materially different retention on the two trails**, or a regulator/data-subject request demands a reconstruction the AUD-8 procedure cannot produce → reopen AUD-7.
- **Trail A or Trail B is proposed to move stores** → that *does* amend ADR-0002's boundary and needs its own ADR, not an amendment to this one.

## 13. Pre-Approval Checklist (`cybersecurity-architect` self-review)

- [x] **Threat model updated for this change's data flows and trust boundaries.** §7 — STRIDE delta plus a new post-compromise attack branch. **No new trust boundary is created**, which is a deliberate property of the chosen option.
- [x] **All new/changed trust boundaries follow zero-trust.** None are added. AUD-4 tightens an existing one by ruling that caller-supplied values may not serve as audit evidence.
- [x] **Sensitive data classification confirmed with `compliance-specialist`.** `compliance-review-supabase.md` §2.1's classification is accepted as the input; AUD-12 classifies `admin_access_log`'s own fields and records the location/payment re-trigger. **AUD-7's retention question remains `compliance-specialist`'s** and is filed as FU-A8 rather than assumed.
- [x] **Encryption at rest and in transit specified for any new data store or channel.** No new store or channel. Both existing stores encrypt at rest by platform default; no field-level-encryption trigger fires (AUD-12).
- [x] **Third-party access scoped to least privilege with audit logging.** AUD-11 extends least privilege to both trails and is the first Mongo-side requirement of its kind. **The Security Company Dashboard still has no data access**, so its trail is a forward constraint (AUD-9, AUD-12), not a control I can sign today — said plainly rather than implying coverage.
- [x] **Account-takeover and session-hijack scenarios considered.** §7's post-compromise branch is exactly this: the ADR does not prevent a compromised admin session from reading data, and says so; it makes what that session did reconstructible and makes the four evasion routes structurally unavailable.
- [x] **Residual risks documented with accountable owners.** §8, seven risks, each with an owner and a bounding control. None is a disguised open question.
- [x] **`security-engineer` and `compliance-specialist` have concurred.** **Both have now filed** — `compliance-specialist` at §14 (AUD-7(a) concurred as corrected; **AUD-7(b) non-concurred as written**, C-13 named as the path; AUD-3 concurred with five conditions) and `security-engineer` at §15 (qualified concurrence on AUD-8/AUD-11, four implementation-fidelity conditions). Neither concurrence is unconditional and this checkbox does not pretend otherwise: the open conditions are dispositioned individually at §16.4, and the two that were genuinely blocking — the AUD-3(b) shape choice and RR-4's missing discriminator — are closed by `cto` rulings R-1 and R-2.

**Net:** eight of eight satisfied at the checklist level, with the residue tracked as named conditions at §16.4/§16.5 rather than as a satisfied box hiding an open question. **Original text of this item, before the concurrences landed, for the record:** *"Not yet — and this document does not claim it."*

---

## 14. `compliance-specialist` concurrence — AUD-7(a) concurred with a correction; **AUD-7(b) NON-CONCURRED as written**; AUD-3 concurred with conditions

**Author:** `compliance-specialist` · **Date:** 2026-08-11 · **Scope of this section:** the concurrence the Status line and §13's final checklist item name as required from this role (AUD-7), plus the AUD-3 assessment through a compliance lens as distinct from the correlation question. `security-engineer`'s concurrence on AUD-8/AUD-11 is not covered here and remains outstanding.

### 14.0 Verdict, stated up front

| Item | Verdict |
|---|---|
| **AUD-7(a)** — retention symmetry, `min(A, B)` | **CONCUR**, with one correction the ADR could not have known to make: the "ratified 12 months" it leans on was ratified for a *different event class* than the one this ADR correlates. Corrected and ruled at §14.2, which discharges **FU-A8**. |
| **AUD-7(b)** — legal hold must cross the boundary | **NON-CONCUR as written.** The *guarantee* is exactly right and I would have asked for it if it were absent. The *specification* does not close the gap it names, for four reasons (§14.3), one of which makes it unimplementable on Trail B as AUD-7(b) and AUD-11 compose. Four concrete amendments convert this to concurrence; none is expensive and all land before any code. |
| **AUD-3** — is the bulk-no-subject gap a POPIA exposure in its own right? | **Yes, independently of correlation.** §14.4. It would be a POPIA exposure if there were only one trail. The ADR's own sentence — *"arguably a more serious gap than the correlation question that prompted this ADR"* — is correct, and I am upgrading "arguably" to "yes." |
| **AUD-3's fix** | **CONCUR with the guarantee**, insufficient without five additions (§14.5). Most consequentially: the two shapes AUD-3(b) offers are **not compliance-equivalent**, and AUD-3's "either is fine" is true for the architecture and not true for me. |
| Two larger gaps neither AUD-3 nor AUD-7 reaches | §14.6. Both are unlogged bulk PII access of exactly AUD-3's species, in places AUD-3 does not reach. Named, owned, not fixed here. |

**What this section is not:** it is not a Stage 8 gate sign-off for any feature. It is the AUD-7 concurrence plus new conditions that attach to Feature 004's Stage 8 and to go-live, continuing `compliance-review-supabase.md`'s condition register at **C-13 … C-18** (§14.8).

### 14.1 Regulatory scope for this ADR — determined, not inherited

Recording this because this role's standing rule is that no document silently inherits a regime, and because the ADR reasons about POPIA s22/s23 without stating that the applicability determination had been made.

- **POPIA applies to both trails.** Confirmed regime per `compliance-review-supabase.md` §"Governing framework" (Feature 001 Stage 1 §9 and Feature 002 §12.0, both ratified by the platform owner). Both trails process personal information of (a) customers as subjects and (b) our own staff and, prospectively, partner-organisation operators as actors. **The ADR's use of POPIA as the operative regime is correct and I am ratifying it rather than letting it stand as an assumption.**
- **GDPR: not applicable today; forward hedge unchanged** (`compliance-review-supabase.md` §4.5). One consequence specific to this ADR, recorded so it is not rediscovered: if the GDPR reopening trigger fires, **the AUD-3 gap gets materially worse, not merely differently regulated.** POPIA s22's clock is *"as soon as reasonably possible after discovery"* — elastic, judged after the fact. GDPR Art 33's is **72 hours**, fixed. A breach whose affected-subject set cannot be enumerated because bulk reads recorded no subject is survivable against an elastic clock and is not survivable against a fixed one. That raises the priority of AUD-3(b) under a trigger the org has already told itself is possible.
- **PCI-DSS: out of scope for both trails, and I checked rather than assuming.** Neither trail carries or references payment data; `admin_access_log`'s `resourceType` is constrained to `policy | asset` by its validator, and Trail A's event types are authentication and privileged-access events. **Forward constraint worth pre-positioning, because it cuts against the ceiling this ADR is built on:** if a privileged-access trail is ever added over a payments admin surface, PCI-DSS v4.0 requirement 10.5.1 imposes a **retention floor of at least 12 months, with the most recent 3 months immediately available for analysis**. That is a *floor* where POPIA s14 gives us a *ceiling*, and the two happen to meet exactly at 12 months — which is luck, not design. A payments-surface trail must therefore not be given a shorter period on s14 minimisation grounds without my review, and AUD-7(a)'s `min()` rule would, applied naively across a payments trail and a shorter one, produce a PCI-DSS violation rather than a documented limitation. Recorded as **C-18**.
- **Insurance-regulatory:** no FAIS or Insurance Act recordkeeping floor attaches to either trail — see §14.2. The Joint Standards' IT-governance expectations on privileged-access oversight are relevant to §14.6's direct-database-access finding, not to the trails themselves, and remain inside `compliance-review-supabase.md` C-11's unowned outsourcing-governance gap.

### 14.2 AUD-7(a) — concurred, with a correction, and FU-A8 discharged

**Concurrence on the rule itself.** `min(retention A, retention B)` is the correct framing, and the requirement that an asymmetry be *"a documented, owned statement, not something an investigator discovers mid-incident"* is the same standard I applied at `compliance-review-supabase.md` §6.4 to the backup tail (*"a normal, defensible position under s14 — but only if it is stated"*). Consistent application, and I concur.

**The correction.** AUD-7(a) and §2.1 both describe Trail A's 12 months as ratified and treat only Trail B's number as open. That is half right in a way that matters:

- My §6.1 ruling was **table-scoped** in its wording (*"RE-CONFIRMED for `app.account_audit_log`"*), so 12 months does literally attach to any row in that table.
- But my §6.1.1 **reasoning** was **event-class-scoped**: it discharged the FAIS question specifically for *"authentication telemetry — failed login attempts, MFA challenge outcomes, session revocations, rate-limit trips"*, on the ground that these are security-operations records and not records of a financial service rendered. `privileged_data_access` **did not exist when I wrote that** — SR-10 created it afterwards, and migrations 030/031 added it to a table whose retention I had ratified for a different class of record.
- So a new class of record was added under an existing clock without anyone re-running the analysis. That is a small instance of exactly the failure mode this ADR exists to prevent, and it is mine, not `cybersecurity-architect`'s.

**Ruling, made now rather than filed (this discharges FU-A8 and answers `database-addendum-001.md` §3.3's two open questions):**

1. **`privileged_data_access` records retain for 12 months on Trail A, and `admin_access_log` retains for 12 months on Trail B.** The two periods are therefore **equal**, AUD-7(a)'s equality condition is satisfied in substance, and no asymmetry statement is required. `database-architect` may build Feature 004's purge job on 12 months and should record this ruling in `database-addendum-001.md` §3.3, replacing its stated-but-unratified recommendation — which I am accepting on its own reasoning (both collections answer the same question for two surfaces; platform-wide consistency absent a reason to diverge).
2. **Reasoning, so it can be reopened rather than re-guessed.** A record that an admin *read* a policyholder's policy or asset is security-operations telemetry about our own internal access, not a record of a financial service rendered, advice given, or a transaction concluded. It is therefore **not** in the class that carries a FAIS General Code / Insurance Act / PPR multi-year recordkeeping floor, and it is **not** in the class I directed toward a longer clock at §6.1.2 — `app.account_state_transitions` is there because it records an action that *changes* the customer relationship (suspension, deactivation), whereas a read changes nothing. **OI-6 (licence category) is therefore not a dependency of this ruling**, which is why I can close it today and could not close FU-04.
3. **Answering `database-addendum-001.md` §3.3's minimum-retention question directly: no. POPIA imposes no minimum retention on privileged-access logs.** s14 imposes a maximum ("no longer than necessary"). 12 months is a **ceiling with a purpose-justified carve-out (legal hold)**, not a floor. Anyone reading "12 months" as an obligation to keep records for 12 months has it backwards.
4. **Honest statement of the cost of this ruling.** Twelve months bounds our ability to answer a subject-keyed question about older periods, and insider misuse can have a dwell time longer than twelve months. I am accepting that: the alternative is retaining behavioural PI about customers *and* our own staff for longer than the security purpose requires, which is the s14 exposure. If incident experience later shows 12 months is short, an extension needs a documented purpose under s14(1)(c)/(d) and my re-ruling — **not a quiet configuration change to a cutoff constant.**
5. **AUD-7(a)'s `min()` rule must be named in AUD-9's third-trail inheritance list.** AUD-9 currently makes the location-access trail inherit *the store choice, the AUD-1 join key, and the no-new-correlation-mechanism rule* — and says nothing about retention or legal hold. With three trails, `min()` silently shortens the reconstruction window for the most sensitive access class on the platform, and a location-access record is the one most likely to need a *long* hold (theft, recovery, criminal proceedings, fraud investigation). **I am not pre-deciding the location trail's period here** — that is a separate ruling requiring the actual collection design — but AUD-9 must say that AUD-7 is inherited and that the period is my call before that trail ships, or it will default to 12 months by inheritance from a document that never considered it. **Amendment requested (§14.8, C-16).**

### 14.3 AUD-7(b) — NON-CONCURRENCE, with four specific defects

**What AUD-7(b) gets right, first, because it is most of the value:** it identified a cross-store failure mode that appears in **neither** source document, characterised it correctly (*"a half-preserved evidence set — the worst possible outcome, because it looks complete"*), and routed it to the correct process (C-4(b)) and owner. If AUD-7(b) did not exist I would be raising it as a blocking finding. My non-concurrence is about specification, not direction.

**Does it close the gap I would care about? No — it closes one of three doors into the same room.** AUD-7(b) prevents the *forgetful* operator (someone who holds one trail and does not think of the other). It does not prevent the *diligent* operator from producing the same half-preserved set, and it does not let anyone *demonstrate afterwards* that the set is complete. Four defects.

#### D1 — A boolean cannot carry hold identity, and without hold identity "the hold crossed the boundary" is unevidenceable and unliftable

Both trails carry a boolean. Nothing on either trail records **which hold** a row is held under, **who** placed it, **on what authority**, **over what tuple**, or **when it is reviewed**. Consequences, all real:

- **You cannot enumerate active holds.** You can only find rows where the boolean is true, which tells you nothing about why. There is no hold register anywhere in this platform's documents — I checked; `legal_hold`/`legalHold` appears in eight design documents and **no process document defines a hold**, which is precisely the C-4(b) gap still being open.
- **Overlapping holds silently destroy evidence on lift.** Two investigations touching the same admin and overlapping windows will hold overlapping row sets. Lifting hold #1 clears the boolean and releases rows still held by hold #2, which then age out at the next purge run. **The lift looks complete and successful.** This is the same "looks complete but isn't" failure AUD-7(b) is trying to prevent, reintroduced on the exit path rather than the entry path, and AUD-7(b) does not see it because it reasons only about *placing* a hold.
- **You cannot demonstrate completeness to a third party.** The scenario AUD-7(b) exists for ends with someone — the Information Regulator, a court, an internal disciplinary process — being told "this is the complete set of admin Y's accesses to customer X." Under D1 the only evidence for that statement is the operator's assertion that they ran the procedure. Nothing links the Trail A rows and the Trail B rows to **one hold decision**. Under `compliance-review-supabase.md` §6.1's own standard — *"automated-and-evidenced enforcement rather than a policy statement"* — and §6.3 finding 1's — *"a trail that exists but cannot be queried for the question you need answered is not a control"* — a cross-store hold that cannot be shown to have crossed the store is a policy statement. **This ADR applied that standard to correlation and then did not apply it to the hold.**

**Required:** both trails carry a **hold reference**, not only a boolean — an identifier of the hold under which the row is held (`legal_hold_ref` / `legalHoldRef`, or a hold-membership record; shape is `database-architect`'s), resolvable to a hold-register entry carrying hold id, placing authority, scope tuple `(actor, subject, window)`, both trails' row counts at placement, review date, and lift record. Multiple concurrent holds over one row must be expressible, because they will occur.

#### D2 — "This is a process requirement, not a schema one" is the sentence I disagree with

It is exactly a schema requirement, per D1. And it is also a **scheduling** requirement, per D3. AUD-7(b) reaches its "process only" conclusion from the premise *"the fields already exist on both sides."* Two problems with that premise:

- The fields exist **in designs**, not in the platform. On Trail B nothing exists at all. On Trail A, `legal_hold` and `app.purge_expired_audit_log()` live in `001-authentication/database-design.md` §2.5/§6 and its migration list; `backend/migrations/` contains **only 030 and 031**, neither of which creates the column or the function. §2.1's "Status in code: **live**" is accurate for the table and the two call sites and slightly overstates the retention machinery. This does not change the ruling — it strengthens it, because the amendments below cost nothing at this stage.
- Even granting the fields, **existence is not capability** — see D3.

#### D3 — As AUD-7(b) and AUD-11 compose, no principal on Trail B can set the field AUD-7(b) requires

AUD-11 is a good requirement and I support it. But read the two sides against each other:

- **Postgres:** AUD-11 explicitly handles this. *"Setting a `legal_hold` requires `update` — that must be a separate, human-invoked credential or a `security definer` function."* Correct.
- **MongoDB:** AUD-11 defines exactly two principals — the application user (`find` + `insert`, explicitly **not** `update`) and the purge user (`remove` only). **No principal holds `update` on `admin_access_log`.** Setting `legalHold: true` is an update. `database-addendum-001.md` §1.2 anticipated it as *"a targeted `UPDATE`, not a schema migration performed under pressure."* Under AUD-11 as written there is nothing to perform that update with.

So the union of AUD-7(b) and AUD-11 leaves the hold-placement path on Trail B **unassigned**. That is a narrow specification gap, not a design error, and the fix is one sentence — but it is precisely the kind of gap that gets discovered at 2 a.m. during the first real investigation, which is the scenario both requirements exist for. **Required:** AUD-11's MongoDB bullet gains a third principal for hold placement/lift, mirroring the carve-out its Postgres bullet already has.

**And a constraint on that principal's shape, which is mine to set because it is about the integrity of evidence:** MongoDB role privileges cannot scope `update` to a single field. A principal holding `update` on `admin_access_log` can rewrite `actorAccountId`, `targetAccountId`, `createdAt` — every field an investigation depends on. The same is true of a Postgres `update` credential on `app.account_audit_log`. **Requirement: placing or lifting a hold must not require a principal capable of altering the content of an audit record.** The mechanism is `cybersecurity-architect`'s and `database-architect`'s — a `security definer` function on the Postgres side, a controlled server-side path or a narrow authenticated admin operation rather than a raw credential on the Mongo side — but a hold-setting credential that is also an evidence-editing credential defeats AUD-11's own stated threat (*"an insider or an application-layer bug deleting the record of an access"*) at the one moment the record matters most.

**Corollary neither document states: placing and lifting a hold are themselves privileged actions on evidence and must generate their own audit records.** A hold placed and lifted with no trace is an evidence-suppression path that leaves no evidence. This belongs in the hold register and, for the Postgres side, naturally in `app.retention_purge_runs`' sibling position.

#### D4 — Nothing sequences the hold against two independent purge jobs, so the documented procedure can be followed correctly and still produce the half-preserved set

This is the defect I care about most, because it defeats AUD-7(b) *without anyone making a mistake*.

Hold placement is a manual, multi-store, non-atomic operation. Purging is two independent scheduled jobs — `app.purge_expired_audit_log()` on one side (unscheduled today, `compliance-review-supabase.md` C-4(a)) and `purgeExpiredAdminAccessLog()` on the other, run by *"an external scheduler"* per `database-addendum-001.md` §3.2 — with no coordination between them and both predicated on `legalHold == false`. An operator who holds Trail A at 02:00 and Trail B at 02:15, across a Trail B purge run at 02:10, has followed AUD-7(b) exactly and produced the outcome AUD-7(b) prohibits. Nothing detects it: the Trail A rows are held, the Trail B rows are gone, and the merged reconstruction looks like an admin who happened not to view any policies.

**Required, as two guarantees; mechanisms are `database-architect`'s and `backend-architect`'s:**

1. **No purge run may delete a row that falls within the scope of a hold placement that has begun.** Cheapest satisfying shapes: register the hold's scope tuple *before* touching either trail and have both purge jobs consult it, or make both purge jobs suspendable with suspension as step 1 of the hold procedure. I do not care which.
2. **Hold placement is not complete until verified by re-query against both trails, and the verification result — both row counts — is recorded in the hold register.** "I ran the update" is not evidence; "both trails return N and M held rows for this tuple, checked at time T" is.

**And one cheap evidencing requirement that makes a silently-failed hold visible rather than invisible:** every purge run record — `app.retention_purge_runs` and its not-yet-built MongoDB equivalent (`database-addendum-001.md` §3.2) — must record **rows skipped due to hold**, not only rows deleted. A hold that did not take shows up as an expected-nonzero skip count reading zero. This is one integer per run per trail and it converts an undetectable failure into a detectable one, which is the whole difference between a control and an intention.

#### What converts this to concurrence

AUD-7(b) amended so that: **(i)** both trails carry a hold reference resolvable to a hold-register entry, and the register exists as part of C-4(b) (D1); **(ii)** AUD-11 assigns a hold-placement principal on the MongoDB side, and on neither side is that principal capable of altering audit-record content (D3); **(iii)** the purge/hold ordering guarantee and the verify-and-record step are stated as requirements (D4); **(iv)** hold placement and lift are themselves audited (D3 corollary). All four land before any of this code exists. **I will file concurrence on the amended text without further conditions.** Until then, `compliance-review-supabase.md` **C-4(b) is extended to cover both trails** and remains a go-live blocker with me as owner — FU-A7 as written correctly assigns me the process half, and I accept it on the amended scope.

### 14.4 AUD-3 through a compliance lens — yes, it is an independent POPIA exposure

The question asked is whether the bulk-list-records-no-subject gap is a POPIA exposure *in its own right*, separate from correlation. **It is, and the test is simple: it would still be an exposure if the platform had only one trail.** Correlation is about joining two records; this is about a record that does not exist. Three hooks, in descending strength.

1. **POPIA s22 breach notification — the strongest hook, and it is an *incapacity*, not a paperwork gap.** s22 obliges the responsible party, on reasonable grounds to believe personal information has been accessed by an unauthorised person, to notify the Information Regulator **and the affected data subjects**, with sufficient information for them to take protective measures. Take the ADR's own §7 scenario: a compromised or malicious admin session pulls unfiltered `GET /admin/policies` and `GET /admin/assets`. Under the current design the platform holds one row per call with a null subject. **We cannot determine who was affected, so we cannot notify them.** The two available responses are both bad: under-notify (a direct s22 contravention, and one where the Regulator's question — "why could you not tell?" — has no good answer for a licensed insurer), or notify the entire customer base defensively, which is a disproportionate regulatory and reputational event and is itself arguably an over-disclosure. **This is not mitigated by any other control on the platform**, which is what makes it standalone rather than a corollary of the correlation question.
2. **s8 accountability and s19 security safeguards — and the misrepresentation, which I rate worse than the underlying gap.** `06-security-standards.md` line 30 states that access to another user's data by an admin/support/security-company operator is logged; `security-review.md` §5.3 records it as a binding forward constraint. As designed, that statement is **false for the highest-volume access path on the platform**. A documented safeguard that is not in force is the failure mode I have already rated most seriously twice in this platform's compliance record (`compliance-review-supabase.md` §6.2.1 on publishing a 12-month policy over an unpurged vendor table; §9.3 on privacy-notice claims), and I am rating it the same way here. Note the direction of the error: this is not over-caution, it is a control whose *coverage* was assumed from its *existence*.
3. **s23 subject access — and here I am making the determination §2.4 explicitly left to me, including the part that cuts against a broad reading.** s23 entitles a data subject to a record or description of the personal information held, **including the identities of all third parties, or categories of third parties, who have or have had access to it.**
   - **For our own admins and support agents: s23 does not oblige us to name them.** Staff acting within their employment act *as* the responsible party; they are not third parties. Anyone reading s23 as a duty to hand a data subject a list of named employees who viewed their record is over-reading it. I am recording this plainly so the platform does not build to an obligation it does not have, and so nobody later cites s23 to justify exposing internal-behaviour data (the risk AUD-12 correctly flagged in its access-control bullet).
   - **For security-company partner operators: s23 reaches them directly.** A partner organisation is a separate legal entity and a third party (or at minimum a separate operator) whose access to a customer's asset and location data is squarely within s23(1)(b)'s "categories of third parties who have had access." **So the s23 hook is a forward obligation that binds the Security Company Dashboard, not a live obligation on today's admin surface** — and it means partner-org access records must be subject-queryable to a standard that supports an actual data-subject response, which is a higher bar than internal-forensics adequacy. The ADR's revisit trigger for that surface should carry this, and §12's Security-Company-Dashboard trigger is the right place for it.
   - Practical consequence for copy: our privacy notice must not promise more than a category-level answer. Handled at C-15.

**Conclusion:** AUD-3 is correctly identified in §2.3(3) as *"a direct, current failure of SR-10's guarantee"* and correctly guessed at as *"arguably a more serious gap than the correlation question."* From my side the "arguably" is unnecessary: it is a live s22 incapacity, and it is the one item in this ADR that would justify a gate block on its own. AUD-3's gate consequence (blocking Feature 004's Stage 8 and §11.E's endpoints) is proportionate and **I am adding my own block to it** — `compliance-specialist` will not sign Feature 004's Stage 8 with bulk disclosures unrecorded, on s22 grounds independent of `cybersecurity-architect`'s.

### 14.5 Is AUD-3's fix sufficient from a compliance standpoint? Concur on the guarantee; five additions

**The guarantee** — *"a subject-keyed query must return bulk disclosures as well as targeted ones"* — is the right requirement, correctly stated at the level of an outcome rather than a shape, and it does discharge the s22 incapacity. Concurred. Five things it does not cover.

1. **The two shapes offered are not compliance-equivalent, and "either is fine" is true of the architecture and not of me.** AUD-3(b) offers `targetAccountIds: [...]` (array, one row per call) or one row per disclosed subject, and rules both acceptable. From a compliance standpoint **one row per disclosed subject is materially better on three axes**, all of which are mine:
   - **Hold granularity, which feeds straight back into AUD-7(b).** A hold placed for an investigation into customer X's data must hold any row that disclosed X. Under the array shape, that row also contains up to 199 unrelated customers, whose access records are now retained past their 12-month ceiling for a purpose that has nothing to do with them. Under the per-subject shape the hold is minimisable to X.
   - **Subject-level operations generally** — erasure, rectification, and responding to a subject-specific request — are row operations under the per-subject shape and array-element surgery under the array shape. Note the collision with AUD-11: **no principal will hold `update` on either trail** (D3), so array-element surgery is not merely awkward, it has no sanctioned path at all.
   - **Data minimisation in the log itself (s10).** A row that names 200 subjects is a row that discloses, to anyone reading the audit trail, that those 200 accounts co-occurred in one admin's page of results. Marginal, but it points the same way.
   - **Ruling: I am not overriding `database-architect`'s shape authority.** But if the array shape is chosen, two conditions attach (C-13): every hold over an array row carries a **mandatory review/expiry date** in the hold register so incidental over-retention of co-disclosed subjects cannot become indefinite, and the over-retention is **recorded as an accepted, bounded consequence** rather than discovered later. If the per-subject shape is chosen, neither condition is needed. That is the compliance price difference between the two options, stated so the choice is made with it visible — the ADR's cost comparison considered insert volume and index maintenance and did not consider this.
2. **Logging a bulk read makes it accountable; it does not make it lawful or minimal.** §7 says, correctly, that *"nothing here prevents an authorised admin from making authorised reads, and nothing should — the control for that is least privilege plus detection."* I agree as architecture and I have to add the compliance half: **s10 minimality and s13 purpose specification apply to our own internal processing, not only to collection.** "Any admin or support role can retrieve 200 customers' policy and asset records in one call, and we detect it afterwards" is a thin posture for a licensed insurer whose asset records point at GPS-tracked property. **Feature 004 Stage 8 conditions (C-14):** (a) the business purpose of the unfiltered list endpoints is documented — who needs an unfiltered customer-wide list, for what task; (b) those endpoints are restricted to a specific named admin role rather than available to every privileged role, and support-agent and partner-org roles are excluded by default; (c) **recommended, not mandated:** require a filter or search criterion for all but one narrowly-held role, so bulk disclosure of the whole customer base is a capability someone holds deliberately rather than a default of being logged in. Detection is a legitimate control — it is not the *only* control s19 expects, read against this data.
3. **Prohibition on how "what was disclosed" gets recorded — do not import customer PII into the trail.** AUD-3(b) requires recording disclosed *subjects*. When it is implemented, the obvious adjacent move is to record the **query that produced them** — the `?accountId=`, the search term, the filter values. `database-addendum-001.md` §1.2 deliberately records `endpoint` as a literal method+path template and decomposes nothing, so today no query values are captured. **Ruling: query and filter *values* may not be recorded verbatim in either trail without my field-sensitivity review.** An admin search term on this platform is routinely a customer's name, email, VIN or device serial — Trail A already carries one instance of this class in `attempted_identifier`, which I classified as PI about people who may not even be customers. Capturing search values would expand both trails' PI footprint, create a new classification and retention surface inside the evidence store, and (worst case) capture identifiers of *non*-subjects who were searched for and not found. **If a filter-capture requirement emerges for insider detection — and there is a real detection argument, since a target-list-building admin's searches are the signal — the compliant shape is to record which filter fields were used, not their values.** Recorded as C-17. This is a forward constraint AUD-12 does not cover; AUD-12 classified `ipAddress`/`userAgent` and correctly set the location/payment re-trigger, but query criteria are a third category.
4. **One implementation-ordering clarification, because a naive reading makes AUD-3(b) and AUD-10 mutually unsatisfiable.** AUD-10 requires the audit write *"before serialising the response."* AUD-3(b) requires the write to name the subjects actually disclosed, which are known only after the query has been materialised. The correct and intended sequence is **query → materialise result → derive disclosed subjects → write audit → serialise response**, and it is compatible. Worth one sentence in the AUD-8 runbook or FU-A3's contract note, because an implementer optimising for "audit first, then work" would break AUD-3(b) while believing they were satisfying AUD-10.
5. **Zero-result and error paths.** A filtered list or detail call that returns nothing discloses nothing, so it carries no s22 weight and I am not asking for it to be treated as a disclosure. But it should still produce a row (it does, under AUD-3(b)'s one-row-per-call shape) with a `resultCount` of zero, so that the *attempt* is reconstructible. Naming it so the implementer does not "optimise away" audit rows for empty results — which would blind precisely the search-pattern signal point 3 declines to capture by value.

### 14.6 Two gaps of AUD-3's exact species that neither AUD-3 nor this ADR reaches

Recorded because §2.3(3)'s framing — *unlogged bulk access to customer PII* — is broader than the endpoint set this ADR governs, and because per this role's rules I may not leave an exposure I have identified sitting in my own head.

1. **Direct database access is unlogged bulk PII access, and it is larger than the gap AUD-3 closes.** Both trails are written by application code on the API path. Nothing records a read that does not go through the API:
   - **Postgres:** `SUPABASE_DB_URL` is still the project superuser (SR-3, open; RR-6 acknowledges this but frames it as a *tampering* risk, not as an unlogged-*read* path). Anyone holding it reads every account, every audit row and every invitation with **zero** audit records — and, under AUD-11's own threat model, can delete the evidence of having done so. The Supabase dashboard is a second such path, reached via GitHub accounts per `compliance-review-supabase.md` §5.1.2's Bucket C finding.
   - **MongoDB:** any human or tool credential with `find` on `policies` and `assets` reads the entire customer base with no `admin_access_log` row. AUD-11 constrains the *application* and *purge* users on the audit collection and says nothing about human or reporting access to the **data** collections.
   - **Reporting & Analytics is one of this platform's ten named surfaces.** A BI or analytics surface reading `policies`/`assets` out of band is, on current designs, the single largest unlogged bulk-PII-access path on the roadmap, and it is not covered by either trail, by AUD-3(b), or by AUD-9's third-trail rule (which names GPS only).
   - **Requirement (C-16, go-live, not an ADR blocker):** bulk PII access via a database credential must be either **eliminated** (no standing human direct access to production data stores; break-glass only, time-bound and approved) or **logged at the database layer**. Note the second option is a tier decision, not a code decision — MongoDB Atlas database auditing is a paid-tier feature — which lands it squarely on `compliance-review-supabase.md` §7's ruling that **plan/tier is a compliance variable, not just a cost variable**, and extends that ruling from Supabase to Atlas. Owners: `cybersecurity-architect` + `cloud-infrastructure-architect` + `security-engineer`; escalation to `cto` on the tier question. It also sits inside C-11's unowned Joint-Standards privileged-access-oversight gap.
2. **Nobody has told our staff or our partners that their access is logged.** Both trails process personal information about **internal users and, prospectively, partner-organisation operators** — actor identity, IP address, user agent, and a complete record of what they looked at and when. AUD-12 classified those fields correctly as *"behavioural PII about an internal user."* Classification is not the whole obligation:
   - Staff and partner operators are **data subjects**. The lawful basis is available and sound — s11(1)(c) (compliance with the s19 security obligation) supported by s11(1)(f) (legitimate interests) — so this is not a lawfulness problem.
   - But **s18 notification has not been given to them.** There is no internal privacy notice, no acceptable-use or monitoring notification, and no partner-contract clause anywhere in this repository telling an admin, support agent or partner operator that every record they open is logged with their identity and IP, retained for 12 months, and usable in a misconduct investigation. Using this trail in a disciplinary or misconduct process without having given that notification is the weakest link in the chain that starts with §7's insider attack tree and ends with an actual consequence for an actual insider.
   - **Requirement (C-15):** an internal monitoring/privacy notification covering both trails, delivered at onboarding and acknowledged, before the first production privileged account — **the same trigger as AUD-8's runbook and SR-24**, for the same reason (both are the human half of a control whose technical half is finished). For partner-organisation operators the equivalent must be a **clause in the partner agreement**, which is my vendor-agreement responsibility and is a Security-Company-Dashboard prerequisite. Cheap, and unrecoverable if skipped: you cannot retroactively notify someone you are already investigating.

### 14.7 The field neither trail has, and the one place it is cheap to add: purpose

This role's own audit-logging standard is *"who viewed a customer's asset location, when, **and why**."* AUD-1's join key has four elements and none of them is why. `database-addendum-001.md` §1.2 says it mirrors `policy_status_history`'s *"actor/subject/reason/timestamp"* pattern — and then the shape it defines has no reason field. Nobody removed it; it was never carried across.

**Ruling, deliberately proportionate:**

- **Trail A and Trail B, Phase 1: no purpose field required.** Forcing a justification on every admin dashboard page view produces "investigating" 10,000 times and degrades the trail's evidential value rather than improving it. `endpoint` plus the AUD-1 key is proportionate for internal admin reads of policy and asset records.
- **The location-access trail (AUD-9's third trail) and any partner-organisation operator access: a purpose / case reference is mandatory and is part of the record.** These are the two classes where a read needs a *reason to exist* — a recovery case, a theft report, a claim reference — where the volume is low enough that capturing it costs nothing, and where the question asked afterwards is not "did they look" but "were they entitled to look **on this occasion**." It is also the only field that makes the s23 answer meaningful for the partner case (§14.4), since "a security company accessed your location data 14 times" without a case reference is an alarming non-answer.
- **This must be written into AUD-9's third-trail rule now.** AUD-9 says the third trail *"inherits this ADR by default"*, that it *"carries the AUD-1 join key with identical field names and semantics"*, that `gps-integration-engineer` and `database-architect` *"do not need to re-litigate this"*, and that **a deviation is a re-threat-model trigger.** That is a well-designed lock, and as written it locks the most sensitive access class on the platform into a shape that lacks the one field it most needs — and adding it later reopens this ADR by the ADR's own rule. **Amendment requested (C-16):** AUD-9's third-trail rule states that the location-access trail carries AUD-1's key **plus a mandatory purpose/case reference**, and that AUD-7 (retention and cross-store hold) is inherited with the period being `compliance-specialist`'s ruling before it ships. Same for partner-org actors under §12's Security-Company-Dashboard trigger.

### 14.8 New conditions — continuing `compliance-review-supabase.md`'s register

Filed in that document's series so this platform keeps one condition register rather than two. `[S8-004]` = blocks Feature 004's Stage 8 Security Review; `[GL]` = go-live blocker.

| ID | Condition | Owner (A) | Blocks |
|---|---|---|---|
| **C-13** | **Cross-store legal hold is evidenceable and interlocked** (§14.3). (a) Hold register exists — hold id, placing authority, scope tuple, both trails' row counts at placement, review date, lift record; (b) both trails carry a resolvable hold reference, not only a boolean, with concurrent holds expressible; (c) no purge run may delete a row within the scope of a hold placement that has begun; (d) hold placement completes only on verified re-query of **both** trails, recorded; (e) placing/lifting a hold is itself audited; (f) the hold principal is not capable of altering audit-record content; (g) purge run records carry rows-skipped-for-hold in both stores. **Extends `compliance-review-supabase.md` C-4(b) to both trails.** If AUD-3(b)'s array shape is chosen, holds over array rows additionally carry a mandatory review/expiry date and the co-disclosed-subject over-retention is recorded as accepted and bounded. | `compliance-specialist` (register + process); `backend-architect` (surface); `database-architect` (hold reference, purge interlock, skip counts) | **[GL]**, and converts §14.3's non-concurrence to concurrence |
| **C-14** | **Bulk admin list access is purpose-documented and role-restricted** (§14.5.2) — documented business purpose for unfiltered list endpoints; restricted to a named admin role, support and partner-org roles excluded by default; mandatory-filter option considered and the decision recorded. Logging makes access accountable, not lawful. | `compliance-specialist` (requirement); `backend-architect` + `authentication-engineer` (role scoping) | **[S8-004]** |
| **C-15** | **s18 notification to the people the trails are about** (§14.6.2) — internal monitoring/privacy notification covering both trails (fields, retention, use in misconduct investigations), delivered and acknowledged at onboarding, before the first production privileged account; equivalent clause in the security-company partner agreement before the Security Company Dashboard gains any data-read endpoint. Plus a **privacy-notice line for customers** covering privileged-access records, since `compliance-review-supabase.md` §9.2's current 12-month copy speaks only of *"sign-in activity"* and does not cover records of staff or partner access. Category-level for third-party access; no promise of named-employee disclosure (§14.4). | `compliance-specialist` (copy + partner clause); `technical-writer` (production strings); `cto` (internal delivery) | **[GL]**; partner clause blocks the Security Company Dashboard |
| **C-16** | **Three amendments to this ADR's forward rules**, all cheap now and ADR-reopening later: (a) AUD-9's third-trail rule names **AUD-7** as inherited, with the location trail's retention period reserved to `compliance-specialist` before it ships (§14.2.5); (b) AUD-9's third-trail rule requires a **mandatory purpose/case reference** on the location-access trail and on any partner-org operator access (§14.7); (c) **direct/out-of-band database access to PII is eliminated or logged at the database layer** — including any Reporting & Analytics surface — with the Atlas/Supabase tier consequence escalated as a compliance variable per `compliance-review-supabase.md` §7 (§14.6.1). | (a)(b) `cybersecurity-architect` (ADR amendment); (c) `cybersecurity-architect` + `cloud-infrastructure-architect` + `security-engineer`, escalate to `cto` on tier | (a)(b) before the GPS location-access trail is designed; (c) **[GL]** |
| **C-17** | **Query and filter *values* may not be recorded verbatim in either trail** without `compliance-specialist` field-sensitivity review (§14.5.3). Search terms on this platform are routinely names, emails, VINs and device serials, including of non-subjects. If filter capture is required for insider detection, record which fields were used, not their values. Shaped like C-10 and C-12: same species of risk, one well-meaning implementation away. | `compliance-specialist` (prohibition); `backend-architect` + `database-architect` (observance) | **Standing constraint, effective immediately** |
| **C-18** | **A privileged-access trail over a payments surface reopens the retention analysis** (§14.1). PCI-DSS v4.0 req 10.5.1 imposes a ≥12-month **floor** with 3 months immediately available, where POPIA s14 gives a ceiling; the two meet at 12 months by coincidence, not design. AUD-7(a)'s `min()` rule applied across a payments trail and a shorter trail would produce a PCI-DSS violation rather than a documented limitation. No payments trail may take a period without `compliance-specialist` review. | `compliance-specialist`; `payment-engineer` (notification trigger) | **Standing constraint** |

### 14.9 What I am and am not signing, stated plainly

**Signed:** the regulatory-scope determination (§14.1, POPIA operative for both trails, GDPR hedge, PCI-DSS out of scope with a named forward trigger). AUD-7(a) as corrected, **with the 12-month period now ruled for both trails — FU-A8 discharged**, which unblocks `database-architect`'s purge job for `admin_access_log` and lets `database-addendum-001.md` §3.3 close. AUD-3(b)'s guarantee, plus my own independent s22-grounded block on Feature 004's Stage 8 until it is implemented. AUD-12's classification of `admin_access_log`'s fields, accepted as consistent with `compliance-review-supabase.md` §2.1. The ADR's reasoning at §2.4 and §3, which applied my own standards to a question I had not looked at, and applied them correctly.

**Not signed:** **AUD-7(b) as written** — the guarantee is right, the specification does not deliver it, and the four defects at §14.3 are specific and cheap to fix. **C-13 is the path to concurrence and I will file on the amended text without adding conditions.**

**Not mine and still open:** `security-engineer`'s concurrence on AUD-8 and AUD-11. §13's final checklist item remains correctly unchecked; this section supplies half of it and takes nothing on the other half. I have also not performed a Stage 8 compliance sign-off for Feature 004 here — C-14 and AUD-3(b) are conditions *on* that gate, and it has not run.

**One honest note on my own record, since this document's standard requires it of everyone including me:** the retention-scope error at §14.2 was mine. My §6.1 ruling was written table-scoped and reasoned event-class-scoped, and SR-10 then added a new event class underneath it. `cybersecurity-architect` cited my 12 months as ratified and was entitled to; the caveat was not there to read. Corrected here rather than left for an investigator to find, and the general lesson is worth a line in the retention policy when it is written: **a retention ruling states the class of record it covers, so that adding a class to an existing table is visibly a new question.**

---

## 15. `security-engineer` concurrence — AUD-8, AUD-11

*(Numbering correction, `cto`, at ratification: this section was filed as a second "## 14" alongside `compliance-specialist`'s. Renumbered to 15 with no change to its content, so §16's dispositions can cite it unambiguously. Cross-references elsewhere in this document to "§14" for the `security-engineer` concurrence should be read as §15.)*

**Verdict: qualified concurrence.** The mechanism in §5 is the right one and I concur with option (b), with AUD-1's join key, and with the shape of AUD-8 and AUD-11 as *design intent*. But neither is buildable/enforceable exactly as written today without closing four concrete gaps below — two of them against code that has already merged, not against future work. None of the four is a trust-boundary or design-level objection; all four are implementation-precision gaps of the kind this role exists to catch before they cause two engineers to build two different things. I am not withholding concurrence to reopen the architecture; I am naming what "done" for AUD-8/AUD-11 actually requires, per this role's standing rule that a control isn't real until it's verified against the running code, not the prose describing it.

### Central technical claim: re-verified, still true, one phrasing caveat

I re-ran §2.2's endpoint-by-endpoint check against the current tree rather than trusting the ADR's table:

- `backend/src/routes/invitations.ts` (`POST /invitations`, `:token/accept`), `backend/src/routes/internal.ts` (`GET /internal/accounts/{id}/status`), `backend/src/routes/session.ts`, `backend/src/routes/mfa.ts`, `backend/src/routes/auth.ts` — every `ctx.auditLog.record()` call site in the tree resolves to `backend/src/repositories/audit-log.ts`, which only ever issues one `insert into app.account_audit_log`. No route file imports or calls anything from `backend/src/db/mongodb.ts`.
- `backend/src/db/mongodb.ts` is used from exactly one place: `backend/src/routes/health.ts` (`pingMongo()` in `GET /health/ready` and `/health/live`). That's a liveness ping, not a data write, and it fires on requests that never touch Trail A either.
- No `admin_access_log` writer, collection reference, or `/admin/*` route exists anywhere in `backend/src/`.

**So: still zero overlap, confirmed against the current tree, not just the ADR's description of an earlier tree.** One phrasing correction for §2.1's status table: "Status in code: paper only. No MongoDB cluster" is now slightly stale — `backend/src/db/mongodb.ts` connects a real `MongoClient` at startup (`index.ts`) and Mongo already gates the readiness probe. That's infrastructure plumbing for Feature 004, not an audit-trail write path, and it changes nothing in §2.2's conclusion — but "no MongoDB cluster" should read "no `admin_access_log` collection, writer, or route" so a future reader doesn't mistake this for "Mongo isn't wired up yet" when it is. Cosmetic, not a finding against the ADR's reasoning.

### AUD-8 findings

1. **The runbook's own Trail A actor-keyed query cites an index that does not exist under that name or shape.** AUD-8 says the actor-keyed mirror query uses `account_audit_log_actor_created_at`. That index was proposed in AUD-2's migration snippet (`create index account_audit_log_actor_created_at on app.account_audit_log (actor_account_id, created_at desc) where actor_account_id is not null`) — but the migration that actually shipped, `backend/migrations/031_account_audit_log_actor_column.sql`, creates a differently-named, differently-shaped index: `account_audit_log_actor_account_id on app.account_audit_log (actor_account_id)` — no `created_at` column, no descending order, and it's the only index migration 031 adds. Migration 031 also adds only `actor_account_id`; it does **not** add `actor_service`, `actor_session_id`, or `audit_request_id` — the other three columns AUD-1/AUD-2 mandate — and does not add AUD-2's recommended `CHECK` constraint. This isn't a defect in 031 (it predates this ADR and correctly scopes itself to the actor/subject split alone), but it means AUD-8's runbook, read literally against the current schema, references three columns and one index that don't exist yet. FU-A1 needs to say explicitly that it is a **follow-on migration to 031**, not a restatement of it, or whoever picks up FU-A1 may reasonably (and wrongly) treat 031 as "the actor/session column work, done."
2. **AUD-8's Trail A query hardcodes one of AUD-3(b)'s two "either is fine" shapes, and the other one breaks it.** The runbook's `where (account_id = $1 or $1 = any(disclosed_account_ids))` only works if `database-architect` picks the array-column shape. If the one-row-per-disclosed-subject alternative is picked instead (AUD-3(b) explicitly leaves this open and calls both acceptable), there is no `disclosed_account_ids` column and this exact SQL fails at parse time, not just at runtime — a broken runbook is worse than no runbook, because it reads as verified when it isn't. This is precisely the "two engineers implementing it two different ways" risk: whoever writes FU-A1's migration and whoever finalizes FU-A4's runbook need to be the same decision, or explicitly handed off with the chosen shape named. Recommend: FU-A2/FU-A1 record the chosen shape in one place (the migration file's header comment, matching 031's own convention), and FU-A4's runbook is written *after* that choice exists, not against a hypothetical schema — the ADR should not read as if the runbook is already final when a load-bearing dependency of it is still an open choice.
3. **RR-4's "documented filter" has no column to filter on.** Trail A's shape (§2.1) is `account_id`, `event_type`, `attempted_identifier`, `ip_address`, `user_agent`, `legal_hold`, `created_at` — confirmed against `backend/src/repositories/audit-log.ts`'s actual `insert` column list, which matches. There is no `endpoint`/`resource_type` column (Trail B has one; Trail A doesn't). The only way to exclude `POST /v1/invitations`'s privilege-*granting* rows from a subject-keyed query today is the heuristic "`account_id is null and actor_account_id is not null`" — which happens to isolate invitation-issuance correctly *only because it is currently the sole actor-only, subject-null row type*. The moment any other actor-only row is added (and AUD-3(b)'s bulk-list fix is itself a candidate, depending on which shape is chosen), that heuristic silently starts excluding or including the wrong rows with no error, no test failure, nothing — it degrades quietly. AUD-8 should either name the heuristic explicitly and flag it as fragile-until-RR-4/FU-A9 lands, or (my preference, matching AUD-2's own "prefer a structural control over a call-site convention" reasoning) pull RR-4/FU-A9 forward so the runbook is written against a real `event_subtype` or boolean discriminator column rather than an inferred filter that nobody but this document remembers is inferred.
4. **AUD-8 specifies the two queries but not the runbook's own operational surface**, and I'm the one who'll be executing it, so I'll name what's missing rather than assume it: (a) no file path/location is named for where the runbook document itself lives — worth pinning to a convention now (e.g. alongside `docs/features/001-authentication/security-review.md`'s sibling docs, or a `docs/organization/runbooks/` location) so FU-A4 doesn't get filed in an ad hoc place; (b) no credential/access-grant path is named for *who can actually run these two queries* — AUD-11 explicitly defers read-access design on both trails as a forward constraint (AUD-12: "access control on reading the trail is not designed anywhere yet, and I am not designing it here"), which means the runbook I'm required to own may have no one holding the read grant to execute it on day one. That's a real sequencing gap, not a nitpick: FU-A4 ("before the first production privileged account") has an implicit prerequisite — a read-only investigative credential against both stores — that isn't tracked as a follow-up anywhere in §11's table. I'm flagging it as a gap in this ADR's own follow-up list, not inventing new scope: recommend a FU-A4(a) or note under AUD-12 naming that prerequisite explicitly, owned jointly with `cloud-infrastructure-architect`/`database-architect`.

None of the four is a reason to withhold concurrence on the *mechanism* — AUD-8's two-query, sitting-grouped design is sound and is what I'd have specified. They're reasons FU-A1/FU-A2/FU-A4 need to be sequenced and cross-referenced more tightly than the current text does, so the runbook that gets written matches the schema that actually ships.

### AUD-11 findings

1. **Postgres half: accurately described as currently unenforced, and I confirm that's still true.** `SUPABASE_DB_URL` being the project superuser (RR-6, SR-3) is a pre-existing open item, not new exposure from this ADR — agreed, and there's nothing in the current tree that contradicts that characterization (no least-privilege role exists yet to check grants against).
2. **The legal-hold write-path carve-out is right but has no owner tracked for the access-control half of it.** AUD-11 correctly says setting `legal_hold` needs a separate credential or a `security definer` function, distinct from the request-path role's `insert`+`select`. AUD-7(b)/FU-A7 own the *process* of when a hold gets applied cross-store; nothing in §11's follow-up table owns *building the access-controlled mechanism that applies it* to Trail A specifically, so there's a real risk that whoever implements FU-A7's process reaches for the simplest thing — granting the app role `update` on the whole table — because no follow-up item says "and that grant must go through security-engineer review before it ships." Recommend folding an explicit line into FU-A7 or AUD-11 itself: the legal-hold write mechanism's grants are reviewed by `security-engineer` before merge, not just verified after the fact at Stage 9/13 the way the rest of AUD-11 is scoped.
3. **AUD-11's verification model is a point-in-time manual check, which is a weaker property than the standard the ADR itself sets elsewhere.** §2.4 quotes `compliance-review-supabase.md` §6.1 approvingly: *"automated-and-evidenced enforcement rather than a policy statement."* AUD-2 applies exactly that standard to itself by preferring a `CHECK` constraint over a call-site convention. AUD-11 doesn't hold itself to the same bar — "`security-engineer` verifies the actual grants against this at Stage 9/13" is a manual review at two fixed checkpoints, and a grant that regresses between them (a future migration that, for some unrelated reason, does `grant update on app.account_audit_log to app_role` and nobody notices it also covers the audit table) would go undetected until the next checkpoint or an incident. This is buildable and enforceable as a *periodic* check; it is not buildable as a *continuous* one the way it's currently scoped. Recommend adding a repeatable, automated grant-assertion (a migration-time or CI/deploy-time check that connects as the runtime credential and asserts `UPDATE`/`DELETE` against both audit tables fail with permission-denied) as a concrete FU item under AUD-11/FU-A6, rather than leaving "verification" as a role-review activity that happens twice in the lifecycle and otherwise trusts the grant to hold. This is a should-fix, not a blocker — the manual check is real and better than nothing — but as written it doesn't meet the bar the ADR sets for itself two sections earlier.
4. **Mongo half is fine as written and has nothing implemented yet to check it against**, consistently disclosed as RR-6/FU-A6. No objection to the shape (`find`+`insert` for the app user, `remove` only for a distinct purge user) — it's the correct minimal grant set and mirrors the Postgres pattern once it exists.

### Concurrence

**I concur with AUD-8 and AUD-11 as architecture-level requirements — the guarantees are right, proportionate, and mine to enforce.** I do not concur that either is currently *fully specified* to the point where two engineers picking up FU-A1/FU-A2/FU-A4/FU-A6 independently would build the same thing; items 1–2 above are concrete inconsistencies against already-merged code (`backend/migrations/031_account_audit_log_actor_column.sql`), not speculative risk. My concurrence is conditioned on: (a) FU-A1 being scoped explicitly as additive to, not a restatement of, migration 031, including the missing `actor_service`/`actor_session_id`/`audit_request_id` columns and the correctly-named/shaped index; (b) the AUD-3(b) shape decision being made and recorded before AUD-8's runbook is finalized, not in parallel with it; (c) RR-4's filter being backed by a real column before it's relied on in an actual investigation, or at minimum flagged as a known-fragile heuristic in the runbook text itself; and (d) AUD-11's grant verification being upgraded from a two-checkpoint manual review to an automated, repeatable assertion before I'd sign off on it as "enforced" rather than "checked." None of these require reopening the ADR's central decision (option (b), the join key, the trail ownership split) — they're implementation-fidelity conditions on FU-A1, FU-A2, FU-A4, and FU-A6, and I'd expect to close all four as part of ordinary Stage 9 PR review rather than as a reason to block ratification.

— `security-engineer`, 2026-08-11

---

## 16. `cto` ratification — **Ratified**, with five rulings and four conditions

**Author:** `cto` · **Date:** 2026-08-11 · **Also acting for `solution-architect`** (no role file exists; `00-house-rules.mdc` names this role the fallback owner for that stage).

**Verdict: ratified.** Option (b), AUD-1's join key, and the trail-ownership rule are the right calls and I am adopting them as platform precedent — including, explicitly, the inheritance clause at AUD-9 that pre-decides the GPS location-access trail. §3's fail-closed-affordability argument is the load-bearing one and it is the reason I am not asking for a merge to be re-costed: the option that co-locates the trails is the option that makes the strongest audit-integrity ruling on the platform unaffordable, and that trade is not available at any price I would pay.

I am not re-architecting anything below. Both concurrences arrived qualified, and between them they left exactly two questions that no single role could close alone — the AUD-3(b) shape and RR-4's missing discriminator. Those are cross-role decisions, which makes them mine. The rest is disposition.

### 16.1 R-1 — AUD-3(b) shape: **one audit row per disclosed subject, plus one call-scoped row.** Decided, recorded, closed.

`compliance-specialist` ruled the two offered shapes **not compliance-equivalent** (§14.5.1) and preferred one-row-per-disclosed-subject on three axes it owns. `security-engineer` required the choice be made and recorded **before** AUD-8's runbook is written, because the runbook's Trail A SQL hardcodes the array shape and fails at parse time under the other (§15, AUD-8 finding 2). AUD-3(b) itself calls both acceptable and hands the choice to `database-architect`. Left as-is, that is three roles each correctly holding half a decision.

**Ruling:** the platform adopts, on **both** trails:

1. **One row per distinct disclosed subject**, `event_type = 'privileged_data_access'`, subject in `account_id` / `targetAccountId` exactly as a detail read records it.
2. **Plus one call-scoped row**, `event_type = 'privileged_bulk_access'`, subject null, actor populated, carrying `result_count` — including `result_count = 0`, which satisfies `compliance-specialist`'s §14.5.5 requirement that the *attempt* stay reconstructible when nothing was disclosed.

Four reasons, only the first of which was already on the table:

- **Compliance non-equivalence.** `compliance-specialist` holds a block on Feature 004's Stage 8 and ruled one shape materially better on axes that are theirs. I do not overrule a compliance ruling to save a column.
- **It preserves RR-4's fragile heuristic instead of breaking it.** `security-engineer` flagged that the bulk fix is itself a candidate for silently breaking the `account_id is null and actor_account_id is not null` filter. The array shape adds exactly that row type. Per-subject rows carry a non-null subject *and* a non-null actor, so they never enter that heuristic's result set — and R-2 removes the need for the heuristic anyway.
- **AUD-8's subject-keyed query becomes the query the existing index already answers.** `account_audit_log_account_id_created_at` answers it with no `= any(...)`, no GIN index, no array-containment plan, and no new column on Trail A. The runbook SQL gets simpler than the version §5 shipped.
- **It removes C-13's array carve-out.** `compliance-specialist` attached an extra legal-hold condition to the array shape (mandatory review/expiry date, co-disclosed-subject over-retention recorded as accepted). Under per-subject rows a hold scopes to one subject's row, and that carve-out never needs to exist. Cheapest possible resolution of a condition: make it inapplicable.

**Accepted cost, stated rather than discovered:** up to 200 rows per unfiltered list call, and materially faster audit-table growth than the array shape. Bounded by three things — the 200-row `limit` ceiling (`004` §5), the 12-month retention `compliance-specialist` has now ruled for both trails (§14.9), and an implementation requirement I am attaching here: **the per-subject rows and the call-scoped row are written in a single multi-row statement**, one round trip, atomic, so AUD-10's fail-closed ruling costs one statement per call rather than N. Capacity is a `cloud-infrastructure-architect` note at Phase 1 volumes, not a blocker; if it becomes one, the answer is a shorter retention on the bulk rows specifically, and that is `compliance-specialist`'s to rule, not a shape reversal.

**Recorded where `security-engineer` asked for it to be recorded:** the header comment of the migration that implements it (`backend/migrations/033_adr0006_audit_correlation_columns.sql`), matching 031's own convention. FU-A4's runbook is now unblocked and must be written against that shape.

**What remains `database-architect`'s:** the DDL and validator formalization, Trail B's document shape, and the Mongo-side index question. The *shape decision* is closed. If `database-architect` believes this is wrong, the path is a written objection to me, not a different migration.

### 16.2 R-2 — FU-A9 pulled forward: privilege-*granting* gets its own event type. RR-4 closes structurally.

`security-engineer`'s stated preference (§15, AUD-8 finding 3), and it matches AUD-2's own reasoning that a structural control beats a call-site convention. `POST /v1/invitations` emits `privileged_data_access` today and is not a read of anyone's data; the only way to exclude it from a subject-keyed query is a heuristic that degrades silently the moment a second actor-only row type exists.

**Ruling:** `privilege_granted` is added to `app.audit_event_type` and `POST /v1/invitations` moves to it. FU-A9 is **discharged**, RR-4 is **closed rather than accepted**, and AUD-8's runbook filters on `event_type` — a real column, no inferred filter, nothing for a future engineer to remember. This is a semantic change to a live call site, so it carries a Feature 001 contract amendment (`api-design.md` §11.F, v1.3.0) rather than being made silently.

### 16.3 R-3 — Take AUD-2's recommended `CHECK`, and extend the same reasoning to the new invariants.

AUD-2 left the `CHECK` as `database-architect`'s call with a recommendation to take it. **Ruling: taken, and extended.** Four invariants become schema constraints rather than call-site discipline: an actor is mandatory on both privileged-access event types (AUD-2's own recommendation — "unattributed privileged access" becomes impossible, not merely discouraged); a `privileged_data_access` row must carry a subject (this is what makes R-1's guarantee structural — the null-subject disclosure row AUD-3(b) prohibits can no longer be inserted at all); `result_count` belongs to the bulk row and only the bulk row; and the bulk row must carry one. Mirrored as loud guards in the audit writer, following the precedent already set for `account_audit_log_failure_has_identifier`, so a bug fails in a test rather than as an opaque constraint violation in production.

`security-engineer`'s condition (a) is discharged by construction: **FU-A1 ships as two migrations that are explicitly additive to 031, not a restatement of it** — `032` for the enum values, `033` for columns, comments, constraints and the correctly-named `account_audit_log_actor_created_at` index that AUD-8's runbook already cites and that 031 did not create.

### 16.4 Disposition of every open condition from §14 and §15

| Condition | Disposition |
|---|---|
| `security-engineer` (a) — FU-A1 additive to 031, all four columns, correct index name/shape | **Closed** by R-3 / migrations 032–033. |
| `security-engineer` (b) — AUD-3(b) shape decided before the runbook | **Closed** by R-1. |
| `security-engineer` (c) — RR-4 backed by a real column | **Closed** by R-2, in the stronger of the two forms offered. |
| `security-engineer` (d) — grant verification automated, not two manual checkpoints | **Accepted as correct.** The ADR does hold itself to a lower bar here than it sets two sections earlier, and I agree with the finding. Filed as **FU-A10** (deploy-time assertion that the runtime credential's `UPDATE`/`DELETE` on both audit trails is refused). Until it exists, AUD-11 is "checked," not "enforced," and no document may describe it otherwise. |
| `security-engineer` finding 4(a) — no home for the runbook | **Ruled:** `docs/organization/runbooks/`, as a platform-level location — the runbook spans two features and two stores and does not belong in either feature folder. |
| `security-engineer` finding 4(b) — nobody may hold the read grant to execute the runbook | **Accepted as a real sequencing gap**, filed as **FU-A11**. A runbook its owner cannot execute is the same class of defect as a control that exists only in prose. |
| `compliance-specialist` C-13 — cross-store legal hold, seven sub-requirements | **Accepted in full as a go-live blocker.** AUD-7(b) is ratified as a *guarantee* and its specification stays open on this path; R-1 removes the array-shape carve-out. I am not signing a go-live with a half-preserved evidence set that looks complete. |
| C-14 — bulk list access purpose-documented and role-restricted | **Accepted**, `[S8-004]`. Logging makes access accountable, not lawful — correct, and it lands on `backend-architect` + `authentication-engineer` before Feature 004's Stage 8. |
| C-15 — s18 notification to staff and partner operators | **Accepted, and the internal-delivery half is mine.** Recorded as a `cto` obligation before the first production privileged account: we do not get to use this trail in a misconduct process against someone we never told it existed. Unrecoverable if skipped, which is the whole argument. |
| C-16(a)(b) — amendments to AUD-9's third-trail rule (AUD-7 inheritance; mandatory purpose/case reference) | **Accepted as ratification conditions, assigned back to `cybersecurity-architect`** to fold into their own requirement text. I ratify; I do not edit another role's control language. The purpose-field finding is the sharpest thing in either concurrence — AUD-9's lock is well-built and, as written, locks the platform's most sensitive access class into a shape missing the field it most needs. |
| C-16(c) — direct/out-of-band DB access to PII eliminated or logged at the DB layer; Atlas/Supabase tier escalated to `cto` | **Escalation accepted and ruled now, so it is not rediscovered at procurement:** database-layer audit capability is a **compliance requirement, not a cost option**, extending `compliance-review-supabase.md` §7 from Supabase to Atlas. If the only path to it is a paid tier, that is a budget line I approve in principle and price at provisioning with `cloud-infrastructure-architect`. My preference between the two options is **elimination first** — no standing human access to production data stores, break-glass only, time-bound and approved — because it is cheaper, stronger, and does not depend on a vendor tier. `[GL]`. |
| C-17 — no verbatim query/filter values in either trail | **Accepted as a standing constraint, effective immediately.** Correctly identified as one well-meaning implementation away. Whoever builds the bulk-disclosure writer records disclosed subject *ids*, never the search terms that found them. |
| C-18 — a payments-surface trail reopens the retention analysis | **Accepted.** The PCI-DSS floor / POPIA ceiling coincidence at 12 months is exactly the kind of accident that becomes a violation when a `min()` rule is applied mechanically. `payment-engineer` carries the notification trigger. |
| §14.6.1 — Reporting & Analytics as the largest unlogged bulk-PII path on the roadmap | **Accepted as the most important forward finding in this document.** It is a named platform surface with no owner for this problem. Filed as **FU-A12**: no Reporting & Analytics surface may read `policies`/`assets`/identity data out of band without an access trail meeting AUD-1, and this constraint enters that feature's Stage 1 rather than its Stage 8. |

### 16.5 Conditions on this ratification

Ratified now because none of these reopens the decision and all four are cheaper to hold as conditions than to wait on:

1. **C-16(a)(b) folded into AUD-9's text** before the GPS location-access trail enters design — by the ADR's own rule, adding them later reopens this ADR.
2. **FU-A4's runbook written against R-1's shape**, filed at `docs/organization/runbooks/`, with FU-A11's read credential in place before it is relied on.
3. **AUD-11 described as "checked," never "enforced," until FU-A10 exists.**
4. **C-13 closed before go-live**, converting AUD-7(b) from ratified-guarantee to ratified-specification.

### 16.6 New follow-ups

| ID | Item | Owner (A) | Blocks |
|---|---|---|---|
| **FU-A10** | Automated, repeatable assertion that the runtime application credential is refused `UPDATE`/`DELETE` on both audit trails (deploy-time or CI, not a checkpoint review) | `security-engineer` + `devops-engineer` | AUD-11 being describable as *enforced* |
| **FU-A11** | Read-only investigative credential against both stores, scoped to the two trails, for whoever executes the AUD-8 runbook | `cloud-infrastructure-architect` + `database-architect`, verified `security-engineer` | FU-A4 being executable — same trigger, first production privileged account |
| **FU-A12** | Reporting & Analytics (and any out-of-band read path) carries an AUD-1-conforming access trail, or holds no PII read capability | `cybersecurity-architect` + `analytics-specialist`, escalate to `cto` | That feature's **Stage 1**, not its Stage 8 |

### 16.7 R-4 and R-5 — two smaller rulings, made now because they are free now

- **R-4 — numbering: 0006 stands, no compaction.** §1 offered compaction while unratified. Declined: two documented reservations plus FU-08's unnumbered candidate is a real hazard, and stale cross-references in five filed documents cost more than a gap in the sequence. **FU-08's persistence ADR takes 0007.** 0004 and 0005 stay reserved by name.
- **R-5 — classification stands: this is ADR-level.** §6 offered demotion to a feature note if I disagreed. I do not. The inheritance clause is the whole point: the failure mode being designed against is a future role opening a location-access design, never reading `docs/features/004-*/`, and inventing a third correlation scheme. That is prevented by an ADR plus FU-A5's normative line in `06-security-standards.md`, and not by a document in a feature folder. FU-A5 is now live — `cybersecurity-architect` files it on this ratification.

### 16.8 What I am not ratifying

- **Not a Stage 8 sign-off for Feature 004.** That gate has not run. AUD-3, C-13 and C-14 are conditions *on* it, and two roles hold independent blocks there.
- **Not a retention ruling.** `compliance-specialist` ruled 12 months for both trails (§14.9, discharging FU-A8); I am recording that, not re-deciding it.
- **Not an approval of anything AUD-11 describes as currently enforced.** Both halves are unenforced today (RR-6), which the ADR states honestly and which FU-A10 and SR-3 own.
- **Not a claim that anything in this ADR is built.** As of ratification: migration 031 is applied to the live Supabase project; migrations 032–033 are written and **not yet applied**; the audit writer, `auditRequestId`, and the bulk-disclosure path exist in code; Trail B has no collection, no writer and no route; no `/admin/*` route exists on the platform, so **AUD-3(b) has no live bulk call site to protect yet — the machinery is in place ahead of the endpoint, which was the entire point of gating at design time.**

**Signed:** `cto`, 2026-08-11. Ratified with R-1 … R-5 and the four conditions at §16.5.

---

## 17. `cto` post-ratification corrections — one factual error in §16, two new follow-ups

**Author:** `cto` · **Date:** 2026-08-11 · **Appended, not merged into §16.** §16 is the ratification record and stays as signed, including the sentence §17.1 corrects. A ratification that quietly edits itself afterwards is not a record of anything.

Written after verifying this ADR's claims against the **live** Supabase project rather than against the documents that describe it. Nothing below reopens the decision: R-1 … R-5 stand unchanged, and so do the four conditions at §16.5.

### 17.1 Correction — Trail A's subject-side and purge indexes **do not exist**

R-1's third reason (§16.1) reads: *"AUD-8's subject-keyed query becomes the query the existing index already answers. `account_audit_log_account_id_created_at` answers it with no `= any(...)`, no GIN index, no array-containment plan, and no new column on Trail A."* §5's AUD-1 text makes the same claim more broadly — *"Both trails' **existing** subject-side indexes are the entry points."*

**That index does not exist.** Verified against the live project's catalog on 2026-08-11: the only indexes on `app.account_audit_log` are `account_audit_log_pkey` and `account_audit_log_actor_created_at` (created by `migrations/033`). The same is true of `account_audit_log_created_at (created_at) where legal_hold = false`, the partial index the 12-month purge scan is sized around.

Both are real designs — `001-authentication/database-design.md` §3 specifies them, with correct reasoning — but **no migration in `backend/migrations/` ever creates them**, so they went from design straight into being cited as existing infrastructure. Five documents now assert their existence: this ADR (§5 AUD-1, §16.1), `migrations/033`'s header (corrected in place), `001-authentication/api-design.md` §11.F, the AUD-8 runbook's index list, and Feature 004's `database-addendum-001.md` §2, which cites them twice as the Postgres precedent its own Mongo indexes mirror.

**What is and is not damaged by this:**

- **R-1's ruling is unaffected.** One row per disclosed subject is right on compliance non-equivalence (§14.5.1), on not re-breaking RR-4's heuristic, and on removing C-13's array carve-out. Three of R-1's four reasons never depended on the index. Only the fourth — the performance argument — was resting on something that is not there.
- **What is damaged is the subject-keyed query itself**, and that query is the whole point of this ADR: *"every privileged access to account X, ever"* is the POPIA s23 answer and the s22 breach-notification enumeration. Today it is a sequential scan on an evidentiary table that R-1 has just committed to growing at up to 200 rows per list call. It will not fail; it will get slower exactly as the table becomes worth querying.
- **`app.purge_expired_audit_log()` exists on the live database** but its partial index does not, and **`pg_cron` is not installed** — no scheduler in this repo calls it either. So Trail A's 12-month retention is, as of today, a function nobody invokes. `compliance-review-supabase.md` §407 describes this as *"automated-and-evidenced enforcement"*; that is a paper description of a live gap, and AUD-7's retention symmetry ruling has nothing running underneath it on Trail A.

I am not treating this as an indictment of any role. It is the specific failure mode this project has caught repeatedly and is worth naming plainly one more time: **a design document is not a migration, and citing one as "existing" is how the two get confused.** The general control is FU-A13's second half.

### 17.2 FU-A13 — new. Trail A's designed-but-never-created indexes and its unscheduled purge

**Ruling:** these are created in a new migration (`034`), authored by `database-architect` as DDL formalization exactly as §16.1 reserved that work, and verified by `security-engineer` against the live catalog rather than against the migration file. They are additive, non-blocking `create index` statements on a table with negligible current volume; there is no reason for this to wait behind anything.

Second half, and the more important one: **a repeatable check that every index, constraint and function named in a `database-design.md` actually exists in the live database.** FU-A10 already commits to a deploy-time assertion about audit-trail grants; this is the same class of control against the same class of drift and should ride the same mechanism rather than becoming a second, separate script.

I am **not** ruling on whether `pg_cron` is the right scheduler here — Render, an external scheduler, and `pg_cron` are all defensible and that is `cloud-infrastructure-architect`'s and `devops-engineer`'s call with `compliance-specialist` on the retention obligation. What I am ruling is that **"the purge function exists" may not be described as retention enforcement in any document until something calls it on a schedule**, which is the same standard §16.5 condition 3 already applies to AUD-11's "checked, not enforced."

### 17.3 FU-A14 — new. C-16(b)'s case reference has no case entity to resolve against

`cybersecurity-architect` discharged C-16(a)/(b) into AUD-9 correctly (§16.5 condition 1 is met; §5 AUD-9's two new bullets and `06-security-standards.md` both carry the amended text). In doing so it flagged a dependency that no follow-up currently owns, and the flag is right.

AUD-9 requires the location-access trail and any partner-organisation operator access to carry a purpose/case reference that **"must resolve to a case that exists independently of the access, so that it is checkable afterwards rather than being an operator's free-text assertion at the moment of looking."** That requirement is well-judged and, today, unsatisfiable: **no case, claim, theft-report or recovery entity exists anywhere on this platform.** Feature 004 is design-only and defines `policies`, `policy_status_history` and `assets` — no case concept; Claims is unstarted; no Security Company Dashboard data surface exists.

**Ruling:** this is not a reason to weaken AUD-9, and a free-text purpose string is explicitly **not** an acceptable interim — it is the exact thing the requirement was written to exclude, and shipping it "temporarily" is how it becomes permanent. The dependency is instead recorded as a hard sequencing constraint: **a resolvable case entity is a prerequisite of the GPS location-access trail and of any partner-operator read surface, and it belongs in the Stage 1 of whichever of those features starts first** — the same placement §16.4 gave FU-A12 for Reporting & Analytics, and for the same reason: by Stage 8 the schema is already wrong.

### 17.4 AUD-7's `min()` against a longer location-trail retention — no new follow-up, one clarification

The second gap raised — that a future location trail may warrant a *longer* retention than 12 months (theft, recovery, criminal proceedings) and that `min()` would then bind — is **already tracked** by §5 AUD-9's C-16(a) bullet (period reserved to `compliance-specialist` before that trail ships) and §14's C-18 (the payments-surface mirror of the same problem). It does not need an id.

One thing neither says, which I am adding as ratifier because it is the part that will actually be got wrong: **a longer retention on the location trail buys nothing for *correlated* reconstruction.** Under AUD-7(a), cross-trail reconstruction is capped at `min()` = 12 months no matter how long the location records are kept. Whoever sets that period must therefore state which of the two they are buying — a longer *single-trail* location record, or a longer *correlated* window, the latter of which requires raising Trail A and Trail B too and runs into POPIA s14's ceiling. AUD-7(a)'s documented-asymmetry requirement is satisfied only if the statement says which.

### 17.5 Verified application status, since §16.8 was explicit about it

§16.8 recorded, correctly at the time, that migrations 032–033 were *"written and not yet applied."* **Both have since been applied to the live Supabase project** (`TD IT Solutions`, eu-central-1) by a prior session. Verified against the catalog, not against a claim: all four AUD-1 columns and `result_count` are present, all four R-3 constraints exist, `account_audit_log_actor_created_at` has the shape AUD-8 cites, 031's superseded actor index is gone, and `privilege_granted` / `privileged_bulk_access` / `privileged_data_access` are all in `app.audit_event_type`. Both migration headers still said "NOT YET APPLIED" and have been corrected in place, because `.cursor/rules/database.mdc` makes the header the source of truth.

**Not verified, and therefore still open:** 033 added its four constraints `NOT VALID` and left promotion to `security-engineer` behind a two-query verification block. No record exists of that block having been run. Until it is, the constraints bind new writes only and this ADR's R-3 guarantee is prospective, not retrospective — which is what 033 intended, but it should be a decision someone made rather than a step nobody took.

### 17.7 §16.8's "no live bulk call site" is no longer true — R-1 now has a caller

§16.8 recorded, correctly at the time, that *"no `/admin/*` route exists on the platform, so AUD-3(b) has no live bulk call site to protect yet — the machinery is in place ahead of the endpoint."* **That changed during the same day.** `backend/src/routes/admin-accounts.ts` now implements `GET /v1/admin/accounts` and `GET /v1/admin/accounts/:id` (Feature 001 `api-design.md` §11.E), is mounted under `/api/v1`, and **calls `recordBulkDisclosure()`** on the list path. Backend suite: **64 tests across 10 files, green**.

This is the first real exercise of R-1 end to end, and it is the reason the gate was set at design time rather than at Stage 8. Two consequences worth stating so they are not missed:

- **AUD-3 is now a live control on Trail A, not a prepared one.** Its remaining exposure is Trail B, which still has no collection, no writer and no `/admin/policies*`/`/admin/assets*` route.
- **This endpoint is the first thing C-14 binds to** (bulk list access purpose-documented and role-restricted, `backend-architect` + `authentication-engineer`, §16.4). C-14 was filed against Feature 004's Stage 8; a Feature 001 admin list endpoint reached the same surface first. **C-14 applies to it now** — that is a disposition, not a new condition, and I am recording it here rather than letting the endpoint ship on the technicality that C-14 named a different feature's gate.

### 17.6 New follow-ups

| ID | Item | Owner (A) | Blocks |
|---|---|---|---|
| **FU-A13** | ~~Migration `034` creating `account_audit_log_account_id_created_at` and the partial `account_audit_log_created_at`~~ **Indexes applied** (2026-08-11, §17.8). **Still open:** repeatable live-vs-design schema-object check, sharing FU-A10's deploy-time mechanism. Separately: schedule `app.purge_expired_audit_log()` or stop describing retention as enforced | `database-architect` (migration — done) + `security-engineer` (verify — done); scheduling with `cloud-infrastructure-architect` / `devops-engineer` and `compliance-specialist` | Trail A's 12-month retention being real (subject-keyed query now indexed) |
| **FU-A14** | A resolvable case/claim/recovery entity for AUD-9's mandatory purpose reference (C-16(b)) to point at — free-text purpose strings explicitly excluded | `product-manager` + `business-analyst` (entity), `cybersecurity-architect` (conformance) | **Stage 1** of the GPS location-access trail and of any partner-operator read surface — not their Stage 8 |

**Signed:** `cto`, 2026-08-11. §16's ratification stands unamended; this section corrects one factual claim inside it and adds two follow-ups.

### 17.8 FU-A13 first half applied — migration `034` on live Supabase

Migration `034_account_audit_log_subject_and_purge_indexes.sql` was applied to the live Supabase project (`TD IT Solutions`, eu-central-1) on 2026-08-11. Catalog verification: `app.account_audit_log` now has four non-PK indexes — `account_audit_log_pkey`, `account_audit_log_actor_created_at`, `account_audit_log_account_id_created_at`, and `account_audit_log_created_at`. The subject-keyed AUD-8 query path is no longer a sequential scan.

**Still open under FU-A13:** purge scheduling (`app.purge_expired_audit_log()` remains uncalled); deploy-time live-vs-design schema-object check (second half, shares FU-A10); 033's `NOT VALID` constraint promotion (`security-engineer`).
