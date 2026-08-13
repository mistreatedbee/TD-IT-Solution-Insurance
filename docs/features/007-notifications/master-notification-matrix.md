# Feature 007 — Master Notification Matrix

**Channels:** Email (E) · Push / app (P) · SMS (S) · In-app inbox (I) — see legend  
**Status key:** **SHIPPED** · **PLANNED** · **BLOCKED** (upstream missing)  
**Last updated:** 2026-08-13

Primary planning document — **not legal sign-off**. Compliance flags in [`compliance-review-notifications.md`](compliance-review-notifications.md).

---

## Legend

| Symbol | Meaning |
|---|---|
| **●** | Required channel for this event |
| **○** | Optional / preference-based |
| **—** | Not used |
| **●\*** | Required with fallback rules (e.g. SMS if push fails) |
| **BLOCKED** | Cannot implement until upstream feature exists |

**Priority:** CRITICAL · HIGH · NORMAL · LOW

---

## 1. Authentication & account security

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AUTH-001 | Email verification requested | Customer | ● | ○ | — | NORMAL | Supabase signup / email change | `signup` / `email_change` | `customer_first_name`, `action_url` | **SHIPPED** | Via Supabase hook → Resend |
| AUTH-002 | Password reset requested | Customer | ● | — | — | HIGH | Supabase recovery | `recovery` | `action_url` | **SHIPPED** | Link only — no password in email |
| AUTH-003 | Magic link sign-in | Customer | ● | — | — | HIGH | Supabase magiclink | `signup` variant | `action_url` | **SHIPPED** | |
| AUTH-004 | User invite (staff/partner) | Invitee | ● | — | — | NORMAL | Supabase invite | `invite` | `action_url`, role | **SHIPPED** | Admin/security onboarding |
| AUTH-005 | Reauthentication OTP | Customer | ● | — | ○ | HIGH | Supabase reauthentication | `reauthentication` | OTP code | **SHIPPED** | SMS OTP only if Supabase SMS enabled |
| AUTH-006 | Email address changed | Customer | ● | ○ | — | HIGH | Supabase email_change | `email_change` | old/new email | **PLANNED** | Confirm both addresses |
| AUTH-007 | Password changed successfully | Customer | ● | ● | ○ | HIGH | Password reset confirm | `AUTH-007` | `customer_first_name`, `changed_at` | **SHIPPED** | Email + push on reset confirm |
| AUTH-008 | New device / browser login | Customer | ● | ● | ○ | HIGH | First login from device fingerprint | `AUTH-008` | device, location (city), `action_url` | **SHIPPED** | Checks session device_id history |
| AUTH-009 | Suspicious login blocked | Customer | ● | ● | ●\* | CRITICAL | Risk engine / rate limit | `AUTH-009` | `support_url` | **PLANNED** | SMS if push undelivered |
| AUTH-010 | MFA enabled / disabled | Customer | ● | ● | — | HIGH | Account security settings | `AUTH-010` | method | **SHIPPED** | MFA enroll verify; disable not built |
| AUTH-011 | Account locked (too many attempts) | Customer | ● | ○ | — | HIGH | Auth lockout | `AUTH-011` | unlock instructions | **SHIPPED** | Email + push on lockout |
| AUTH-012 | Account deleted / closure requested | Customer | ● | — | — | NORMAL | GDPR/POPIA deletion flow | `AUTH-012` | reference number | **PLANNED** | Retention notice in email |

---

