# Feature 004 — Security Review (Stage 8)

**Status:** **SIGN-OFF GRANTED WITH REQUIRED CHANGES** — Phase 1 customer surface only (MP-1).
**Date:** 2026-08-12
**Lifecycle stage:** 8 — Security Review. **Chair / decision owner (A):** `cybersecurity-architect`.
**Joint gate:** `security-engineer` (R) · `compliance-specialist` (C — retention/anonymization P-04/P-05 still open for this domain).
**Consumes:** [`field-sensitivity-review.md`](./field-sensitivity-review.md) (P-14 Phase 1 stub, 2026-08-11).
**Scope boundary:** Customer endpoints only — `POST/GET /v1/policies`, `GET /v1/policies/{id}`, `POST/GET /v1/assets`, `GET /v1/assets/{id}`. Admin policy/asset routes and `admin_access_log` are **out of scope** for this sign-off (MP-1); they require a separate Stage 8 when built.
**Reviewed against:** [`06-security-standards.md`](../../organization/06-security-standards.md), [`api-design.md`](./api-design.md), [`database-design.md`](./database-design.md), [`business-requirements.md`](./business-requirements.md), ADR-0002, ADR-0006 (Trail B design only — no live writer).
**Running code read:** `backend/src/routes/policies.ts`, `assets.ts`, repositories, `feature004-collections.ts`, `mongo-bootstrap.ts`, `lib/asset-validation.ts`, `lib/account-gate.ts`, `lib/mongo-errors.ts`, `middleware/error-handler.ts`; `mobile/src/api/policies.ts`, `assets.ts`, policy/asset screens.

---

## 0. Verdict

**SIGN-OFF GRANTED WITH REQUIRED CHANGES** for Feature 004 **Phase 1 customer surface**.

The implementation matches the ratified contract: customer JWT scoping, live account gate on writes (BR-2), idempotency on mutating endpoints, per-route rate limits (MP-7), fixed error catalogue (SR-19), and no invented business rules (MP-3). P-14's Phase 1 field-sensitivity ruling (no FLE for VIN/IMEI/serial/`estimatedValue`; Mongo at-rest + RBAC + audit) is adequate for this slice.

**Required before treating Stage 9/10 as complete for this push:**

| ID | Item | Owner |
|---|---|---|
| **SR-004-1** | **Brevo live** — email verification still `console.warn`; no real user passes BR-2 gate | Platform owner |
| **SR-004-2** | **Stage 10** — cross-account isolation E2E, eight-type registration on device, verification gate on writes | `qa-architect` / `manual-qa-engineer` |
| **SR-004-3** | **Admin surface re-review** — when `/admin/policies*` or `/admin/assets*` ships, full Stage 8 repeat + AUD-3 Trail B + C-14 | `security-engineer` |
| **SR-004-4** | **Retention/anonymization** — P-04/P-05 for policies/assets not ruled (`compliance-specialist`) | `compliance-specialist` |
| **SR-004-5** | **Object storage** — asset photos deferred (MP-5); re-review when vendor selected | `integration-architect` + `cybersecurity-architect` |

**Closed by this review:**

| ID | Item |
|---|---|
| **P-12** | Mongo connectivity → `503 UPSTREAM_UNAVAILABLE` via `lib/mongo-errors.ts` + `error-handler.ts` (tested) |
| **P-14 (Phase 1)** | Consumed from `field-sensitivity-review.md` — no field-level encryption required |

---

## 1. Threat model (Phase 1)

**Assets protected:** Customer policy records, asset registry (including VIN, IMEI, serial numbers, estimated value), linked to identity via `accountId`.

**Trust boundaries:**
- Customer mobile app → Backend API (bearer JWT, Feature 001)
- Backend → MongoDB Atlas (server credential only, ADR-0002)
- Backend → Supabase Postgres (account status live-read on writes only, §4.3)

