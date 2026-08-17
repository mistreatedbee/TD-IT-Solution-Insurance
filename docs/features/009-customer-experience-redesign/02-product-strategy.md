# 02 — Product Strategy & Information Hierarchy

**Agent 1 — Product Strategist** (`product-manager`, `business-analyst`)

---

## 1. Product hierarchy

### Level 0 — Platform promise
> *Your assets are protected. You can see what's happening. If something goes wrong, you know what to do.*

### Level 1 — Surfaces (never mix)

| Surface | User | Primary job |
|---------|------|-------------|
| Customer mobile | Policyholder | Protection command centre + emergency actions |
| Customer web | Policyholder | Onboarding, account admin, optional map (Phase 2) |
| Security ops | Partner operator | Incident queue + live map + case workflow |
| Admin | Internal staff | Business management — not recovery operations |

### Level 2 — Customer information priority

**Immediate (home / first screen)**

1. Protection health (am I covered?)
2. Active alerts requiring action
3. Trackable assets status (online / last known / unavailable)
4. Profile / setup blockers
5. Quick emergency action (report lost/stolen)

**Secondary (one tap away)**

6. Full asset vault
7. Live protection map (expandable)
8. Policy summary
9. Notification centre
10. Recovery case progress

**Deep (settings / detail)**

11. Profile & verification
12. Documents
13. Device pairing / activation
14. Trip history (when supported)
15. Claims (when backend exists)
16. Subscription / payment (when gateway exists)

### Level 3 — Security operator priority

**Immediate**

1. Critical / unassigned incidents
2. Live operations map (cases + last-known asset positions)
3. Devices offline during active recovery
4. Cases requiring action / overdue

**Secondary**

5. Full incident queue with filters
6. Case detail + timeline
7. Team assignment

**Restricted by role**

8. Customer PII (masked by default)
9. Full location history (AUD-9 trail required)
10. Admin configuration

---

## 2. What each persona needs

### Customer
- Confidence that protection is active
- Honest tracking state per asset type
- Fast stolen report with case reference
- Clear next steps when something is incomplete
- No technical jargon or fake "live" labels

### Administrator
- Customer lifecycle, plans, suspensions
- Asset/policy oversight for support
- **Not** live recovery map (that's security)

### Security personnel
- Queue sorted by severity and staleness
- Map-centric situational awareness
- Case timeline and assignment
- Location only with purpose + audit (ADR-0006)
- No unnecessary customer data exposure

---

## 3. Critical vs hidden

| Information | Customer home | Hidden behind |
|-------------|---------------|---------------|
| Asset count / protection status | ✅ Visible | — |
| Last known location | ✅ Map section | Asset detail for full history |
| Device battery / signal | ⚠️ If capability | Device health screen |
| Policy legal text | ❌ | Policy detail |
| Internal case notes | ❌ | Never customer-visible |
| Full ID number | ❌ | Masked; verification centre |
| Trip playback | ❌ | Future; requires history API |
| Payment method | ❌ | Settings when built |

---

## 4. Post-login customer destination

```
Signed in
  ├─ onboarding incomplete? → Finish setup wizard (existing gate)
  ├─ pending_verification?  → Home with verification banner (existing)
  └─ active                  → PROTECTION COMMAND CENTRE (new home)
```

Security operator post-login → **Operations home** (map + KPI strip + critical queue), not customer tabs.

---

## 5. South African market research (inspiration only)

Patterns observed in Matrix, Netstar, Tracker-class products (not copied):

| Pattern | TD IT adoption |
|---------|----------------|
| Last-known vs live distinction | **MUST** — already in Feature 008 BR |
| Device health (battery, GPS, signal) | **SHOULD** — capability-gated |
| Stolen vehicle recovery workflow | **MUST** — extend existing recovery cases |
| Geofence home/work alerts | **FUTURE** — REQUIRES HARDWARE + backend |
| Trip history / playback | **FUTURE** — REQUIRES BACKEND |
| Centralized fleet map | **MUST** — Phase 1 with honest staleness |
| Operator SOC dashboard | **MUST** — security web redesign |

**POPIA:** Location is sensitive personal data; consent + retention per `compliance-specialist`. ID masking in customer UI.

---

## 6. Feature classification legend

| Tag | Meaning |
|-----|---------|
| **MUST HAVE** | Core redesign deliverable |
| **SHOULD HAVE** | High value, same program |
| **NICE TO HAVE** | Polish after core |
| **FUTURE** | Designed, not scheduled |
| **REQUIRES HARDWARE** | GPS vendor + device telemetry |
| **REQUIRES BACKEND** | New API/collections |
| **REQUIRES CLIENT DECISION** | Legal/commercial sign-off |
| **SUPPORTED NOW** | Can wire to existing API today |