## 2. Customer onboarding & welcome

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ONB-001 | Welcome — account created | Customer | ● | ○ | — | NORMAL | First verified login | `ONB-001` | `customer_first_name`, `dashboard_url` | **SHIPPED** | Email via Resend + push; deduped in MongoDB |
| ONB-002 | Onboarding incomplete reminder | Customer | ● | ○ | — | LOW | 24h / 72h no policy | `ONB-002` | step name | **SHIPPED** | Max 2 reminders; checked on login + `/account/me` |
| ONB-003 | First policy created | Customer | ● | ● | — | NORMAL | `POST /policies` success | `ONB-003` | `plan_name`, `policy_id` | **SHIPPED** | Email via Resend + push |
| ONB-004 | First asset registered | Customer | ● | ● | — | NORMAL | Asset create | `ONB-004` | `asset_name`, `asset_type` | **PLANNED** | Prompt push permission if not granted |
| ONB-005 | GPS device pairing instructions | Customer | ● | ○ | — | NORMAL | Asset with tracking plan | `ONB-005` | device model | **BLOCKED** | GPS vendor not chosen |
| ONB-006 | Profile incomplete (KYC) | Customer | ● | ○ | — | NORMAL | Missing required fields | `ONB-006` | missing fields list | **PLANNED** | POPIA — minimal PII in email |

---

## 3. Policy & subscription (insurance)

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| POL-001 | Policy pending activation | Customer | ● | ○ | — | NORMAL | Policy created, payment pending | `POL-001` | `plan_name`, `policy_id` | **SHIPPED** | Billing email on `POST /policies` (payment not built) |
| POL-002 | Policy activated | Customer | ● | ● | — | NORMAL | Payment confirmed + start date | `POL-002` | `plan_name`, effective date | **SHIPPED** | Wired via `POST /internal/policies/:id/activate` (payment not built — hook ready) |
| POL-003 | Policy renewal upcoming (30/7/1 day) | Customer | ● | ● | ○ | NORMAL | Login / `/account/me` check | `POL-003` | renewal date, amount | **SHIPPED** | No scheduler yet; deduped per threshold in MongoDB. Payment charge not built. |
| POL-004 | Policy renewed successfully | Customer | ● | ○ | — | NORMAL | Renewal charge success | `POL-004` | invoice link | **BLOCKED** | Payment gateway not built |
| POL-005 | Policy upgrade / downgrade | Customer | ● | ● | — | NORMAL | Plan change | `POL-005` | old/new plan | **PLANNED** | Proration in email not push |
| POL-006 | Policy cancellation scheduled | Customer | ● | ● | — | NORMAL | User or admin cancel | `POL-006` | end date | **PLANNED** | BA rules TBD |
| POL-007 | Policy cancelled / lapsed | Customer | ● | ● | ○ | HIGH | End date reached / non-payment | `POL-007` | `policy_id` | **PLANNED** | Asset tracking may stop |
| POL-008 | Coverage limit warning | Customer | ● | ○ | — | NORMAL | Asset value exceeds tier | `POL-008` | limit, asset | **PLANNED** | Business rules TBD |
| POL-009 | Policy document ready | Customer | ● | — | — | LOW | PDF generated | `POL-009` | download link | **PLANNED** | |

---

## 4. Assets & devices

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| AST-001 | Asset added | Customer | ● | ● | — | NORMAL | Asset create API | `AST-001` | `asset_name`, type | **SHIPPED** | Email via Resend + push |
| AST-002 | Asset updated | Customer | ○ | ○ | — | LOW | Material field change | `AST-002` | changed fields | **SHIPPED** | `PATCH /assets/:id`; material fields only |
| AST-003 | Asset removed | Customer | ● | ○ | — | NORMAL | Asset delete | `AST-003` | `asset_name` | **SHIPPED** | `DELETE /assets/:id` soft-delete |
| AST-004 | Asset marked lost/stolen (customer) | Customer | ● | ● | ●\* | CRITICAL | Report theft flow | `AST-004` | `asset_name`, case ref | **SHIPPED** | Same trigger as REC-001 |
| AST-005 | Asset recovered | Customer | ● | ● | ○ | HIGH | Case closed recovered | `AST-005` | `asset_name` | **SHIPPED** | Fires with REC-005 on status → `recovered` |
| AST-006 | GPS device assigned | Customer | ● | ● | — | NORMAL | Device linked to asset | `AST-006` | device name | **BLOCKED** | Device registry not built |
| AST-007 | GPS device unassigned | Customer | ● | ○ | — | NORMAL | Device removed | `AST-007` | | **BLOCKED** | |

---

