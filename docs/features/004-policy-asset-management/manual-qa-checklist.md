# Feature 004 — Manual QA Checklist (Phase 1)

**Owner:** `manual-qa-engineer`  
**Status:** Ready for execution — requires backend + mobile running, verified test accounts  
**Related:** [`qa-test-strategy.md`](./qa-test-strategy.md) §3

---

## Prerequisites

- [ ] Backend running with `MONGODB_URI`, Supabase credentials, Redis (or in-memory dev fallback)
- [ ] Mobile app pointed at backend (`EXPO_PUBLIC_API_BASE_URL`)
- [ ] **Two customer test accounts** (A and B) with verified (`active`) state — or dev bypass for BR-2 documented
- [ ] Brevo configured (`BREVO_API_KEY` + `EMAIL_FROM`) **or** dev signup links captured from server logs

---

## 1. Cross-account isolation (IDOR)

| # | Steps | Expected |
|---|---|---|
| 1.1 | As customer A, note an asset ID from the API or app | — |
| 1.2 | As customer B, attempt `GET /api/v1/assets/{A's asset id}` (curl or proxy) | **404** |
| 1.3 | As customer B, attempt `GET /api/v1/policies/{A's policy id}` | **404** |
| 1.4 | As customer B, list assets and policies in app | No rows belonging to A |

---

## 2. BR-2 verification gate

| # | Steps | Expected |
|---|---|---|
| 2.1 | Sign up new user; do **not** verify email | Account `pending_verification` |
| 2.2 | Tap **Create policy** or **Register asset** | Routed to verification gate; write not submitted |
| 2.3 | Verify email; log in again | Writes succeed |

---

## 3. Policy flow (MP-3)

| # | Steps | Expected |
|---|---|---|
| 3.1 | Create policy with free-text plan tier (e.g. "Advisor tier 2") | **201**; tier stored as entered |
| 3.2 | View policy detail | `coverageLimits: []`, `billing.billingStatus: not_configured` |
| 3.3 | Confirm UI has **no** pricing, tier comparison, or "paid coverage" copy | Honest empty/not-configured messaging |

---

## 4. Asset registration — eight types

For each type, register one asset with required fields only; confirm **201** and detail screen shows correct `details`:

- [ ] Vehicle (make, model, year, VIN)
- [ ] Smartphone (brand, model, IMEI)
- [ ] Laptop
- [ ] Tablet
- [ ] TV
- [ ] Desktop
- [ ] Business equipment
- [ ] Other electronics

| # | Steps | Expected |
|---|---|---|
| 4.1 | Submit vehicle without VIN | Client and/or server validation error |
| 4.2 | Confirm no photo/camera affordance | MP-5 — photos deferred |

---

## 5. Offline / error UX

| # | Steps | Expected |
|---|---|---|
| 5.1 | Load assets list; enable airplane mode; pull to refresh | Offline warning or cached data message |
| 5.2 | Stop backend; attempt register | Error message, no crash |

---

## Sign-off

| Role | Name | Date | Pass/Fail |
|---|---|---|---|
| `manual-qa-engineer` | | | |
| Notes | | | |
