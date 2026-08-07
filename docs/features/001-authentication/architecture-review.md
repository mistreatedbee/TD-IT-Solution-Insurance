# Feature 001 — Customer Account Creation & Authentication

## Architecture Review — Stage 5 Synthesis and Ratification

**Lifecycle stage:** 5 — Architecture Review
**Stage owner (A):** `solution-architect` (this document)
**Contributor documents reviewed:** [`architecture/backend-approach.md`](./architecture/backend-approach.md) (`backend-architect`), [`architecture/data-model-approach.md`](./architecture/data-model-approach.md) (`database-architect`)
**Upstream chain reviewed in full:** [`business-requirements.md`](./business-requirements.md) (Stage 1), [`product-plan.md`](./product-plan.md) (Stage 2), [`ux-research.md`](./ux-research.md) (Stage 3), [`ui-design.md`](./ui-design.md) + [`design-system-additions.md`](./design-system-additions.md) (Stage 4)
**Governing ADRs:** [ADR-0001](../../organization/adr/0001-baseline-architecture.md) (Accepted), [ADR-0002](../../organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md) (Accepted, conditionally ratified)
**Informed:** `cto`, `technical-project-manager`, `product-manager`, `cybersecurity-architect`

---

## STATUS LINE — GATE DECISION

> **Stage 5 (Architecture Review): APPROVED — GATE CLOSED, conditional exit.**
> Signed `solution-architect`, 2026-08-07.
> **Stage 6 (Database Design) and Stage 7 (API Design) are authorised to begin immediately.**
> **Stage 7 may not exit** until FU-01, FU-02(a), FU-07, FU-09, FU-10, FU-18 and FU-19 are closed.
> **Stage 8 (Security Review) may not exit** until every remaining open item in §6 is closed.
> **Stage 9 (Development) remains independently gated** behind ADR-0002's own three Required Follow-ups (FU-15) and Stage 8's hard gate, neither of which this document discharges.
> No new ADR is issued at this gate. Three conditional ADR triggers are named in §7 with owners and deadlines.

---

## 0. Decision Summary (read this if you read nothing else)

1. **Both contributor documents are internally consistent with each other and with ADR-0002** on every decision Stage 5 exists to settle — service boundaries, system-of-record split, the mediation principle, and the `account_id` cross-database contract. The `account_id` contract `backend-architect` assumed **does** match what `database-architect` specified (§2.1).
2. **Four genuine divergences were found** — none of them fatal, all of them resolvable downstream, two of them significant enough that I am escalating them above the priority either contributor document assigned them (§2.3): the session-token claim-freshness collision with FR-22, and the ambiguity over whether a client ever holds a credential that Supabase itself would honour.
3. **Stage 5 EXITS NOW.** It does not hold. Reasoning in §8. This mirrors how ADR-0002 was itself ratified — approved with named, owned, deadlined conditions rather than blocked pending perfection.
4. **Eight open items are closed at this gate** by rulings in §4 — including two that `database-architect` flagged as potentially blocking and one that `backend-architect` flagged as deferred but which `database-architect` had in fact already resolved.
5. **Eighteen open follow-ups** are tracked in §6, consolidated and deduplicated from the twelve raw items across the two contributor documents plus six raised by this review.
6. **No new ADR is warranted** at this gate (§7). Nothing here reverses, extends, or contradicts ADR-0001 or ADR-0002; everything decided is either already inside ADR-0002's Decision section or is intra-domain detail properly owned by the Stage 6/7 artifacts. Three named conditions *would* trigger an ADR, and they are registered with owners and deadlines rather than left as silent gaps.

---

## 1. What This Review Covered, and What It Deliberately Did Not

**Covered:** cross-document coherence, consistency with the accepted ADRs, service-boundary and data-ownership clarity, cross-service contract completeness, non-functional target definition, third-party failure-mode handling, and whether any Stage 1–4 commitment has been quietly dropped or contradicted on the way into architecture.

