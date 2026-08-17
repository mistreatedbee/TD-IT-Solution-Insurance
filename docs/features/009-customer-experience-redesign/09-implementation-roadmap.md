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
