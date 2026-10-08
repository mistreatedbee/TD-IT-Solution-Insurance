# 08 — QA Test Plan · Security Review · Accessibility

---

## 1. Security review (Stage 8 checklist — pre-implementation)

| Item | Owner | Status |
|------|-------|--------|
| Self-device location consent + opt-out | `security-engineer` | Phase 1 exists; review on home redesign |
| No location leakage cross-account | IDOR tests | Existing asset tests — extend |
| Partner location read audit (AUD-9) | `cybersecurity-architect` | **Open** — required before security map |
| Profile/KYC data classification | `compliance-specialist` | **Open** — POPIA |
| ID masking in customer UI | `security-engineer` | Design rule — implement Phase 2 |
| Emergency report abuse rate limit | Existing recovery limits | Verify |
| Operator RBAC | `authentication-engineer` | Future roles — stub in UI |

**Gate:** Customer home redesign (Phase 1) can proceed without new backend PII.  
**Block:** Security partner live map until AUD-9 wiring approved.

---

## 2. QA test plan

### Phase 1 — Customer home

| ID | Scenario | Expected |
|----|----------|----------|
| H-01 | Active account, 3 assets, 1 smartphone tracked | Correct counts in stat row |
| H-02 | Laptop asset | Shows "Tracking unavailable" |
| H-03 | Stale location (>15 min self-device) | "Last known" not "Online" |
| H-04 | pending_verification | Banner + write gate |
| H-05 | Pull to refresh | All sections update |
| H-06 | Offline mode | Cached data + banner |
| H-07 | Zero assets | Empty state CTA |

### Phase 1 — Asset vault redesign

| ID | Scenario | Expected |
|----|----------|----------|
| A-01 | Asset list | Photo placeholder, status chips |
| A-02 | Tap asset | Command view with capability grid |
| A-03 | Smartphone | Enable tracking flow works |

### Phase 7 — Lost/stolen

| ID | Scenario | Expected |
|----|----------|----------|
| R-01 | Report stolen | Case ref returned |
| R-02 | Duplicate active case | Conflict handled |
| R-03 | Security notified | Push to operators (existing) |

### Phase 8 — Security dashboard

| ID | Scenario | Expected |
|----|----------|----------|
| S-01 | Operator login | Queue loads |
| S-02 | Claim case | Status updates |
| S-03 | Location panel | Only with authorized API + audit |

### Regression

- Run `cd backend && npm test` (205+ tests)
- Run `cd mobile && npm test` (75+ tests)
- Web `npm run typecheck`

### E2E (future)

- Detox: home loads live data
- Manual: theft report → operator push → case detail

---

## 3. Accessibility checklist

- [ ] Status never color-only
- [ ] Map markers have accessibilityLabel
- [ ] Touch targets ≥ 44pt
- [ ] Alert severity announced to screen readers
- [ ] Reduced motion disables health pulse
- [ ] Form errors linked to fields

---

## 4. Error / loading / offline states

Reuse `mapUserFacingError` — no raw API messages.

| State | Pattern |
|-------|---------|
| Loading | Skeleton on home sections |
| Error | InlineAlert + retry per section |
| Empty | Illustration + single CTA |
| Offline | NetworkProvider banner + stale timestamp label |
| Permission denied | Location primer + Settings deep link |

---

## 5. Future feature recommendations

| Feature | Tag | Notes |
|---------|-----|-------|
| AI risk scoring | FUTURE | Guardrails per recommendation-engine-specialist |
| Predictive theft alerts | FUTURE | Needs telemetry history |
| Biometric app unlock | NICE TO HAVE | Expo LocalAuthentication |
| Apple/Google wallet policy card | FUTURE | |
| WhatsApp alert channel | REQUIRES CLIENT DECISION | |
| Family/multi-driver accounts | REQUIRES CLIENT DECISION | |

---

## 6. Compliance ruling — security-partner case visibility (appended 2026-10-08, `compliance-specialist`)

