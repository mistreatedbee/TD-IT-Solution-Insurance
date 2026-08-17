# 05 — Customer Home Dashboard (Protection Command Centre)

**Agent 4 — Customer Dashboard Specialist**

---

## 1. Purpose

Replace `mobile/app/(app)/index.tsx` placeholder with an **intelligent protection command centre** that answers:

1. Am I protected?
2. Are my assets okay?
3. Are my tracking devices working?
4. Where are my assets?
5. Are there any alerts?
6. Is my account/profile complete?
7. Is there anything I need to do?

All metrics from **live API** — no hard-coded counts.

---

## 2. Data sources (Phase 1 — available now)

| UI block | API / hook | Notes |
|----------|------------|-------|
| Greeting + name | `GET /account/me` | Use display name when profile fields exist; fallback first name from email |
| Assets protected | `GET /assets?status=active` | Count + limit from policy |
| Tracking online | `GET /assets/location-summary` | Derive: fresh `lastLocation` = online; see rules below |
| Active alerts | Computed client-side Phase 1 | See §4; Phase 2: alerts API |
| Profile % | Computed from available account fields | Phase 1: email verified + MFA + name fields when added |
| Asset preview rows | `location-summary` + `assets` | Top 3 by recency or priority |
| Map preview | `location-summary` | MapPlaceholder → ProtectionMap |
| Recovery cases open | `GET /recovery/cases` | Count active |
| Policy status | `GET /policies` | Active policy indicator |

### Tracking "online" derivation (Phase 1)

```
IF asset.locationSource === 'self_device' AND lastLocation.recordedAt < 15 min → ONLINE (last known)
IF asset.locationSource === 'hardware' AND lastLocation.recordedAt < 2 min → ONLINE
IF lastLocation exists but stale → LAST KNOWN
IF smartphone AND no consent → TRACKING DISABLED
IF non-smartphone AND no gpsDeviceId → TRACKING UNAVAILABLE
```

---

## 3. Wireframe — scroll layout

```
┌─────────────────────────────────────────┐
│ Good morning, Ashley 👋                  │
│ Your protection is looking good.         │  ← dynamic copy (§6)
├─────────────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        │
│ │  5  │ │ 3/3 │ │  0  │ │ 80% │        │  StatBlock row
│ │Asset│ │Track│ │Alert│ │Prof │        │
│ └─────┘ └─────┘ └─────┘ └─────┘        │
├─────────────────────────────────────────┤
│ PROTECTION STATUS                        │
│ ● All systems operational                │  ProtectionHealthCard
│ Assets: 5/5 protected                    │
│ Tracking: 3 online · 2 unavailable       │
│ Alerts: 0 critical                       │
│ Profile: 80% complete                    │
├─────────────────────────────────────────┤
│ ⚠ Complete your profile          [→]    │  if < 100%
├─────────────────────────────────────────┤
│ MY ASSETS                          [All]│
│ ┌───────────────────────────────────┐  │
│ │ 🚗 Toyota Corolla    ● Last known  │  │
│ │    Johannesburg · 2 min ago       │  │
│ └───────────────────────────────────┘  │
│ ┌───────────────────────────────────┐  │
│ │ 💻 MacBook Pro    — Unavailable   │  │
│ │    Hardware tracker required      │  │
│ └───────────────────────────────────┘  │
│ ┌───────────────────────────────────┐  │
│ │ 📱 iPhone           ● Online        │  │
│ │    Pretoria · 20 sec ago          │  │
│ └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ LIVE PROTECTION MAP            [Expand] │
│ ┌───────────────────────────────────┐  │
│ │         [ map preview ]           │  │
│ │   Last known locations · 3 pins   │  │
│ └───────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ QUICK ACTIONS                            │
│ [+ Add Asset] [Report Lost/Stolen]       │
│ [View Alerts] [View Policy]              │
├─────────────────────────────────────────┤
│ OPEN RECOVERY CASES (if any)             │
└─────────────────────────────────────────┘
```

---

## 4. Alert centre (Phase 1 bootstrap)

Until dedicated alerts API exists, derive **actionable items**:

| Source | Alert |
|--------|-------|
| `pending_verification` | Verify email |
| Profile incomplete | Complete profile |
| Asset without tracking | Connect tracking |
| Stale self-device location (> 24h) | Update location |
| Open recovery case | Case update available |
| Notification prefs | From push history (Phase 2) |

Dedicated **Alerts tab** lists these with severity: Critical · High · Warning · Info.

**Phase 2:** `GET /alerts` collection fed by notification events + device telemetry.

---

## 5. Personalization copy

| Condition | Headline subtext |
|-----------|------------------|
| No assets | "Let's protect your first asset." |
| Profile < 100% | "A few details will strengthen your protection." |
| No tracking | "Connect tracking to see your assets on the map." |
| Device offline | "One of your devices needs attention." |
| Open critical case | "Immediate attention required." |
| All healthy | "Your protection is looking good." |

---

## 6. Web dashboard parity

`CustomerDashboardPage.tsx` mirrors same sections using web components (StatBlock, Card, GlassCard). Map section Phase 2.

---

## 7. Implementation notes

- Extract `useProtectionDashboard()` hook aggregating queries (React Query)
- Single loading skeleton for home
- Pull-to-refresh invalidates assets, location-summary, policies, recovery, account
- **MUST HAVE** Phase 1
- Does not require new backend for v1 (computed alerts)

---

## 8. QA acceptance (home)

- [ ] Counts match API after refresh
- [ ] No asset shows "Online" without fresh timestamp
- [ ] Laptop shows "Tracking unavailable" not fake coordinates
- [ ] Pending verification shows banner + blocks writes (existing gate)
- [ ] Empty states for zero assets / zero trackable
- [ ] Quick actions navigate correctly
