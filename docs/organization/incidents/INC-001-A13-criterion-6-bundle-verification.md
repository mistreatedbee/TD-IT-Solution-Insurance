# INC-001 A-13 — Criterion 6 bundle verification checklist

**Owner:** `security-engineer` (execute) · **Chair:** `cybersecurity-architect` (sign-off)  
**Blocks:** Release Gate A criterion 6, sprint items 3.1/3.2  
**Prerequisite:** A-12 landed on `main` (`FEATURE_*` flags `"false"` in `eas.json` preview/production)

Source-level guards are not sufficient per INC-001 §9.5 A-13. This checklist is the evidence package `cybersecurity-architect` needs before signing criterion 6.

---

## 1. Build under test

- [x] EAS **preview** profile APK/IPA built from `main` after A-12 commit(s)
- [x] Record build ID, commit SHA, and `eas.json` env snapshot in this section when complete

| Field | Value |
|---|---|
| **Build ID** | `426e5c01-193c-44ca-99d9-de75577330f0` |
| **Commit SHA** | `d3dc6f4fe08203ecb20083ff30516f7f32ba3b6d` |
| **Profile** | `preview` (Android) |
| **EAS logs** | https://expo.dev/accounts/socials/projects/mobile/builds/426e5c01-193c-44ca-99d9-de75577330f0 |
| **Status** | IN_PROGRESS (triggered 2026-08-28) — APK URL to be filled when FINISHED |
| **Flag snapshot** | All `EXPO_PUBLIC_FEATURE_*` = `"false"` per `mobile/eas.json` preview env |

**`eas.json` preview env (build-time):**

```
EXPO_PUBLIC_FEATURE_CLAIMS=false
EXPO_PUBLIC_FEATURE_LOCATION_TRACKING=false
EXPO_PUBLIC_FEATURE_KYC=false
EXPO_PUBLIC_FEATURE_ALERTS=false
EXPO_PUBLIC_FEATURE_THEFT_REPORTING=false
EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING=false
EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR=false
```

## 2. Flag-off surfaces — must show "coming soon", never mount gated APIs

Install the preview build. Sign in with a test account. For each row, navigate via tab bar, deep link, or home CTA and confirm the gated fallback screen appears and **no coordinate / SA ID / alert list** renders.

| Surface | How to reach | Pass criteria |
|---|---|---|
| Map | Former map tab (hidden) — try `/(app)/map` deep link if tooling allows | `LocationTrackingUnavailableScreen` or route unreachable; no map pins |
| Device locations | Deep link `/(app)/device-locations` | Coming soon; no coordinates |
| Live tracking | Home recovery card (if any test data) or deep link | Coming soon |
| Claims | Deep link `/(app)/claims` | Claims coming soon |
| Alerts | Former alerts tab (hidden) or header bell (hidden) | Tab absent; deep link shows alerts coming soon |
| KYC profile | Account → Profile (row hidden) or deep link `/(app)/account/profile` | Coming soon; no profile form |
| KYC verification | Deep link `/(app)/account/verification` | Coming soon; no ID submission |
| Theft report | Home hero (hidden) or deep link `/(app)/report-theft` | Coming soon |
| Hardware tracker | Asset detail → connect tracker (buttons hidden) or deep link activate-tracker | Coming soon |
| Security operator app | Sign in as `security_company_operator` test account | Operator portal coming soon |

## 3. Honest-scope surfaces — must work

| Surface | Pass criteria |
|---|---|
| Auth (login/signup/MFA) | Session established |
| Policies | List + create |
| Assets | List + register + detail (no location map coords when flag off) |
| Notifications prefs | Screen loads and saves |
| Account hub | Email, logout, plan link — **no** KYC rows visible |

## 4. Network egress (optional but recommended)

With a proxy (Charles/mitmproxy) or backend access logs:

- [ ] No `GET /assets/location-summary` while browsing gated build
- [ ] No `GET /assets/*/location-history` while browsing gated build
- [ ] No `POST /account/profile/verification/submit` while browsing gated build
- [ ] No `GET /alerts` while browsing gated build

## 5. AsyncStorage persistence (A-15)

- [ ] After viewing asset list then force-quit, relaunch — no plaintext lat/lng in persisted query cache key `td_insurance.query_cache` (inspect via dev tooling or staged debug build)

## 6. Sign-off

| Role | Name | Date | Signed |
|---|---|---|---|
| `security-engineer` | | | |
| `cybersecurity-architect` | | | |

**Criterion 6 statement (chair only, when all rows pass):**  
*"No surface that bypassed Stage 8 security review is reachable in the preview build tested above."*

File completed checklist path back to `docs/organization/incidents/INC-001-location-ingestion.md` §9.5 A-13 when done.