*Append-only. §1–§5 are unchanged; this section adds to §1's Stage 8 table without editing it.*

Full ruling: [`compliance-review-security-partner-data-minimisation.md`](compliance-review-security-partner-data-minimisation.md).
Partner agreement requirements: [`../../organization/partner-operator-agreement-requirements.md`](../../organization/partner-operator-agreement-requirements.md).

**Summary.** A shared unclaimed pool is lawful under POPIA only as a **de-identified offer tier**. As
built (`buildPartnerOrgQuery`, `recovery-cases.ts:192`), every partner org receives `accountId`,
`assetId` and customer free-text `notes` on every open case before claiming it — excessive under s10.
Identifying fields go only to the claiming org; `accountId` is withdrawn from the partner surface at
every stage. Admin-assigned dispatch is preferred but not mandated; the model is a Client decision (G-7).

| Item (adds to §1) | Owner | Status |
|------|-------|--------|
| PDM-1 remove `accountId` from partner API + both UIs | `backend-engineer`, web, mobile | **Open — pilot blocker** |
| PDM-2 offer-tier vs assigned-tier projection/serialiser | `backend-engineer` | **Open — pilot blocker** |
| PDM-3 `findByIdForPartnerOrg` unclaimed branch limited to `status: 'open'` | `backend-engineer` | **Open — pilot blocker** |
| PDM-4 90-day post-closure partner visibility window | `backend-engineer` | Open |
| PDM-5 drop `assetName` from partner push | `backend-engineer` | **Open — pilot blocker** |
| PDM-6 partner registry tied to executed agreement | `backend-architect` | **Open — pilot blocker** |
| PDM-7 remove "police case number" prompt from theft-report `notes` hint | `mobile-engineer` + UX | **Open — pilot blocker** |
| PDM-8 subject-keyed audit on partner detail reads (RR-012-2) | `cybersecurity-architect` | **Open — pilot blocker** |
| PDM-9 customer s18 disclosure at theft report | `technical-writer` + `mobile-engineer` | **Open — pilot blocker** |
| Executed partner operator agreement (s21) | TD IT Solution (Pty) Ltd | **Open — pilot blocker** |

**Gate:** no pilot partner sees real customer data until the blockers above, CT-1 (required form) and
G-7 close. QA additions for §2 Phase 8: assert `accountId` absent from every `/v1/security/cases*`
response; assert an unclaimed case's list and detail responses omit `notes`/`assetId`/`lastLocationAt` (the
claim response, now assigned to the caller, may include them);
assert detail on an unclaimed non-`open` case returns 404.

---

## 7. Stage 8 — Security Operations slice, chaired review (appended 2026-10-08, `cybersecurity-architect`)

*Append-only. §1–§6 are unchanged.*

Full record: [`security-review-security-operations.md`](security-review-security-operations.md). **Verdict: CONDITIONAL
SIGN-OFF (chair); joint gate incomplete; not pilot-ready.** This covers the Security Operations slice only, not the rest of Feature 009.

Status against §6's table, from reading the code: PDM-1, PDM-3, PDM-5 and PDM-7 are **implemented**. PDM-2 is **implemented on read
paths**, with write-path read-backs still open (SR-009S-3). `accountId` is kept in the fetch for audit, which is accepted as DEV-009S-1 and
needs compliance concurrence. PDM-4 is **implemented**, but a status-regression bypass remains (SR-009S-6). PDM-8 is **implemented, but
the `admin_access_log` validator rejects every row it writes** (SR-009S-1, blocking). PDM-9 in-app copy is **implemented**, and the
privacy-notice update is not verified. PDM-6 and the executed agreement are **still open**.
QA additions for §2 Phase 8: exact-key response allowlists per tier (SR-009S-2), C-B fail-closed on claim/PATCH (SR-009S-4), cursor
page-2 cross-tenant regression (SR-009S-5).