**Not covered, by design:** DDL (Stage 6), OpenAPI schemas (Stage 7), RLS SQL (Stage 6, `security-engineer`-reviewed), threat model and security sign-off (Stage 8, `cybersecurity-architect`'s hard gate — this document explicitly does not pre-empt or substitute for it), password/lockout/MFA-cadence policy numbers (`cybersecurity-architect`/`security-engineer`/`authentication-engineer`), and the support-assisted-reset operational runbook (`cybersecurity-architect`).

**Coverage gap in Stage 5 itself, disclosed rather than glossed:** the lifecycle names `frontend-architect`, `mobile-architect`, `integration-architect` and `cloud-infrastructure-architect` as Stage 5 contributors. Only `backend-architect` and `database-architect` produced review artifacts. `integration-architect` has no material surface in Feature 001 (no GPS/payment vendor is touched) and their absence is correct. `cloud-infrastructure-architect`'s absence is tolerable at Stage 5 but becomes material at FU-08 and FU-11. **`mobile-architect` and `frontend-architect`'s absence is a real gap** — FR-20 (mobile device-binding of sessions/refresh tokens) and FR-21 (dashboard idle-timeout) are session-contract-shaping requirements with no architectural owner in this stage's output. I am not holding the gate for it (§8), but I am converting it into two dated, named follow-ups with a Stage 7 deadline (FU-09, FU-10) rather than letting it pass as an omission.

---

## 2. Consistency Check: The Two Contributor Documents Against Each Other

### 2.1 The `account_id` contract — the specific check requested

**Verdict: consistent. `backend-architect`'s assumptions are satisfied by `database-architect`'s specification, with one adjacent divergence that is not about the identifier itself.**

| What `backend-approach.md` §4 assumed | What `data-model-approach.md` §5 specified | Match? |
|---|---|---|
| "a stable, immutable, opaque reference ID crossing a system boundary" | `app.accounts.id` = `auth.users.id`, a Postgres-native UUID (v4) | Yes |
| Reference is **one-directional** (Mongo → Supabase) | Mongo documents store it as a plain indexed string field; Supabase holds no back-reference | Yes |
| Reference "essentially never needs to change" — an asset is not reassigned to a different account in this feature's scope | "stable for the account's entire lifetime, including through `suspended`/`deactivated` transitions; the UUID is never reused or recycled" | Yes — and `database-architect` states it more strongly than `backend-architect` assumed, which is the safe direction |
| Backend owns write-time existence validation, because no FK exists | "the backend API layer — not either database — is responsible for validating `account_id` existence before writes that reference it" | Yes, explicitly agreed |
| No cross-database transactions; saga/compensating action where a dual write is needed | Same, and additionally notes the `auth`↔`app` schema boundary is **not** such a seam (same Postgres instance, so a single transaction is available there) | Yes, and `database-architect` usefully narrows where saga handling is actually required |

The only place the two documents describe *different* obligations is **what happens on account deletion**, and that is a divergence about the deletion mechanism, not about the identifier contract (§2.3, D-1). The identifier contract itself holds under either deletion strategy.

**One clarification I am adding as a boundary constraint, because neither document states it explicitly:** `account_id` is an opaque reference **only**. No service outside Identity Service may parse, derive, or infer anything from it, and no service may key on `email` (or any other identity attribute) as a substitute join key. `backend-approach.md` §3/BR-6 states the second half of this; I am stating the first half so Stage 6/7 has the whole rule.

### 2.2 Where one document closes the other's open question

Two of `backend-architect`'s explicitly deferred items are in fact already resolved by `database-architect`, and were flagged as open only because the documents were produced in parallel. I am closing both here rather than carrying them forward as phantom open items (§4, C1 and C2):

- **Audit-log storage location.** `backend-approach.md` §5.2 presented Postgres-vs-MongoDB as an open Stage 6 question with a recommendation for Postgres and `database-architect` named as the decision owner. `data-model-approach.md` §1.6 makes that decision — `app.account_audit_log`, same Supabase Postgres instance — with independent reasoning (joint queryability with account data; POPIA's retention principle cares about duration, not physical store; a separate physical store would reintroduce the exact cross-database consistency problem ADR-0002 exists to avoid for identity data). The recommendation and the ruling agree. **Closed.**
- **Partner-org data location.** `backend-approach.md` §3/BR-7 flagged to `database-architect` at Stage 6 whether the org association lives as a Postgres table or as backend-owned metadata. `data-model-approach.md` §1.4 answers: a thin `app.partner_organizations` table, with `app.accounts.partner_organization_id` as a nullable FK enforced not-null-for-operators via a `CHECK` constraint. **Closed.**

Additionally, `data-model-approach.md` adds one table neither ADR-0002 nor `backend-approach.md` anticipated — `app.retention_purge_runs`, the meta-audit record for the 12-month purge job. This is additive, is required to make `compliance-specialist`'s Stage 1 §9.3 requirement implementable at all, and contradicts nothing. **Accepted as in-scope for Stage 6.**

### 2.3 Divergences found

**D-1 — Deletion strategy: propagate-and-clean vs. anonymise-in-place. (Material. → FU-03)**

`backend-approach.md` §4.2 designs for an account-deletion event/outbox so downstream MongoDB collections can be cleaned up, and its illustrative event payload is "account X was hard-deleted/anonymized at time T" — i.e. it treats hard deletion as a live possibility the architecture must survive.

`data-model-approach.md` §5 places a **design constraint against** hard deletion: anonymise-in-place, preserve the UUID, precisely so MongoDB references never orphan and `backend-architect`'s cleanup listener never has to run against every domain collection.

These are not contradictory — they are two different bets on the same unresolved compliance question, and each is internally reasonable. But they cannot both be the default. Compounding this, `data-model-approach.md` §1.2 proposes `on delete cascade` from `auth.users` to `app.accounts`, which is itself a hard-delete path in tension with §5's own anonymise-in-place preference; `database-architect` flags this honestly but does not resolve it.

**My ruling on the constraint, without pre-empting `compliance-specialist`'s POPIA determination:** whichever mechanism is chosen, **Identity Service must publish the account-lifecycle-terminal event either way**. Anonymise-in-place does not remove the need for the event — MongoDB documents may hold denormalised PII copies (an asset nickname, a claim narrative) that a POPIA deletion request reaches even when the `account_id` reference itself stays valid. `backend-approach.md`'s outbox recommendation therefore stands regardless of how FU-03 resolves, and Stage 6/7 should build it on that basis rather than waiting for the compliance ruling. What FU-03 decides is *what the event means downstream*, not *whether the event exists*.

**D-2 — Session-token claim freshness vs. FR-22's immediacy requirement. (Material — the most significant finding in this review. → FU-01)**

`backend-approach.md` §1 (final bullet) and §3/BR-2 design the request path as: local JWT verification against Supabase's cached JWKS, **no network call per request**, with platform claims (`role`, `mfa_required`, `account_state`, partner-org scope) carried on the token and read by downstream services to enforce the BR-2 commerce gate.

`data-model-approach.md` §4 warns against exactly this: `app.accounts` is authoritative, and "a stale `app_metadata` claim cached in a long-lived JWT is a real risk" — naming the `account_state` → `suspended` transition as the case that must take effect before the token naturally expires.

Neither document is wrong; they are optimising different things (request-path latency vs. authorization freshness), and the collision is invisible unless you read both. It is also not merely a preference argument, because Stage 1 already ruled on it in three places: **FR-22** ("a session that is revoked... is unusable immediately, not just at next natural expiry"), **AC-8** ("a subsequent request using the old token is rejected"), and **AC-9** (password reset invalidates all sessions, and Stage 3 §1.3 step 7 promises the user this in copy). A purely local, no-network JWT verification cannot satisfy "immediately" for revocation unless the token lifetime is short enough that "immediately" is redefined to a stated, bounded, testable window — and no such number exists anywhere in Stages 1–5.

**My ruling as a cross-service contract constraint (detail delegated to FU-01):**
- (a) The bounded staleness window must be an **explicit, stated, testable number**, not an emergent property of whatever TTL is configured. I set a provisional ceiling of **15 minutes** in §5; `cybersecurity-architect` may tighten it, and must not loosen it without recording why.
- (b) Anything FR-22/AC-8/AC-9 require to be immediate — session revocation, logout, password-reset invalidation, `account_state` → `suspended` — **may not be enforced from an unexpired token claim alone.** The refresh path is the natural chokepoint for revocation; whether a per-request check is additionally required on privileged or commerce-gated actions is FU-01's call, not mine.
- (c) The BR-2 commerce gate must be **re-derived at the point of the gated action** by the consuming service, not trusted from a claim minted at login. This preserves `backend-approach.md`'s correct boundary ruling (the gate check is the consuming service's responsibility) while removing the staleness hole.
- (d) `app.accounts` remains the single source of truth, per `data-model-approach.md` §4. Any JWT claim is a cache of it, must be labelled as such in the Stage 7 contract, and must never be the enforcement surface for a privilege decision.

This must be settled **before Stage 7 exits**, not Stage 8 — the token's claim set is an inter-service contract, and every future service's auth middleware is built against it. A Stage 8 discovery here means reworking the OpenAPI contract, which is exactly the kind of avoidable churn Stage 5 exists to prevent.

**D-3 — Who the RLS policies are actually protecting against. (Material. → FU-18, and ruling C7)**

`data-model-approach.md` §3 writes the RLS posture in terms of `id = auth.uid()` per-role predicates — a formulation that only has a caller if some client holds a Supabase-honoured JWT and reaches Postgres directly. `backend-approach.md` §1 forbids exactly that as a hard architectural constraint ("no client SDK for Supabase Auth ships to the mobile app, admin dashboard, or security-company dashboard").

At first read this looks like a contradiction. It is not — but the resolution matters more than either document notices. `backend-approach.md` §1 also states that "session tokens issued to clients are the tokens the backend hands back after this mediation." If those are Supabase-issued JWTs passed through verbatim, then **the client does hold a credential Supabase itself would honour**, and can in principle call Supabase's data APIs directly with it — not because the architecture permits it, but because the credential is valid there. Under that reading, RLS is a load-bearing control, `data-model-approach.md` §3's `auth.uid()` framing is exactly right, and the ADR-0002 mediation principle is a policy that RLS enforces rather than a property the system structurally guarantees.

If instead the backend mints its own token (opaque to Supabase, verified only by our middleware), that reachable path does not exist, mediation becomes structural rather than policy, and RLS becomes pure defence-in-depth against a leaked non-service-role key.

Both are defensible. They imply materially different Stage 6 RLS work and materially different Stage 8 threat models, so the choice cannot be left implicit — see FU-18. My interim ruling (C7) makes the conservative assumption so Stage 6 is not blocked.

**D-4 — Invitation lifecycle vocabulary and the `revoked` state. (Minor. → FU-12)**

`backend-approach.md` §3/BR-3 names the invitation lifecycle "issued → accepted → expired" (three states). `data-model-approach.md` §1.8 specifies `pending | accepted | expired | revoked` (four states, and `pending` where backend says `issued`). Two consequences:
- The naming drift is trivial now and expensive at Stage 7 if the schema enum and the API enum disagree. Align once, at Stage 6.
- More substantively, `revoked` implies an admin revocation action. **No endpoint in `backend-approach.md` §2.2 exposes it, and no story in `product-plan.md` §4 covers it** (#4 and #5 are issuance and acceptance only). I am not treating this as a scope gap to fill: keeping the state in the schema is cheap and forward-compatible, and adding an endpoint would be Stage 5 inventing scope Stage 2 did not authorise. **Ruling: keep `revoked` in the Stage 6 enum, ship no revocation endpoint in Feature 001, and record it so Stage 7 does not invent one and Stage 10 does not test for one.**

**D-5 — Audit-log read: who may call it. (Minor. → ruling C8, FU-19)**

`backend-approach.md` §2.2 RBAC-gates `GET /v1/admin/audit-log` to "admin/support/compliance-tooling roles." `data-model-approach.md` §3 leaves support-agent audit-log read as "within scope, pending RBAC definition" — i.e. undecided. Separately, **no Stage 4 screen exists for this endpoint** — `ui-design.md` specifies nine flows and none of them is an audit-log view. Backlog #17 ("Auth audit log surface," P2) says "queryable," which is satisfiable by an API without a dashboard. Ruled in C8 and tracked in FU-19.

---

## 3. Consistency Check Against ADR-0002 and ADR-0001

| ADR-0002 Decision clause | Status in the two Stage 5 documents |
|---|---|
| Supabase is SoR for accounts, account states, credentials, sessions/refresh tokens, MFA factors, invitations, **and authentication audit events** | Fully honoured. Notably, `data-model-approach.md` §1.6's ruling to keep the audit log in Supabase Postgres is the reading that matches this clause's explicit wording; the MongoDB alternative `backend-approach.md` §5.2 raised would have quietly narrowed the ADR's stated scope without reopening it. Correctly avoided. |
| MongoDB remains SoR for policies, assets, GPS history, claims | Untouched by either document beyond the `account_id` string field. No encroachment. ADR-0001 is not narrowed further than ADR-0002 already narrowed it. |
| The Node.js/TS backend is the only layer talking to both stores; **no client talks to Supabase or MongoDB directly** | Confirmed with no exceptions by `backend-approach.md` §1, which correctly elevates it from convention to hard constraint and routes any future deviation through a new ADR rather than a PR. See D-3 for the one nuance about what "directly" structurally means. |
| `account_id` is a soft cross-system reference, not a foreign key; the backend owns the integrity burden | Confirmed by both, consistently (§2.1). |
| ADR-0002's forward requirement: OQ-3's `mfa_required` must be a first-class field decoupled from role, designed in now to avoid a later migration | Delivered — `data-model-approach.md` §1.2 specifies exactly this and cites `product-plan.md` §5's instruction verbatim. This is the clearest example in either document of a Stage 2 forward note surviving intact into Stage 5 rather than being rediscovered later. |
| ADR-0002: audit log "needs its own table/mechanism, designed jointly by `database-architect` and `security-engineer`" | **Partially satisfied.** The table is designed; the joint `security-engineer` review has not happened. Folded into FU-05 rather than treated as done. |
| ADR-0002's Revisit Triggers | None fired. The nearest is "Supabase Auth's role-based MFA/invitation customization proves insufficient" — `data-model-approach.md` §1.3 correctly identifies the specific condition that would fire it (inability to query verified-factor count from RLS) and declines to invent a shadow MFA table pre-emptively, which is the right call. |
| ADR-0002's three Required Follow-ups Before Implementation | Untouched by either document and **not discharged by this review**. Carried as FU-15, gating Stage 9 entry. |

**ADR-0001 consistency:** baseline stack unaffected. Node.js + TypeScript backend, React/Vite/TS/Tailwind web, Expo RN mobile — all assumed, none deviated from. The one thing worth naming: `backend-approach.md` §5.1 proposes a Redis-class ephemeral counter store, which is a **third** persistence surface beyond ADR-0001's MongoDB and ADR-0002's Supabase. That is not a deviation from ADR-0001 (it is not a system of record for anything), but it is a new infrastructure component with cost, ops and hosting implications that no ADR covers — see §7 and FU-08.

---

## 4. Rulings Made at This Gate

Eight items are decided here and are not carried forward as open. Each is within this role's decision authority (service boundaries, inter-service contracts, cross-domain arbitration) per `01-raci-matrix.md` and `02-feature-lifecycle.md`.

**C1 — Authentication audit events live in Supabase Postgres (`app.account_audit_log`), not MongoDB.** Both documents converge on this; ADR-0002's Decision section already names auth audit events as Supabase's domain. Closed. Retention and purge mechanics remain open (FU-04) but the *store* is settled.

**C2 — Partner-org association is a first-class `app.partner_organizations` table with an FK from `app.accounts`, not backend metadata.** Per `data-model-approach.md` §1.4. Closed.

**C3 — Feature 001 requires no client-facing cross-account visibility, and `database-architect`'s own-row-only RLS default is therefore the correct final posture for this feature, not a placeholder to be loosened later.** This closes the blocking half of `data-model-approach.md` §6 item 2. Reasoning: Feature 001 does contain two genuinely cross-account operations — admin audit-log read and admin invitation issuance — but under ADR-0002's mediation principle **both execute inside Identity Service against a service-role credential**, with authorization enforced in the backend's middleware. Neither requires a broad client-facing RLS grant. Stage 1 §5 excludes the RBAC matrix; `ui-design.md` designs no admin account-list screen; `product-plan.md` §3 lists "Admin Dashboard (view customers, policies, assets)" as a *separate* Phase 1 item downstream of this one. There is no unstated requirement lurking here. `cybersecurity-architect` is asked to **confirm** this posture (FU-06), not to define it — which is a materially smaller ask than `database-architect` was carrying.

**C4 — In Feature 001, only the `admin` role may call `POST /v1/invitations`. Support agents may not issue invitations.** This closes `data-model-approach.md` §6 item 5's blocking half by default-deny. Reasoning: BR-3 says "admin-created"; nothing in Stages 1–4 grants support agents issuing rights; `product-plan.md` backlog #5 concerns support agents being *invited*, not *inviting*. Default-deny is the scope-consistent and security-consistent reading, and expanding it later is cheap while retracting it is not. The *expansion* question (should support agents ever hold this right?) is a genuine product/security question and remains routed to `product-manager` + `cybersecurity-architect` — but as a future-RBAC-feature input (FU-14), **not** as a Feature 001 blocker.

**C5 — Stage 11 (Performance Testing) is REQUIRED for Feature 001, not optional.** `02-feature-lifecycle.md` scopes Stage 11 to features touching "GPS ingestion, payments, or a shared hot path." Identity Service's token-verification path is on **every** authenticated request to **every** future service — that is the definition of a shared hot path. `backend-approach.md` §6 recommended this tentatively; I am ruling it required so `technical-project-manager` can plan for it rather than discover it. Note the reason is the hot-path property, **not** volume — Feature 001's own request volume is small.

**C6 — `backend-approach.md`'s final unchecked checklist item ("Reviewed and approved by `solution-architect` for cross-domain consistency") is discharged by this document.** Closed.

**C7 — RLS is a required control for Feature 001, and Identity Service's authorization middleware is the primary one.** Interim ruling pending FU-18. Until FU-18 decides the token shape, Stage 6 must write RLS policies **as if** a non-service-role credential can reach the database — full `TO authenticated`/`TO service_role` scoping with explicit ownership predicates, per operation, exactly as `data-model-approach.md` §3's hard requirement states, and never a bare `USING (true)`. This is the conservative assumption; if FU-18 lands on backend-minted tokens, that work is not wasted, it merely becomes defence-in-depth rather than front-line. If FU-18 lands the other way, the work was mandatory. Asymmetric cost, obvious call.

**C8 — `GET /v1/admin/audit-log` is restricted to the `admin` role in Feature 001.** Resolves D-5's disagreement in favour of the narrower reading, consistent with C3 and C4's default-deny posture. Compliance-tooling access, if needed, is a service-role/internal path, not a client role. Support-agent access is not granted in this feature.

---

## 5. Non-Functional Targets Set at Stage 5 (provisional, delegated for validation)

Neither contributor document states an NFR target, and `backend-approach.md` §6 correctly flags this rather than asserting one. Setting these is this role's job, so I am setting them here as **provisional constraints to be validated**, not as observed capabilities. `performance-engineer` and `site-reliability-engineer` own validation (FU-11); `cybersecurity-architect` may tighten the staleness ceiling.

| Target | Provisional value | Notes |
|---|---|---|
| Token verification (local JWKS, in-process) | p95 ≤ 5 ms, p99 ≤ 15 ms | Hard constraint: **must not add a network round trip to the request path.** This is the number that makes the shared-hot-path property tolerable. |
| Login — password step, server-side end-to-end | p95 ≤ 800 ms, p99 ≤ 2000 ms | Excludes client network. Includes the backend→Supabase→backend hop. |
| MFA challenge verification | p95 ≤ 800 ms | Same basis. |
| Verification / password-reset email dispatch | Enqueued within p95 ≤ 500 ms of request | **Delivery** latency is vendor-dependent and must not be asserted as an SLO. Stage 4 copy already promises only "usually within a couple of minutes" — do not let a stricter number leak into the UI. |
| Identity Service availability (token verification path) | 99.9% monthly | Achievable independently of Supabase, since verification is local. |
| Identity Service availability (login/signup/MFA/reset path) | **Cannot be asserted above Supabase's own commitment.** | `cloud-infrastructure-architect` must state Supabase's actual published availability commitment on the project's current plan before this number is filled in. Do not publish an SLO the upstream dependency cannot support. Feeds FU-02. |
| Bounded claim-staleness window | ≤ 15 minutes (access-token TTL ceiling) | Per D-2/FU-01. Tightenable by `cybersecurity-architect`; looseable only with recorded justification. |
| RPO / RTO for identity data | RPO ≤ 15 min, RTO ≤ 4 h | **Explicitly at risk.** These depend on Supabase backup/PITR capability on the project's current plan, which is unverified. If PITR is unavailable at the current tier, this is a cost decision for `cto` and touches ADR-0002's own revisit trigger about the platform owner's Supabase project relationship. Feeds FU-11 and is escalated to `cto`. |
| Capacity / throughput | No target set | Feature 001 is not a high-throughput path. Stage 11 is required for latency and hot-path behaviour (C5), not for volume. |

---

## 6. Consolidated Follow-Up Tracker

Eighteen open items, deduplicated across both contributor documents and this review. `Source` traces each back so nothing looks invented. Items marked **NEW** were not raised in either contributor document.

| ID | Item | Owner (A) | Blocks what | Due by stage | Source |
|---|---|---|---|---|---|
| **FU-01** | **Session-assertion contract: token claim set, access-token TTL, and how FR-22/AC-8/AC-9 immediacy is achieved without a per-request network call.** Must produce a stated, testable staleness window and name which decisions may never be made from a claim alone (D-2 (a)–(d)). | `backend-architect` (with `database-architect`, `cybersecurity-architect`) | Stage 7 OpenAPI contract; every future service's auth middleware; testability of AC-8/AC-9; FR-22 | **Stage 7 exit** | data-model §6.6, escalated by this review |
| **FU-02** | **Supabase outage/degradation design.** (a) Degraded-state error code and client-visible behaviour for login/signup/MFA/reset. (b) Confirm whether already-issued sessions remain usable for read paths during an outage. (c) Monitoring/incident hook so SRE learns of degradation before users do. | `backend-architect` + `site-reliability-engineer` (`cloud-infrastructure-architect` consulted) | (a) blocks Stage 7 error envelope; (b)+(c) block Stage 8 sign-off and Stage 14 alerting | **(a) Stage 7 exit; (b)(c) Stage 8 exit** | backend §6 |
| **FU-03** | **Account deletion/anonymisation mechanism for `deactivated` accounts.** Includes: the `on delete cascade` ruling; reconciling anonymise-in-place (data-model §5) against propagate-and-clean (backend §4.2); how `account_state_transitions` rows referencing other accounts' `actor_account_id` are handled. The deletion **event** is required either way (D-1). | `compliance-specialist` (A on the POPIA determination) + `database-architect` + `backend-architect` | Stage 6 DDL finalisation; POPIA s23–25 posture; ADR-0004 trigger | **Stage 6 exit (cascade + marker columns); Stage 8 exit (full mechanism)** | Stage 1 §9.2(b); data-model §1.5/§6.3; backend §4.2 |
| **FU-04** | **Retention period for `app.account_state_transitions`** — a distinct ruling from the audit log's 12 months. Includes whether state transitions are unioned into the audit-log query view or joined at query time. | `compliance-specialist` | Purge-job design; Stage 8 retention re-confirmation; Stage 6 index strategy | **Stage 8 exit** | data-model §6.4 |
| **FU-05** | **RLS SQL authored and reviewed.** Policy intent (data-model §3) is a brief, not SQL. Hard gate: no RLS policy is applied to a live project without this review. Also discharges ADR-0002's "designed jointly by `database-architect` and `security-engineer`" clause for the audit log. | `cybersecurity-architect` (A), `security-engineer` (R), `database-architect` (C) | Any live Supabase schema; Stage 8 sign-off | **Stage 8 exit** (drafted at Stage 6) | data-model §6.1; ADR-0002 |
| **FU-06** | **Confirm own-row-only client-facing RLS is Feature 001's final posture** (not a placeholder), per ruling C3. A confirmation, not a definition. | `cybersecurity-architect` | Stage 6 DDL finalisation | **Stage 6 exit** | data-model §6.2, reduced by ruling C3 |
| **FU-07** | **Verify Supabase's actual responses** for duplicate signup and password-reset-for-unknown-email — status code, body shape **and** timing — before the normalisation layer is designed around them. ADR-0002 explicitly says this must be verified, not assumed. | `backend-architect` + `authentication-engineer` | Stage 7 error-envelope design; testability of AC-2 and FR-5/FR-15 | **Stage 7 exit** | backend §2.3; ADR-0002 |
| **FU-08** | **Ephemeral rate-limit/lockout counter store**: technology and hosting decision (a third persistence surface beyond ADR-0001/0002), plus thresholds, backoff curve and IP-vs-account keying. **ADR-0003 trigger** if it becomes a persistent, separately-hosted component (§7). | `cloud-infrastructure-architect` (technology/hosting) + `security-engineer` (policy numbers); `cto` informed on cost | Stage 8 sign-off; Stage 13 deployment topology; FR-11 | **Stage 8 exit** | backend §5.1, escalated by this review |
| **FU-09** | **NEW — FR-20 mobile device-binding architectural review.** No `mobile-architect` artifact exists at Stage 5. Device-binding shapes the session/refresh contract directly. | `mobile-architect` | Stage 7 session/refresh contract; backlog story #12 | **Stage 7 exit** | this review (§1) |
| **FU-10** | **NEW — FR-21 dashboard idle-timeout and client-side session handling review** across both web dashboards. No `frontend-architect` artifact exists at Stage 5. | `frontend-architect` | Stage 7 contract; backlog story #13; Stage 4 §4.7 idle-timeout banner behaviour | **Stage 7 exit** | this review (§1) |
| **FU-11** | **NEW — Validate the §5 provisional NFR targets**, and specifically establish Supabase's actual availability commitment and backup/PITR capability on the project's current plan. RPO/RTO may be unachievable at the current tier — a cost decision, not a technical one. | `performance-engineer` + `site-reliability-engineer` + `cloud-infrastructure-architect`; ratified by `solution-architect`, escalated to `cto` if cost-bearing | Stage 11 load-test design; Stage 8 availability claims; FU-02 | **Stage 8 exit** (targets); Stage 11 (validation) | this review (§5) |
| **FU-12** | **NEW — Stage 6 schema reconciliations, two sub-items:** (a) invitation state vocabulary (`issued` vs `pending`) aligned across schema and API, with `revoked` retained in the enum but **no revocation endpoint shipped in Feature 001** (D-4); (b) `app.accounts.email` sync mechanism against `auth.users.email` — trigger vs. read-through. | `database-architect` + `backend-architect` | Stage 6 enum/DDL; Stage 7 contract; Stage 10 test scope (do not test for a revoke endpoint) | **Stage 6 exit** | this review (D-4); data-model §1.2 |
| **FU-13** | **Deletion/anonymisation event publication mechanism** (outbox-style record from Identity Service). Required regardless of how FU-03 resolves (D-1). Designed now, consumed by a later feature. | `backend-architect` | Forward-compatibility for the future POPIA-deletion feature; ADR-0002's cross-DB integrity revisit trigger | **Stage 7 exit** (contract shape); implementation deferred to the owning future feature | backend §4.2, hardened by this review |
| **FU-14** | **Whether support agents should ever hold invitation-issuing rights** (i.e. is BR-3's "admin-created" role-literal). Non-blocking for Feature 001 under ruling C4. | `product-manager` + `cybersecurity-architect` | Nothing in Feature 001. Input to the future RBAC Permission Matrix feature. | **Future RBAC feature, Stage 1** | data-model §6.5, reduced by ruling C4 |
| **FU-15** | **ADR-0002's three Required Follow-ups Before Implementation:** (a) `cybersecurity-architect` + `compliance-specialist` cross-border/data-residency review against the POPIA determination; (b) `security-engineer`'s unified secrets-management plan for both MongoDB and Supabase credentials; (c) `cto` ratification — already obtained 2026-08-07. | `cybersecurity-architect` + `compliance-specialist` (a); `security-engineer` (b) | **Stage 9 (Development) entry.** Not discharged by this review. | **Before Stage 9 entry** | ADR-0002; data-model §6.8 |
| **FU-16** | **NEW — Support-assisted manual reset process definition** (compound lockout: privileged user has lost both password and MFA device). Stage 3 §1.6 step 6, Stage 4 `design-system-additions.md` §0 and `ui-design.md` §4.9 all carry it forward as an unresolved dependency; the UI copy is a live placeholder. Also determines whether the `cto`-signed BR-4 risk-acceptance override has a real operational path. | `cybersecurity-architect` | Stage 9 copy finalisation (§4.9, §4.5 Screen B, §4.6 Screen D); Stage 8 sign-off; the audit trail for out-of-band privileged resets | **Stage 8 exit** | ux-research §1.6; design-system-additions §0; ui-design §7 — carried forward by this review |
| **FU-17** | **Auth policy parameters:** password strength (FR-2), lockout thresholds/backoff/keying (FR-11), MFA re-prompt cadence (FR-9, with the Stage 3 §2.2 UX tradeoff), access-token TTL and dashboard idle-timeout values (FR-19/FR-21). Supplies the concrete number FU-01 needs. | `cybersecurity-architect` (A); `security-engineer` + `authentication-engineer` (R); `product-manager` consulted on cadence | Stage 8 sign-off; FU-01's staleness window; Stage 4's policy-agnostic strength meter | **Stage 8 exit** | Stage 1 FR-2/FR-9/FR-11; backend §5.1; ux-research §5.3 |
| **FU-18** | **NEW — Session token shape: does the client receive a Supabase-honoured JWT verbatim, or a backend-minted token opaque to Supabase?** Determines whether ADR-0002's mediation principle is structurally guaranteed or policy-enforced, and whether RLS is front-line or defence-in-depth (D-3). **ADR-0005 trigger** if the answer is backend-minted (§7). | `backend-architect` + `cybersecurity-architect` | Stage 7 contract; FU-05's RLS threat model; Stage 8 threat model | **Stage 7 exit** | this review (D-3) |
| **FU-19** | **NEW — `GET /v1/admin/audit-log` has no Stage 4 UI surface.** Confirm the endpoint is contract-only for Feature 001 (satisfying backlog #17's "queryable") and that no dashboard screen is expected at Stage 9/10. If product wants a screen, that is a Stage 3/4 re-entry, not a Stage 9 improvisation. | `product-manager` (with `ui-designer`) | Stage 9 build scope; Stage 10 test scope | **Stage 7 exit** | this review (D-5) |

**Count: 18 open follow-ups** — 6 raised by this review (FU-09, FU-10, FU-11, FU-12, FU-18, FU-19), 2 escalated in priority or scope from a contributor document (FU-01, FU-08), 1 carried forward from Stages 3/4 that neither architecture document tracked (FU-16), 9 inherited substantially as written. **8 items closed** at this gate (§4).

---

## 7. Does This Warrant a New ADR?

**Ruling: No new ADR is issued at Stage 5 exit.**

**Reasoning for "no":**
- `05-development-standards.md` sets the bar at decisions that are "expensive to reverse, affect multiple teams, or set a precedent." Measured against that bar, everything the two documents decide falls into one of two buckets: (i) already inside ADR-0002's own Decision section, restated at enforcement-point granularity rather than newly decided — the mediation principle, Supabase-as-identity-SoR, audit events in Supabase, the `account_id` soft reference; or (ii) intra-domain detail whose correct home is the Stage 6 schema artifact or the Stage 7 OpenAPI contract, not an ADR — table shapes, endpoint groupings, enum values, index hot paths.
- Nothing here reverses, supersedes, or narrows ADR-0001 or ADR-0002. ADR-0002 already did the narrowing work; Stage 5 is executing inside the boundary it drew, which is exactly what should happen at this stage.
- An ADR that merely restates an accepted ADR at finer grain **degrades the ADR set** — it dilutes the signal that an ADR number means a genuine, contested, expensive-to-reverse choice, and it raises ADR cycle time (a metric this role is measured on) for no decision content.
- Practical consideration, stated openly: ADRs require `solution-architect` + `cto` ratification. Issuing one now would add a `cto` dependency to a gate I can close unilaterally, for a document that would contain no decision `cto` has not already ratified via ADR-0002.

**Reasoning against "no" — the honest counter-argument:** the most ADR-shaped thing in this review is the ephemeral counter store (§3, FU-08), because a third persistence surface genuinely is precedent-setting. I am declining to write it **now** rather than declining permanently, for one specific reason: the Stage 5 decision is *placement* (in front of, not inside, Supabase — which is mine to make and is made), while the *technology and hosting* decision is `cloud-infrastructure-architect`'s and cannot be pre-empted by me. ADR-0001 explicitly lists the hosting provider as an open decision owned by that role. Writing ADR-0003 today would either be contentless or would encroach on a decision this role explicitly does not own.

**Three conditional ADR triggers, registered with owners and deadlines** — so this is a scheduled decision, not a silent gap:

| Candidate | Fires when | Owner | Deadline |
|---|---|---|---|
| **ADR-0003 — third persistence surface for ephemeral auth state** | FU-08 lands on a persistent, separately-hosted component (Redis/managed KV) rather than an in-process or in-Postgres mechanism | Proposed by `cloud-infrastructure-architect` + `backend-architect`; ratified `solution-architect` + `cto` | Before Stage 8 exit |
| **ADR-0004 — PII deletion vs. anonymisation pattern for identity data** | FU-03 produces a POPIA ruling. This one is genuinely precedent-setting: it decides the pattern for **every** PII-bearing store on the platform, not just `app.accounts`, and the anonymise-in-place-preserve-the-key constraint (data-model §5) would bind every future cross-database reference. | Proposed by `compliance-specialist` + `database-architect`; ratified `solution-architect` + `cto` | Before Stage 8 exit |
| **ADR-0005 — platform session-token contract** | FU-18 lands on backend-minted tokens rather than Supabase JWT pass-through. That changes how *every* service authenticates for the platform's lifetime and materially changes ADR-0002's mediation guarantee from policy to structure. If FU-18 lands on pass-through, **no ADR is needed** — that is the status quo ADR-0002 already implies. | Proposed by `backend-architect` + `cybersecurity-architect`; ratified `solution-architect` + `cto` | Before Stage 7 exit |

---

## 8. The Gate Decision: Exit Now, Do Not Hold

**Ruling: Stage 5 EXITS NOW, conditionally.** Per `02-feature-lifecycle.md` (Stage 5 owner: `solution-architect`) and `01-raci-matrix.md`, this call is mine. Exercising it rather than listing options:

**Why exit rather than hold:**

1. **Stage 5's exit artifact is "approved approach," not "all questions answered."** The lifecycle defines the artifact as an approved approach plus an ADR if the decision is significant. An approved approach exists: service boundaries are drawn, the store-of-record split is honoured, the cross-database contract is specified and mutually consistent, and every business rule BR-2 through BR-7 has a named enforcement point. That is the deliverable.

2. **Every open item is either downstream-stage-owned or owned by a role whose input is a later stage's entry criterion.** RLS SQL is a Stage 6 deliverable by definition. The OpenAPI contract is Stage 7 by definition. `compliance-specialist`'s deletion ruling and `security-engineer`'s RLS review land at Stage 8, which is already a hard gate that cannot be bypassed. Holding Stage 5 would idle the feature waiting for work whose proper stage is later — which does not accelerate any of it, and delays the two stages (6 and 7) that can proceed productively right now.

3. **None of the open items can change the three things Stage 5 exists to settle** — the service boundary, the system-of-record split, or the `account_id` contract. I checked each against that test specifically. If any could, I would hold. FU-03 (deletion mechanism) comes closest, and even there both candidate resolutions preserve the boundary and the identifier contract; they differ only in downstream obligations.

4. **The item that could most plausibly have justified a hold — FU-01, the claim-freshness collision — is a contract question with a hard Stage 7 deadline, and Stage 6 does not depend on it.** `database-architect` has already ruled `app.accounts` authoritative (data-model §4), which is the schema-side answer. Stage 6 can produce complete DDL without FU-01 being resolved. Blocking Stage 6 on a Stage 7 question would be a sequencing error.

5. **The conservative defaults are already in place, so Stage 6 starts from a safe position rather than a blank one.** Own-row-only RLS (now ruled final for this feature, C3), default-deny on privileged actions (C4, C8), no speculative schema, no invented endpoints. A held gate would not make these safer; it would just delay their implementation.

6. **Precedent: ADR-0002 was itself ratified conditionally** — accepted with three named Required Follow-ups gating implementation rather than gating acceptance. That is the established pattern in this platform's governance for exactly this situation: a sound decision with honest, owned, deadlined residual risk. Applying a stricter standard to Stage 5 than the `cto` applied to the ADR that Stage 5 implements would be inconsistent.

**What "conditional" concretely means — the conditions are binding, not advisory:**

- **Stage 6 may begin immediately**, on the conservative defaults ruled in §4, and must close FU-03(partial), FU-06 and FU-12 before it exits.
- **Stage 7 may begin immediately** in parallel where it does not depend on schema, and **may not exit** until FU-01, FU-02(a), FU-07, FU-09, FU-10, FU-13, FU-18 and FU-19 are closed. This is the tightest constraint in this document and it is deliberate: these are inter-service contract questions, and a contract shipped with them open is a contract that will break.
- **Stage 8 may not exit** until every remaining item in §6 is closed. Stage 8 is `cybersecurity-architect`'s hard gate and nothing in this document softens it.
- **Stage 9 may not begin** until Stage 8 signs off **and** ADR-0002's three Required Follow-ups (FU-15) are complete. This review does not discharge them and no reading of this document should suggest otherwise.
- **If FU-01 or FU-18 is still open when Stage 7 believes it is ready to exit, that is an escalation to me, not a judgement call for the stage owner.** These two are where an architectural gap would most plausibly convert into a production incident, and they are the two I will personally re-review.

**Two of the eight closures in §4 (C3 and C4) materially reduce what Stage 6 was carrying.** `database-architect`'s conditional sign-off named the cross-account visibility scope as its primary reason for not claiming full Stage 6 readiness. That item is now decided, not deferred. Stage 6 enters in a stronger position than the contributor document anticipated.

---

## 9. Risk Register Entries for `technical-project-manager`

| Risk | Likelihood | Impact if realised | Mitigation / owner |
|---|---|---|---|
| FU-01 (claim freshness) is discovered at Stage 8 or Stage 9 rather than Stage 7 | Medium | Rework of the OpenAPI contract and every service's auth middleware; AC-8/AC-9 fail QA late | Hard Stage 7 exit condition; escalation to `solution-architect` if still open — `backend-architect` |
| Supabase's plan does not support the assumed RPO/RTO (no PITR at current tier) | Medium | Identity data recovery posture is weaker than stated; possible cost decision mid-build; touches ADR-0002's revisit trigger on the Supabase project relationship | FU-11, verified before Stage 8; escalate cost to `cto` — `cloud-infrastructure-architect` |
| FU-03 (deletion mechanism) stalls waiting on `compliance-specialist` availability | Medium | Stage 6 DDL cannot finalise the cascade decision; ADR-0004 slips; Stage 8 blocked | Split due-dates (Stage 6 for cascade, Stage 8 for full mechanism) so the DDL-blocking half is small — `compliance-specialist` |
| `mobile-architect`/`frontend-architect` never engage, and FR-20/FR-21 get designed by engineers at Stage 9 without architectural review | Medium | Device-binding and idle-timeout implemented inconsistently with the session contract; rework in the two P1 stories | FU-09/FU-10 as Stage 7 exit conditions — `technical-project-manager` to schedule |
| FU-16 (support-assisted reset process) never lands, and Stage 9 ships placeholder copy | Medium | A privileged user with both factors lost has a screen that names no real process; BR-4's `cto`-signed override has no operational path | FU-16 at Stage 8; already a live placeholder in `ui-design.md` §4.9 — `cybersecurity-architect` |
| Third datastore (FU-08) arrives at deployment as a surprise infrastructure line item | Low–Medium | Unbudgeted hosting cost; ops surface neither `devops-engineer` nor `site-reliability-engineer` planned for | FU-08 + ADR-0003 trigger before Stage 8 — `cloud-infrastructure-architect`, `cto` informed |
| Stage 11 is treated as optional and skipped | Low | The platform's most-called code path ships unmeasured | Ruled required (C5); recorded here so `technical-project-manager` plans capacity |

---

## 10. Pre-Approval Checklist (`solution-architect` self-review)

- [x] **Service boundaries and data ownership are explicit and documented.** Identity Service is the sole holder of a Supabase service-role credential and the sole writer of identity data (backend §2.1). Every future service depends on it; it depends on none of them. MongoDB ownership is untouched. No shared-database-as-integration anti-pattern anywhere — the one place it could have crept in (audit log location) was ruled explicitly (C1). `account_id` is confirmed opaque-reference-only (§2.1).
- [x] **All new external dependencies have a named decision-owner and are not silently assumed.** Supabase is ADR-0002-ratified with its own follow-up gate (FU-15). The one genuinely new dependency this feature introduces — a rate-limit counter store — is named, owner-assigned (`cloud-infrastructure-architect`), deadlined, and carries an ADR trigger (FU-08, ADR-0003). Email delivery for verification/reset is a real external dependency neither contributor document names as a vendor decision; it is `notification-engineer`'s per Stage 1 §5 and is out of Feature 001's own architectural scope, but I am recording here that its **failure mode** (verification email undelivered) is already handled by design — Stage 4 §4.1 Screen C's resend-with-cooldown — rather than assumed away.
- [ ] **Cross-service contracts are specified before implementation begins.** **Not yet, and correctly so** — the OpenAPI contract is Stage 7's exit artifact and no implementation is authorised before it. Left unchecked deliberately rather than marked satisfied: this is the checklist item FU-01 and FU-18 exist to protect, and I would rather it read as open than as prematurely closed. It converts to satisfied at Stage 7 exit, not here.
- [x] **Security and compliance implications reviewed with `cybersecurity-architect` / `compliance-specialist`.** Reviewed in the sense this stage permits: every PII, credential, location-adjacent and retention-touching decision is routed to a named owner with a deadline (FU-03, FU-04, FU-05, FU-06, FU-15, FU-16, FU-17). Neither role has yet signed anything, and **this document does not claim their sign-off** — Stage 8 remains a hard gate this review explicitly does not pre-empt. Checked because the routing is complete and gated, not because the reviews are done.
- [x] **Non-functional targets stated and testable.** §5. Provisional and honestly labelled as such, with validation owners (FU-11). Previously absent from both contributor documents; setting them is this role's job and they are set rather than deferred. The two that cannot honestly be asserted yet (upstream-dependent availability, RPO/RTO) are marked as blocked on a specific fact rather than filled in with a comfortable number.
- [x] **Failure modes for third-party integrations are designed for, not assumed away.** Supabase outage is the material one and is FU-02, with a Stage 7 component (error shape) and a Stage 8 component (session behaviour, monitoring). `backend-architect` raised this against their own interests, which is the right instinct. The cross-database integrity failure mode is designed for (write-time validation plus the deletion event, FU-13). I am not marking this item as fully discharged in substance — the design is scheduled, not complete — but the failure modes are named and owned rather than absent, which is what this item tests at Stage 5.
- [x] **Architecture is consistent with the ADR-0001 baseline stack, or a new ADR justifies deviation.** §3. Node.js/TypeScript backend, React/Vite/TS/Tailwind web, Expo RN mobile — all intact. The Supabase deviation is ADR-0002's, already ratified. The one potential third-datastore deviation is registered as ADR-0003's trigger rather than allowed to happen in code without a record (which is precisely the "architecture decisions made ad hoc in code without a corresponding ADR" risk this role monitors).
- [ ] **Affected domain architects have reviewed and signed off.** **Not fully — disclosed, not glossed.** `backend-architect` and `database-architect` have signed off (conditionally, both). `integration-architect` has no material surface here and their absence is correct. `mobile-architect`, `frontend-architect` and `cloud-infrastructure-architect` have not reviewed. This is the single weakest item on this checklist, it is why FU-09, FU-10 and FU-11 exist with Stage 7/8 deadlines, and it is the reason this gate closes **conditionally** rather than cleanly. Leaving it unchecked is the accurate record.

**Net:** six of eight satisfied; two left unchecked deliberately and explained, both converting at Stage 7. That ratio is consistent with a conditional exit and inconsistent with a clean one — which is exactly what this document is signing.

---

**Gate signed:** `solution-architect`, 2026-08-07 — **Stage 5 CLOSED, conditional exit.** 18 open follow-ups tracked (§6). 8 items closed (§4). No new ADR issued; 3 conditional ADR triggers registered (§7). Escalated to `cto`: FU-08 (third-datastore cost), FU-11 (Supabase plan/PITR cost), and the three ADR triggers, all of which require `cto` co-ratification if they fire.