## 5. GPS & tracking

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| GPS-001 | Device online (after offline) | Customer | ○ | ● | — | NORMAL | Ping resumed | `GPS-001` | device, asset | **BLOCKED** | Ingestion not built |
| GPS-002 | Device offline | Customer | ○ | ● | — | HIGH | No ping &gt; threshold | `GPS-002` | device, `last_seen_at` | **BLOCKED** | Throttle 4h; escalate if case open |
| GPS-003 | Battery critical | Customer | ○ | ● | — | HIGH | Battery &lt; threshold | `GPS-003` | device | **BLOCKED** | |
| GPS-004 | Geofence exit (normal mode) | Customer | ○ | ● | — | HIGH | Geofence rule | `GPS-004` | fence name | **BLOCKED** | No coords in push |
| GPS-005 | Geofence exit (theft mode) | Customer | ● | ● | ●\* | CRITICAL | Theft case active | `GPS-005` | case ref | **BLOCKED** | Highest priority push channel |
| GPS-006 | Suspicious movement pattern | Customer | ○ | ● | ○ | HIGH | Anomaly detection | `GPS-006` | | **BLOCKED** | Future AI — not in roadmap |
| GPS-007 | Location shared with security partner | Customer | ● | ○ | — | NORMAL | Case handoff | `GPS-007` | partner name | **BLOCKED** | No raw coords in email |
| GPS-008 | GPS provider outage (customer comms) | Customer | ○ | ● | — | HIGH | Provider SLA breach | `GPS-008` | status page | **BLOCKED** | Rare; template pre-approved |

---

## 6. Payments & billing

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PAY-001 | Payment successful / receipt | Customer | ● | ○ | — | NORMAL | Webhook charge success | `PAY-001` | amount, invoice | **BLOCKED** | No payment gateway |
| PAY-002 | Payment failed | Customer | ● | ● | ○ | HIGH | Webhook failure | `PAY-002` | amount, retry date | **BLOCKED** | Push → billing deep link |
| PAY-003 | Payment retry scheduled | Customer | ● | ● | — | HIGH | Dunning step N | `PAY-003` | retry date | **BLOCKED** | |
| PAY-004 | Subscription suspended (non-payment) | Customer | ● | ● | ●\* | CRITICAL | Max retries exceeded | `PAY-004` | | **BLOCKED** | Coverage may lapse |
| PAY-005 | Refund processed | Customer | ● | ○ | — | NORMAL | Refund webhook | `PAY-005` | amount | **BLOCKED** | |
| PAY-006 | Invoice / statement ready | Customer | ● | — | — | LOW | Monthly job | `PAY-006` | period | **BLOCKED** | |
| PAY-007 | Payment method expiring | Customer | ● | ● | — | NORMAL | Card expiry &lt; 30d | `PAY-007` | last4 | **BLOCKED** | |
| PAY-008 | Chargeback received | Customer + Admin | ● | — | — | HIGH | Dispute webhook | `PAY-008` | | **BLOCKED** | Internal alert too |

---

## 7. Theft, recovery & security operations

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| REC-001 | Theft report submitted | Customer | ● | ● | ○ | CRITICAL | Report theft API | `REC-001` | case ref, asset | **SHIPPED** | Email + push on `POST /recovery/cases` |
| REC-002 | Case assigned to security company | Customer | ● | ● | — | HIGH | Partner claim | `REC-002` | partner name | **SHIPPED** | Email + push on `POST /security/cases/:id/claim` |
| REC-003 | Recovery agent en route | Customer | ○ | ● | — | HIGH | Operator status update | `REC-003` | ETA window | **BLOCKED** | No ETA field yet |
| REC-004 | Asset located | Customer | ● | ● | ●\* | CRITICAL | GPS + operator confirm | `REC-004` | | **BLOCKED** | GPS ingestion not built |
| REC-005 | Recovery successful | Customer | ● | ● | ○ | HIGH | Case closed | `REC-005` | | **SHIPPED** | Email + push when status → `recovered` |
| REC-006 | Recovery unsuccessful / closed | Customer | ● | ● | — | HIGH | Case closed | `REC-006` | next steps | **SHIPPED** | Email + push when status → `closed` |
| REC-007 | Case escalated (SLA breach) | Admin | ● | ○ | — | HIGH | SLA timer | `REC-007` | case ref | **PLANNED** | |
| REC-008 | New case — security company | Security operator | ● | ○ | ● | CRITICAL | New assignment | `REC-008` | case ref, asset type | **BLOCKED** | Webhook preferred over email |
| REC-009 | Case update — security company | Security operator | ○ | ● | ○ | HIGH | Status change | `REC-009` | | **BLOCKED** | Portal + push if operator app |
| REC-010 | Customer contacted by recovery team | Customer | ○ | ● | — | NORMAL | Operator log | `REC-010` | | **BLOCKED** | |

