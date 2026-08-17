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