**Primary threats:**
1. **IDOR / BOLA** — customer A reads or mutates customer B's policy/asset
2. **Unverified write** — `pending_verification` account creates policy/asset despite BR-2
3. **Sensitive field leakage** — VIN/IMEI/serial in logs, error messages, or unauthorized responses
4. **Bulk scraping** — unauthenticated or over-limit enumeration
5. **Mongo outage misreporting** — raw driver errors or opaque 500s

---

## 2. Controls verified in code

### 2.1 Authorization

- All six endpoints require `authenticate` middleware; `accountId` derived from JWT `sub` only — never from request body (api-design §4.2).
- List/detail queries filter by authenticated `accountId`; cross-account ID returns **404** (not 403) — tested in `policies.test.ts` / `assets.test.ts`.
- `requireActiveAccount()` live-reads `GET /v1/internal/accounts/{id}/status` on **writes**; returns `403 ACCOUNT_NOT_ACTIVE` when not `active`.

### 2.2 Input validation

- `planTier`: non-empty string (no closed enum — MP-3).
- Asset `details`: per-`assetType` Zod schemas in `lib/asset-validation.ts` mirror OpenAPI `oneOf`.
- MongoDB `$jsonSchema` validator on `assets` collection (bootstrap) — second line of defense.

### 2.3 Idempotency & rate limiting

- `POST /policies` and `POST /assets`: `Idempotency-Key` required (Feature 001 mechanism).
- Explicit `createRateLimiter` per route (MP-7); keys scoped per account.

### 2.4 Error handling & outage modes

- SR-19: only `ApiError` catalogue messages on 4xx; upstream strings collapsed.
- **P-12:** `MongoNetworkError` / selection / timeout → `503 UPSTREAM_UNAVAILABLE` with `Retry-After: 5`.

### 2.5 Field sensitivity (P-14)

Per `field-sensitivity-review.md`: VIN, IMEI, serial numbers, license plate, `estimatedValue` are **not** payment/ID-document/location-grade in Phase 1. Stored in MongoDB with Atlas encryption-at-rest; access via RBAC + future audit (Trail B when admin routes exist). **No field-level encryption** in Phase 1. Revisit when GPS location history or claims ID documents ship.

### 2.6 Mobile client

- Policy/Assets screens use generated types from OpenAPI; no hand-invented field names.
- Write paths gate via `fetchLiveAccountForGating()` (not cache-backed).
- UI does not imply paid coverage when `billingStatus: not_configured` (AC-8).

---

## 3. Residual risks (accepted for Phase 1)

| Risk | Mitigation / owner |
|---|---|
| MongoDB credential compromise | Atlas IP allowlist, credential rotation, ADR-0008 formal provisioning (`database-architect`) |
| No admin audit trail for policy/asset reads yet | MP-1 defers admin routes; Trail B paper-complete (FU-A2) |
| Free-form `planTier` string | MP-3 intentional until D-01–D-04; no eligibility fraud surface in Phase 1 |
| Same Atlas DB for dev and prod (MP-8) | Separate DB name minimum for Stage 10; staging before go-live |
| JWT theft on device | Feature 001 controls (SecureStore refresh, short access TTL) — not re-reviewed here |

---

## 4. Out of scope (explicit)

- Admin `/admin/policies*` / `/admin/assets*` and `admin_access_log` writer
- GPS pairing, location history, claims, payments
- Asset photo upload (MP-5)
- Penetration test / load test (Stage 10 / `performance-engineer`)

---

## 5. Sign-off record

| Role | Status | Date |
|---|---|---|
| `cybersecurity-architect` | Sign-off granted with SR-004-1…5 required changes | 2026-08-12 |
| `security-engineer` | **Concurrence granted** — code review verified §2 controls in running implementation; SR-004-1…5 remain open items, not blockers for Phase 1 customer surface sign-off | 2026-08-12 |
| `compliance-specialist` | Pending P-04/P-05 retention ruling | — |

**Signed:** `cybersecurity-architect` (designated Stage 8 chair), 2026-08-12.  
**Concurrence:** `security-engineer`, 2026-08-12 — verified `policies.ts`, `assets.ts`, `account-gate.ts`, `mongo-errors.ts`, mobile write gating; no new findings beyond SR-004-1…5.