---

## 8. Claims

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CLM-001 | Claim submitted | Customer | ● | ● | — | NORMAL | Claim create | `CLM-001` | claim number | **PLANNED** | Mobile UI scaffold only |
| CLM-002 | Claim received — under review | Customer | ● | ● | — | NORMAL | Status → review | `CLM-002` | | **PLANNED** | |
| CLM-003 | Additional info requested | Customer | ● | ● | ○ | HIGH | Adjuster request | `CLM-003` | deadline | **PLANNED** | |
| CLM-004 | Claim approved | Customer | ● | ● | — | NORMAL | Decision | `CLM-004` | amount | **PLANNED** | |
| CLM-005 | Claim partially approved | Customer | ● | ● | — | NORMAL | Decision | `CLM-005` | amount, reason | **PLANNED** | |
| CLM-006 | Claim denied | Customer | ● | ● | — | HIGH | Decision | `CLM-006` | reason summary, appeal | **PLANNED** | |
| CLM-007 | Payout initiated | Customer | ● | ○ | — | NORMAL | Finance action | `CLM-007` | amount | **PLANNED** | |
| CLM-008 | New claim — admin queue | Admin | ● | — | — | NORMAL | Claim create | `CLM-008` | | **PLANNED** | |

---

## 9. Administration (internal)

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ADM-001 | New customer registered | Admin | ● | — | — | LOW | Signup webhook / digest | `ADM-001` | count or single | **PLANNED** | Digest preferred |
| ADM-002 | High-value asset registered | Admin | ● | — | — | NORMAL | Value &gt; threshold | `ADM-002` | asset, value | **PLANNED** | |
| ADM-003 | Manual review required | Admin | ● | ○ | — | HIGH | Fraud/risk flag | `ADM-003` | reason | **PLANNED** | |
| ADM-004 | Daily ops digest | Admin | ● | — | — | LOW | Cron | `ADM-004` | KPIs | **PLANNED** | |
| ADM-005 | Plan catalogue changed | Admin | ● | — | — | NORMAL | Admin API audit | `ADM-005` | actor, plan | **PLANNED** | |
| ADM-006 | User role changed | Affected user + Admin | ● | — | — | HIGH | RBAC change | `ADM-006` | role | **PLANNED** | |

---

## 10. Customer support

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SUP-001 | Support ticket created | Customer | ● | ○ | — | NORMAL | Portal / email-in | `SUP-001` | ticket id | **PLANNED** | Support portal not built |
| SUP-002 | Agent replied | Customer | ● | ● | — | NORMAL | Ticket update | `SUP-002` | excerpt | **PLANNED** | |
| SUP-003 | Ticket resolved | Customer | ● | ○ | — | LOW | Close ticket | `SUP-003` | CSAT link | **PLANNED** | |
| SUP-004 | SLA breach — customer waiting | Admin | ● | — | — | HIGH | SLA timer | `SUP-004` | ticket id | **PLANNED** | |

---

