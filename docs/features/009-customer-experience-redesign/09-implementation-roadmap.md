# 09 — Implementation Roadmap

**Prioritized phases · Feature classification on every item**

---

## Phase overview

| Phase | Theme | Duration est. | Backend required? |
|-------|-------|---------------|-------------------|
| **1** | Core customer experience (home + nav) | 2–3 weeks | Minimal |
| **2** | Profile & verification shell | 2 weeks | Yes — profile API |
| **3** | Asset vault + registration polish | 2–3 weeks | Partial (photos optional) |
| **4** | Device integration (hardware) | 4+ weeks | Yes + **vendor** |
| **5** | Live tracking + real maps | 2–3 weeks | Maps SDK |
| **6** | Alerts centre (server) | 2 weeks | Yes — alerts API |
| **7** | Lost/stolen + recovery polish | 1–2 weeks | Minor |
| **8** | Security operations dashboard | 3–4 weeks | Partner location + audit |
| **9** | Advanced (trips, geofences) | TBD | **HARDWARE** |
| **10** | Intelligence / AI | TBD | FUTURE |

---

## PHASE 1 — Core Customer Experience **← START HERE**

| Feature | Class | Owner |
|---------|-------|-------|
| Protection command centre home | **MUST HAVE** · SUPPORTED NOW | `mobile-engineer` |
| `useProtectionDashboard()` hook | **MUST HAVE** | `mobile-engineer` |
| Stat row + ProtectionHealthCard | **MUST HAVE** | `mobile-engineer` + `ui-designer` |
| Asset preview on home | **MUST HAVE** · SUPPORTED NOW | `mobile-engineer` |
| Map preview ( honest last-known ) | **MUST HAVE** · SUPPORTED NOW | `mobile-engineer` |
| Quick actions bar | **MUST HAVE** | `mobile-engineer` |
| Personalization copy engine | **SHOULD HAVE** | `mobile-engineer` |
| Re-tab navigation (Home/Assets/Map/Alerts/Account) | **SHOULD HAVE** | `mobile-architect` |
| Client-derived alert list | **SHOULD HAVE** | `mobile-engineer` |
| Web dashboard parity (basic) | **NICE TO HAVE** | `frontend-engineer` |

**Do not start:** hardware activation, KYC uploads, trip playback.

---

## PHASE 2 — Profile & Verification

| Feature | Class |
|---------|-------|
| Profile completion % + checklist UI | **MUST HAVE** · REQUIRES BACKEND |
| Extended profile API (Postgres/Mongo) | **REQUIRES BACKEND** |
| Verification centre states | **MUST HAVE** · REQUIRES BACKEND |
| ID masking display | **MUST HAVE** · REQUIRES CLIENT DECISION (POPIA) |
| Emergency contact fields | **SHOULD HAVE** |

---

## PHASE 3 — Asset Management

| Feature | Class |
|---------|-------|
| Premium asset vault cards | **MUST HAVE** |
| Asset command detail view | **MUST HAVE** |
| Vehicle-specific registration flow | **SHOULD HAVE** |
| Asset-type photo slots (UI only) | **NICE TO HAVE** · MP-5 gate for camera |
| Document upload | **REQUIRES BACKEND** + storage |
| Activity timeline (synthetic) | **SHOULD HAVE** |

---

## PHASE 4 — Device Integration

| Feature | Class |
|---------|-------|
| GPS vendor selection | **REQUIRES CLIENT DECISION** · `integration-architect` |
| TrackingProvider hardware adapter | **REQUIRES HARDWARE** |
| Device activation (scan/IMEI) | **REQUIRES HARDWARE** |
| Installation guide (configurable) | **SHOULD HAVE** |
| Device health screen | **SHOULD HAVE** · capability-gated |
| `tracking_devices` collection | **REQUIRES BACKEND** |

---

## PHASE 5 — Live Tracking

