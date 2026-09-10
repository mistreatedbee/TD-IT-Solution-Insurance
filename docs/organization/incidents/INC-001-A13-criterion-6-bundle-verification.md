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
| **Status** | **FINISHED** (2026-08-28, ~15 min build) |
| **Install (QR / device)** | https://expo.dev/accounts/socials/projects/mobile/builds/426e5c01-193c-44ca-99d9-de75577330f0 |
| **APK artifact** | https://expo.dev/artifacts/eas/-qLdVzWss9I3FC5DYfWlNjInmoG9bZYWpdgsDxFg4z0.apk |
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

---

### 2026-09-10 execution note (`manual-qa-engineer`)

This checklist sat complete-but-unsigned for 13 days. Executed against it on 2026-09-10. Findings
below; **not** a Section 6 sign-off (that stays reserved for `security-engineer` /
`cybersecurity-architect` per the header).

**Build-under-test substitution.** Build `426e5c01` (Android APK, commit `d3dc6f4`) was confirmed
still `FINISHED` and not expired via `eas build:view` (expires 2026-09-11), so the artifact itself
is still live. However this session's sandbox has **no Android tooling at all** (`adb`, `emulator`
not present, no AVD) — Android install/verification was not possible here on either the original
build or any Android equivalent. Substituted the current-equivalent **iOS `preview-simulator`**
build instead, per the task's fallback instruction:

| Field | Value |
|---|---|
| **Build ID** | `1f89a386-7630-4e64-9861-b99f489fbf50` |
| **Commit SHA** | `e616962ea6948f48acf05ed82180ef8445dc5244` |
| **Profile** | `preview-simulator` (iOS) |
| **Relationship to `426e5c01`** | `d3dc6f4` (426e5c01's commit) confirmed a git ancestor of `e616962` via `git merge-base --is-ancestor` — this build is a strict superset of the code under test, plus one unrelated launcher-icon commit |
| **Flags** | Same preview env block as above (`eas.json` `preview-simulator` profile — identical `EXPO_PUBLIC_FEATURE_*=false` block) |
| **Install** | Downloaded `.tar.gz` artifact, `xcrun simctl install` onto iPhone 17 Pro / iOS 26.5 simulator — installed and launched cleanly, onboarding screen rendered correctly (screenshot captured) |

**Interactive tap-testing blocker (important, affects §2/§3/§5 below).** This sandboxed session
has no tap-capable device automation tool available (`idb`, Maestro, Appium all absent). `xcrun
simctl` has no touch/tap primitive. Attempted `osascript`/System Events UI scripting against the
Simulator window as a substitute: window queries and AX-tree reads succeeded, and `key
code`/`keystroke` calls executed without error, but **no synthetic click or keystroke produced any
visible state change in the app across 6+ attempts at calibrated coordinates**, including on a
native iOS system alert (the "Open in… ?" scheme-confirmation sheet triggered by `xcrun simctl
openurl`), which never dismissed despite return-key and click attempts. This looks like the
sandbox permits AX/window introspection but blocks actual synthetic input injection into GUI
processes — consistent with the classifier block hit earlier in this session on a direct API
`curl` call. I did not find a workaround and did not try to bypass it. **Net effect: I could not
drive the app's UI (login, tab navigation, deep-link follow-through past the OS confirmation
sheet) in this session.**

Given that, §2/§3/§5 below are backed by **build-artifact and automated-test evidence**, not by
an actual finger-driven walkthrough on device. That is weaker than what this checklist calls for
and is flagged as such per row — do not read the notes below as equivalent to a live device pass.

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

**2026-09-10 status: NOT independently device-verified by live navigation — blocked by the
tap-injection limitation above.** What I could genuinely confirm instead, against the actual
`1f89a386` build artifact (not just source):