## 11. Technical, DevOps & compliance

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| OPS-001 | API degraded / incident | DevOps / SRE | ● | ○ | ● | CRITICAL | Monitoring alert | `OPS-001` | incident id | **PLANNED** | PagerDuty-style |
| OPS-002 | Deploy success / failure | DevOps | ● | — | — | LOW | CI/CD | `OPS-002` | version | **PLANNED** | |
| OPS-003 | GPS ingestion backlog | DevOps + on-call | ● | — | ○ | HIGH | Queue depth | `OPS-003` | | **BLOCKED** | |
| OPS-004 | Email delivery failure spike | DevOps | ● | — | — | HIGH | Resend webhooks | `OPS-004` | | **PLANNED** | |
| OPS-005 | Push delivery failure spike | DevOps | ● | — | — | HIGH | Expo receipts | `OPS-005` | | **PLANNED** | |
| OPS-006 | Data breach suspicion | Security + Compliance | ● | — | ● | CRITICAL | SIEM / manual | `OPS-006` | | **PLANNED** | Runbook — not customer-facing |
| OPS-007 | Scheduled maintenance window | Customer | ● | ○ | — | NORMAL | Change calendar | `OPS-007` | window | **PLANNED** | 24h advance |

---

## 12. Marketing & education (opt-in only)

| ID | Event | Recipient | Email | Push | SMS | Priority | Trigger | Template | Variables | Status | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| MKT-001 | Product tips / recovery education | Customer | ○ | ○ | — | LOW | Opt-in campaign | `MKT-001` | | **PLANNED** | **Separate consent** |
| MKT-002 | Plan upgrade suggestion | Customer | ○ | ○ | — | LOW | Usage signal | `MKT-002` | | **PLANNED** | Guardrails per recommendation-engine |
| MKT-003 | Newsletter | Customer | ● | — | — | LOW | Opt-in | `MKT-003` | unsubscribe | **PLANNED** | |
| MKT-004 | Re-engagement (lapsed policy) | Customer | ● | ○ | — | LOW | Lapse + 30d | `MKT-004` | | **PLANNED** | Not transactional |

---

## 13. Channel summary by priority

| Priority | Typical Email | Typical Push | Typical SMS |
|---|---|---|---|
| **CRITICAL** | Confirmation + no sensitive detail | **Immediate** — `theft_critical` channel | Fallback if push fails &lt; 60s |
| **HIGH** | Full detail | Yes — relevant category | Rare — billing day 3 |
| **NORMAL** | Primary | If opted in | — |
| **LOW** | Digest / batch | Marketing opt-in only | — |

---

## 14. Implementation ownership map

| Domain | Primary agent | First matrix rows to wire |
|---|---|---|
| Auth email | `authentication-engineer` | AUTH-001–006 (**001–005 shipped**) |
| Auth push | `authentication-engineer` + `mobile-engineer` | AUTH-007–009 |
| Onboarding | `mobile-engineer` + `notification-engineer` | ONB-001–004 |
| Policy | `backend-engineer` + `payment-engineer` | POL-001–007 |
| GPS / theft | `gps-integration-engineer` | GPS-002, GPS-005, REC-001, REC-004 |
| Payments | `payment-engineer` | PAY-001–004 |
| Claims | `backend-engineer` | CLM-001–006 |
| Admin | `reporting-engineer` | ADM-001, ADM-004 |
| Templates / UX | `ui-designer` + `technical-writer` | All `email-template-catalogue` IDs |
| Compliance | `compliance-specialist` | Review before each phase go-live |

---

## 15. What is live today (summary)

| Shipped notifications | Channel |
|---|---|
| Signup / email verification | Email (Supabase hook) |
| Password reset | Email (Supabase hook) |
| User invite | Email (Supabase hook) |
| Magic link | Email (Supabase hook) |
| Reauthentication OTP | Email (Supabase hook) |
| Policy created | Email (Resend) + Push |
| Asset registered | Email (Resend) + Push |
| Theft case opened | Push |
| Password changed | Email + Push |
| New device login | Email + Push |
| MFA enabled | Email + Push |
| Account locked | Email + Push |
| Test notification | Push |

**Everything else in this matrix is PLANNED or BLOCKED.**

Push token registration, preferences API, and Expo send adapter are **SHIPPED**. Domain email requires `RESEND_API_KEY` + `EMAIL_FROM` on the **backend** (Render), separate from Supabase Edge Function secrets.
