# Feature 004 — QA Test Strategy (Stage 10)

**Lifecycle stage:** 10 — QA Testing  
**Owner (A):** `qa-architect`  
**Contributors:** `automation-qa-engineer`, `manual-qa-engineer`  
**Status:** Ratified for Phase 1 customer surface (MP-1)  
**Related:** [`business-requirements.md`](./business-requirements.md) AC-1–AC-8, [`security-review.md`](./security-review.md), [`manual-qa-checklist.md`](./manual-qa-checklist.md)

---

## 1. Scope

Phase 1 **customer** policy/asset surface only:

- Backend: six endpoints under `/api/v1/policies*` and `/api/v1/assets*`
- Mobile: Policy/Assets tabs, create/register/detail flows
- **Out of scope:** admin routes, GPS, payments, photos, edit/cancel

---

## 2. Test pyramid

| Layer | Owner | Target | Status |
|---|---|---|---|
| **Unit** | `backend-engineer` / `mobile-engineer` | Repos, validators, serializers, screen components with mocks | **Green** — backend 85 tests; mobile 30 tests |
| **API contract** | `automation-qa-engineer` | Route tests with in-memory fakes (ownership, idempotency, gates, validation) | **Green** — `policies.test.ts`, `assets.test.ts` incl. list cross-account isolation |
| **Integration** | `automation-qa-engineer` | Live Mongo + Supabase test project (separate DB name per MP-8) | **Not started** — blocked on staging Mongo DB name |
| **E2E (mobile)** | `automation-qa-engineer` | Maestro scaffold at `mobile/e2e/` — signup → verify → login → register asset | **Scaffold only** — blocked on Brevo or test bypass |
| **Manual** | `manual-qa-engineer` | Cross-account isolation, eight-type form on device | Checklist filed — [`manual-qa-checklist.md`](./manual-qa-checklist.md) |

---

## 3. Critical scenarios (must pass before internal distribution)

### 3.1 Security / RBAC

- Customer A cannot `GET` customer B's policy or asset by ID (**404**, not 403)
- Customer A's list endpoints never include B's rows
- `POST` writes return **403 ACCOUNT_NOT_ACTIVE** when `accountState !== active`
- Unauthenticated requests return **401**

### 3.2 Business rules (MP-3)

- `planTier` accepted as opaque string; no server-side tier enum
- `coverageLimits` always `[]` on create
- No policy prerequisite for asset registration (documented gap)
- Mobile UI does not show pricing/paid-coverage copy when `billingStatus: not_configured`

### 3.3 Resilience

- Mongo unreachable → **503 UPSTREAM_UNAVAILABLE** (P-12)
- Idempotency-Key replay returns same response; different body → **409**

### 3.4 Mobile UX

- Empty states when no policies/assets (no fake data)
- BR-2 gate: pending verification → verification-gate, not silent failure
- All eight asset types: required fields validated client-side before submit

---

## 4. CI gates (M-08)

`.github/workflows/ci.yml` runs lint, typecheck, and unit tests for root, `backend/`, and `mobile/` on every PR to `main`.

**Not in CI yet:** live-stack integration, E2E, load tests.

---

## 5. Environment strategy (MP-8)

| Environment | MongoDB | Supabase | Use |
|---|---|---|---|
| Local dev | Atlas shared project | Live dev project | Engineer daily work |
| CI | None (fakes) | None | Unit/route tests |
| Staging (target) | Separate database name on Atlas | Staging project or branch | Integration + manual QA |
| Production | Production cluster | Production | Post go-live |

Stage 10 **may** run against a dedicated Mongo **database name** on the existing Atlas cluster before full staging exists; production go-live requires separate staging per MP-8.

---

## 6. Exit criteria (Stage 10 sign-off)

- [ ] All §3 scenarios pass on staging or dedicated test DB
- [ ] Manual checklist signed by `manual-qa-engineer`
- [ ] No P0/P1 open from `security-review.md` SR-004-* blockers except documented owner actions (Brevo account)
- [ ] CI green on `main`

**Signed:** `qa-architect`, 2026-08-12 (strategy); execution sign-off pending checklist completion.