- Extracted `main.jsbundle` (Hermes bytecode) from the installed `.app` and ran `strings` against
  it. All the expected gated-copy strings are present and compiled into this exact build:
  `"Claims filing is coming soon."`, `"Alerts are coming soon."`, `"Theft reporting is coming
  soon."`, `"Operator portal is coming soon."`, `"Tracker setup is coming soon."`, `"Device health
  is coming soon."`, `"Device location tracking is not available"`, `"Live location tracking is
  coming soon."`, `"Customer profile editing is coming soon."`, `"Identity verification is coming
  soon."` — i.e. the fallback copy for every row in this table exists in the shipped bundle. This
  does not by itself prove those are the paths actually reached at runtime (that's what device
  navigation would confirm and what I couldn't do), but it is real evidence the gated code paths
  were included, not stripped, and match each row's "coming soon" pass criteria wording.
- All seven `FEATURE_*_ENABLED` flag names appear in the compiled bundle's string table.
- Read every gating `_layout.tsx` under `mobile/app/(app)/` (map, device-locations, claims,
  report-theft, alerts) plus `mobile/src/config/features.ts` at commit `e616962` — each gate
  short-circuits to a "coming soon"/unavailable screen component before rendering its live stack
  when the corresponding flag is `false`, matching this table's pass criteria at the source level.
  Security operator portal gating is in `app/(security-app)/_layout.tsx` (not individually
  re-read line-by-line this session — flag name confirmed present in the bundle string table only).
- Ran the repo's own automated flag-guard tests against this commit's source
  (`_layout.locationFlag.test.tsx` ×2, `_layout.alertsFlag.test.tsx`,
  `AssetDetailScreen.locationFlag.test.tsx`, `ReportTheftSuccessScreen.claimsDisabled.test.tsx`,
  `NotificationPreferencesScreen.claimsDisabled.test.tsx`, `useLocationReporter.flag.test.ts`) —
  **12/12 pass.** These assert the gated screen renders (not the live one) and that no
  location/coordinate data is read when the flag is off, for map, device-locations, assets
  detail, claims-disabled copy, and the location reporter hook.
- Could **not** confirm: KYC profile/verification screens, hardware-tracker screens
  (activate-tracker/installation-guide/device-health), and the security-operator portal — I did
  not read those gate files individually this session (time-boxed), so those rows rest on the
  bundle-string check only, which is the weakest tier of evidence here.

**None of the above is a substitute for the device walkthrough this section asks for.** Still
needed: an operator with real tap access (physical device via TestFlight/internal-distribution
link, or a working `idb`/Maestro-equipped environment) actually signing in as
`test.customer@tditsolutions.dev` (seeded in `backend/scripts/seed-test-accounts.ts`) and
navigating each row live.

## 3. Honest-scope surfaces — must work

| Surface | Pass criteria |
|---|---|
| Auth (login/signup/MFA) | Session established |
| Policies | List + create |
| Assets | List + register + detail (no location map coords when flag off) |
| Notifications prefs | Screen loads and saves |
| Account hub | Email, logout, plan link — **no** KYC rows visible |

**2026-09-10 status: NOT verified** — same tap-injection blocker as §2. Could not sign in or drive
auth/policies/assets/notification-prefs/account-hub screens live in this session. No source-level
substitute attempted for this section (unlike §2, "must work" surfaces need an actual successful
network round-trip against the live Render backend to mean anything, which source reading can't
show).

## 4. Network egress (optional but recommended)

With a proxy (Charles/mitmproxy) or backend access logs:

- [ ] No `GET /assets/location-summary` while browsing gated build
- [ ] No `GET /assets/*/location-history` while browsing gated build
- [ ] No `POST /account/profile/verification/submit` while browsing gated build
- [ ] No `GET /alerts` while browsing gated build

**2026-09-10 status: NOT verified, explicitly.** No proxy (Charles/mitmproxy) and no backend
access-log access are available in this session/environment. I did not attempt to fake this by
reasoning from source code alone, since this section's entire point is to catch a source-level
guard that doesn't actually stop the network call (the checklist's own framing: "source-level
guards are not sufficient"). Leaving all four boxes unchecked. Whoever has backend Render log
access or a proxy-equipped device should run this against the same build.

## 5. AsyncStorage persistence (A-15)

- [ ] After viewing asset list then force-quit, relaunch — no plaintext lat/lng in persisted query cache key `td_insurance.query_cache` (inspect via dev tooling or staged debug build)

**2026-09-10 status: NOT verified on-device** — same tap-injection blocker; couldn't drive the
app to actually populate the cache and force-quit/relaunch to inspect it. Supplementary
source/unit-test evidence only (commit `e616962`, same as build under test):

- `mobile/src/query/queryClient.ts` wires `PersistQueryClientProvider`
  (`mobile/app/_layout.tsx`) with `dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery }`
  against the `td_insurance.query_cache` AsyncStorage key named in this row.
- `mobile/src/query/persistPolicy.ts`'s `shouldPersistQuery` explicitly excludes
  `['assets','location-summary']`, `['assets', assetId, 'location']`,
  `['assets', assetId, 'location-history']`, and any `['recovery', ..., 'location', ...]` query
  key from persistence.
- `npx jest src/query/__tests__/shouldPersistQuery.test.ts` — **4/4 pass** (excludes
  location-summary, per-asset location, recovery-case location; still persists non-sensitive
  queries).

This shows the exclusion logic exists, is wired to the actual persister, and is unit-tested — but
it is not the same claim as "inspected the real persisted AsyncStorage blob on a real device and
found no lat/lng in it." Leaving the checkbox unchecked; flagging as a good candidate for
`automation-qa-engineer` to turn into a device-level or Detox-style integration check if that
distinction matters for sign-off, since a unit test only proves the exclusion function's own
logic, not that nothing else in the query layer bypasses it.

**2026-09-10 overall status (`manual-qa-engineer`, not a sign-off):** §1 build-identity confirmed
(with a documented iOS `preview-simulator` substitution for the Android artifact — see note
above). §2 has strong build-artifact + automated-test corroboration but no live device
walkthrough. §3, §4, §5 are genuinely **not verified** this session — blocked by an environment
limitation (no working tap/input-injection tooling, no proxy/log access), not by any finding of a
problem. **This is not ready for `cybersecurity-architect` sign-off as-is.** Still needed before
criterion 6 can close: someone with either (a) a physical device + the internal-distribution link
for `1f89a386` (or a fresh preview build) and normal touch input, or (b) a properly configured
`idb`/Maestro simulator-automation setup, to walk §2/§3/§5 live, plus someone with Render
backend-log or proxy access for §4.

## 6. Sign-off

| Role | Name | Date | Signed |
|---|---|---|---|
| `security-engineer` | | | |
| `cybersecurity-architect` | | | |

**Criterion 6 statement (chair only, when all rows pass):**  
*"No surface that bypassed Stage 8 security review is reachable in the preview build tested above."*

File completed checklist path back to `docs/organization/incidents/INC-001-location-ingestion.md` §9.5 A-13 when done.