| Feature | Class |
|---------|-------|
| react-native-maps + web map lib | **MUST HAVE** |
| Full-screen protection map | **MUST HAVE** |
| Marker tap → asset sheet | **MUST HAVE** |
| Filter trackable assets | **SHOULD HAVE** |
| Follow asset / centre | **SHOULD HAVE** |
| Satellite toggle | **NICE TO HAVE** |
| Location history API | **REQUIRES BACKEND** |
| Trip playback | **FUTURE** |

---

## PHASE 6 — Alerts

| Feature | Class |
|---------|-------|
| Alerts tab + severity UI | **MUST HAVE** |
| Server alerts collection + API | **REQUIRES BACKEND** |
| Event bus from notifications | **REQUIRES BACKEND** |
| Geofence alerts | **FUTURE** · **REQUIRES HARDWARE** |

---

## PHASE 7 — Lost/Stolen & Recovery

| Feature | Class |
|---------|-------|
| Emergency report UX polish | **MUST HAVE** · SUPPORTED NOW |
| Customer recovery case detail | **SHOULD HAVE** |
| Case reference prominently shown | **MUST HAVE** |
| Wire case location when populated | **SHOULD HAVE** |

---

## PHASE 8 — Security Operations

| Feature | Class |
|---------|-------|
| KPI strip | **MUST HAVE** (case-based subset) |
| Live ops map (web) | **MUST HAVE** |
| Critical incident column | **MUST HAVE** |
| Case operational timeline | **SHOULD HAVE** |
| Partner location read + AUD-9 | **REQUIRES BACKEND** · compliance gate |
| Operator RBAC roles | **SHOULD HAVE** · REQUIRES BACKEND |
| Security mobile map upgrade | **SHOULD HAVE** |

---

## PHASE 9 — Advanced Analytics

| Feature | Class |
|---------|-------|
| Trip history + playback | **FUTURE** · **REQUIRES HARDWARE** |
| Geofencing CRUD | **FUTURE** |
| Admin/recovery analytics | **NICE TO HAVE** |

---

## PHASE 10 — Future Intelligence

| Feature | Class |
|---------|-------|
| Anomaly detection on GPS | **FUTURE** |
| Coverage recommendations | **FUTURE** · guardrails |

---

## Deliverables checklist (this design package)

| # | Deliverable | Document |
|---|-------------|----------|
| 1 | Current application audit | 01-current-state-audit.md |
| 2 | Existing functionality map | 01 §2 |
| 3 | New information architecture | 03 §2 |
| 4 | Customer navigation architecture | 03 §2 |
| 5 | Customer homepage wireframe | 05 |
| 6 | Asset management architecture | 03 §4.3, 07 |
| 7 | Profile completion flow | 03 §4.1 |
| 8 | Identity verification flow | 03 §4.2 |
| 9 | Vehicle onboarding flow | 03 §4.3 |
| 10 | GPS/device activation flow | 03 §4.4, 07 |
| 11 | Tracking experience | 04 §4–5, 05 §3 |
| 12 | Alert centre | 05 §4, 07 §6 |
| 13 | Lost/stolen flow | 03 §4.5 |
| 14 | Recovery flow | 03 §4.6 |
| 15 | Security dashboard architecture | 06 |
| 16 | Security incident workflow | 06 §4–5 |
| 17 | Admin/security permission matrix | 06 §5, 02 §1 |
| 18 | Database relationship recommendations | 07 §4 |
| 19 | Tracking provider abstraction | 07 §1–2 |
| 20 | Device capability architecture | 07 §3 |
| 21 | Notification architecture | 07 §6 |
| 22–27 | Empty/loading/error/offline/permission/responsive | 03 §5, 08 §4 |
| 28 | Accessibility requirements | 03 §6, 08 §3 |
| 29 | Security review | 08 §1 |
| 30 | QA test plan | 08 §2 |
| 31 | Future feature recommendations | 08 §5, 09 Phase 9–10 |

---

## Recommended immediate next step

**Approve Phase 1** → `mobile-engineer` implements Protection Command Centre home per `05-customer-home-dashboard.md` without new backend endpoints.

