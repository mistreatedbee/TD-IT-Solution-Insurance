# Feature 007 — Compliance Review: Notifications (POPIA)

**Owner:** `compliance-specialist`  
**Status:** **Design-time compliance flags** — **NOT legal sign-off**  
**Framework:** POPIA (South Africa) — see [`docs/features/001-authentication/compliance-review-supabase.md`](../001-authentication/compliance-review-supabase.md)

---

## 1. Purpose

Identify privacy and regulatory considerations for email, **mobile push**, SMS, and in-app notifications before implementation. Engineering must resolve flagged items with compliance before Stage 8 Security Review sign-off per channel phase.

---

## 2. Personal information in notifications

| Data type | Email | Push | SMS | Rule |
|---|---|---|---|---|
| Name | Allowed | Allowed | Allowed | Minimum necessary |
| Email address | Allowed | Avoid | Avoid | Push/SMS use account binding |
| Phone number | Mask if shown | — | Required for SMS | |
| Policy / claim numbers | Allowed | Allowed | Short form OK | |
| **Precise GPS coordinates** | **Avoid** | **Prohibited** | **Prohibited** | Deep link to authenticated in-app map |
| Last seen (city/region) | Caution | Caution | Avoid | Prefer "Open app" |
| Payment amounts | Allowed | Allowed | Avoid detail | |
| Auth tokens / OTP | OTP only in AUTH-005 | **Never** | OTP only if channel | |
| Other customers' data | **Never** | **Never** | **Never** | IDOR prevention |

---

## 3. Lawful basis (indicative — confirm with DPO)

| Category | Likely basis | Notes |
|---|---|---|
| Auth & security | Legitimate interest / contract | Service delivery |
| Policy & billing | Contract | Insurance subscription |
| Theft / recovery alerts | **Vital interest / contract** | May limit opt-out — **confirm with legal** |
| Marketing | **Consent** | Separate opt-in; unsubscribe |
| Admin internal | Legitimate interest (ops) | Staff only |

**C-NOTIF-1:** Theft-critical push opt-out policy requires explicit product + legal decision (see OQ-N02 in architecture doc).

---

## 4. Cross-border processing

| Processor | Data | Location | Action |
|---|---|---|---|
| Resend | Email content, recipient email | US (verify DPA) | DPA + s72 assessment — same as auth email |
| Expo / Apple / Google | Push tokens, message content | US | DPA before production push |
| SMS vendor (TBD) | Phone, message body | TBD | Full s72 before selection |

Update RoPA when Notification Service goes live.

---

## 5. Retention

| Record | Proposed retention | Flag |
|---|---|---|
| Delivery metadata (no body) | 24 months | C-NOTIF-3 — confirm with DPO |
| Rendered email HTML | Do not store | |
| Push payload logs | 90 days | Minimize `data` fields |
| SMS content | Provider default; mirror metadata only | |
| Preference / consent | Life of account + 6 years | Insurance recordkeeping |

---

## 6. Consent & preference centre

| Requirement | Status |
|---|---|
| Granular channel preferences | **PLANNED** |
| Marketing separate from transactional | **Required** |
| Audit trail of consent changes | **PLANNED** |
| Easy unsubscribe (marketing email) | **Required** |
| Export/delete on account deletion | **PLANNED** — tie to auth deletion flow |

**C-NOTIF-2:** Transactional theft alerts vs marketing must be clearly separated in UI copy (`ux-researcher`).

---

## 7. Security controls (notification-specific)

- Push tokens stored hashed at rest (recommended)
- Rate limit notification APIs per account
- Admin notifications must not leak customer PII to wrong role (RBAC)
- Webhook signatures for Resend/Expo delivery status
- No customer notification content in application error logs

---

## 8. Children's data

Platform is not directed at minors. If date-of-birth collected, do not trigger marketing notifications without age gate.

---

## 9. Pre-go-live checklist (per channel)

### Email (beyond auth)
- [ ] Template legal disclaimer present (signature block)
- [ ] RoPA updated
- [ ] Resend domain verified
- [ ] Bounce/complaint handling runbook

### Push
- [ ] Expo DPA / subprocessors documented
- [ ] Payload review — no coords/tokens
- [ ] Preference centre tested
- [ ] Token deletion on logout

### SMS
- [ ] Vendor s72 complete
- [ ] Opt-in evidence for marketing SMS
- [ ] STOP keyword handling

---

## 10. Open compliance questions

| ID | Question | Owner |
|---|---|---|
| C-NOTIF-1 | Can customers disable theft push while policy active? | Legal + PM |
| C-NOTIF-2 | Is SMS for theft fallback legitimate interest without separate SMS marketing consent? | Legal |
| C-NOTIF-3 | Exact retention for `notification_deliveries` | DPO |
| C-NOTIF-4 | Security-company emails — controller vs processor role | Legal |

**This document does not constitute legal advice.**