Parallel: `design-system-manager` signs off new composed components listed in `04-customer-ui-system.md`.

**Not approved for coding yet:** KYC, hardware GPS, security partner map, trip history, geofences.

---

## Agent assignment summary

| Next work | Agent |
|-----------|-------|
| Phase 1 home implementation | `mobile-engineer` |
| Component sign-off | `design-system-manager` |
| Profile API design | `backend-engineer` + `database-architect` |
| Partner location + audit | `gps-integration-engineer` + `security-engineer` |
| Hardware vendor ADR | `integration-architect` |
| POPIA on profile/KYC | `compliance-specialist` |
| Phase 1 QA | `automation-qa-engineer` |

---

## Pilot-Readiness Blockers — Security Company Dashboard

**Filed by:** `technical-project-manager` · **Date:** 2026-10-08
**Trigger:** `cto`'s 2026-10-08 pilot-partner readiness ruling, following
`compliance-review-security-partner-data-minimisation.md` and
`docs/organization/partner-operator-agreement-requirements.md`.
**Format:** follows the "Blockers to Watch" convention in
`docs/organization/sprint-plan-release-gate-a.md` — tracking entries only, no new analysis or
re-ruling. See the cited documents for the underlying findings; this section does not restate them.
**Common thread: all three are business/legal decisions owned by the business owner (+ counsel
where noted), not engineering tasks.** None has an engineering workaround.

| ID | What's blocked | Owner | What it gates |
|---|---|---|---|
| **G-7** | Dispatch-model decision: shared unclaimed pool (de-identified, any partner org sees any open case) vs. admin-assigned dispatch (staff manually assigns each case to exactly one partner). Open since `docs/organization/11-documented-client-instructions.md` §4 G-7; ruling confirms it is a Client/business-owner call, not a compliance one (`compliance-review-security-partner-data-minimisation.md` §2.4, §0.3) | Business owner | **PDM-6** (partner registry — registry design depends on which dispatch model it serves); the pilot launch itself (compliance sign-off at Stage 8 withheld until G-7 is answered, §6); whether an admin-assignment route is ever built |
| **CT-1** | Cross-border consent (data leaving South Africa to NextWave's hosting) currently sits at "informally acknowledged, not confirmed in the required form" (`docs/organization/10-data-protection-contract-obligations.md` §10.3) and needs **formal sign-off in that required form**, not the existing informal acknowledgement | Business owner | Any pilot with real customer data on the Security Company Dashboard (`compliance-review-security-partner-data-minimisation.md` §0.4, §6 gate position: "will not sign Stage 8 for a pilot with real customer data until every [PILOT] condition, CT-1 (required form), G-7 and an executed partner agreement are in place") |
| **Partner-operator agreement** | A signed POPIA s21 agreement with each pilot partner, per the drafted requirements at `docs/organization/partner-operator-agreement-requirements.md`. Three open counsel questions from that document's §7 (mirrored in the companion compliance ruling's §7) must also be answered before the agreement can be finalised: (a) is a partner TD IT Solution's "operator," or a separate "responsible party" for the partner's own records (occurrence books, SAPS evidence, etc.); (b) does POPIA s57(1)(b) prior Information Regulator authorisation apply to suspect/criminal-behaviour-adjacent information recovery work may generate; (c) who actually signs, given NextWave appears to be an operator rather than a direct contracting party per decision record TDIT-2026-09 (companion doc §A.2 position: TD IT Solution (Pty) Ltd and the partner sign, not NextWave — counsel to confirm) | Business owner + admitted counsel | Executing any partner agreement at all; pilot launch with real customer data (same §6 gate position as CT-1 above); PDM-6 partner registry's "agreement status: executed" field, which gates operator invitation and the dispatch pool per `compliance-review-security-partner-data-minimisation.md` PDM-6 |

**Status:** all three open as of 2026-10-08. No engineering work is blocked by these three items
specifically — PDM-1…PDM-9 (code-side minimisation) may proceed in parallel per the compliance
ruling §6 — but **no pilot partner may be given access to real customer data until all three
close.**
