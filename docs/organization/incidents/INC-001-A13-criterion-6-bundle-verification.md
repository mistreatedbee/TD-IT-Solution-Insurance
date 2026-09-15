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

**2026-09-14 (evening) status — 9 of 10 rows now live-device-verified** (Map, Device locations,
Live tracking, Claims, Alerts, KYC profile, KYC verification, Theft report, Hardware tracker) via
`mobile/e2e/flows/flags-off-screens.yaml`, each independently screenshot-confirmed against its
gate file's literal copy — **configuration: Expo Go / local Metro dev server with
`EXPO_PUBLIC_FEATURE_*=false`, not the EAS `preview` build artifact.** See the execution note at
the bottom of this document for the full per-row detail, the selector-reliability finding, and why
Security operator app is still unchecked (MFA-enrolled test account, no credential access to log
in as it this session — an access gap, not a tooling one).

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

**2026-09-14 (evening) status — 5 of 5 rows now live-device-verified** (Auth, Policies,
Assets, Notifications prefs, Account hub) via `mobile/e2e/flows/policies-and-assets.yaml` and
`auth-login.yaml` — **configuration: Expo Go / local Metro dev server against the live Render
backend, not the EAS `preview` build artifact.** Policies' "create" leg is proven as far as the
create screen mounting and loading the real live plan catalog; the terminal `POST /v1/policies`
mutation was deliberately not exercised against the shared, non-disposable
`test.customer@tditsolutions.dev` fixture account (no teardown path exists for policies). See the
execution note at the bottom of this document for full detail, including the honest note that a
single uninterrupted green run of the whole chained flow was not achieved (each segment was proven
individually, across separate runs, with reviewed screenshots).

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

- [x] After viewing asset list then force-quit, relaunch — no plaintext lat/lng in persisted query cache key `td_insurance.query_cache` (inspect via dev tooling or staged debug build) — **verified 2026-09-14 (evening), `automation-qa-engineer`**, via a real device-level populate → force-quit → relaunch → inspect cycle against Expo Go / local Metro (not the EAS build artifact — see execution note below for the full procedure and caveat).

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

---

### 2026-09-14 execution note (`mobile-engineer`)

Platform owner approved proceeding ("Okey lets do it"). Prior build `426e5c01` expired
2026-09-11 per its own EAS record, so a fresh build was required regardless of the 2026-09-10
substitution note above. Two things were done this session; neither is a §2/§3/§4/§5
verification pass — that still requires a human with real tap input, which this session again
does not have (same tap-injection blocker as 2026-09-10, not re-tested since the finding hasn't
changed).

**1. Fresh EAS preview (Android) build triggered from current `main`.**

| Field | Value |
|---|---|
| **Build ID** | `7f3694b9-8066-4b28-b956-e4957d36ea2e` |
| **Commit SHA** | `2630cd93cbc1bf2ebec90344ef22e0216370352a` |
| **Profile** | `preview` (Android, `buildType: apk`) |
| **EAS logs** | https://expo.dev/accounts/socials/projects/mobile/builds/7f3694b9-8066-4b28-b956-e4957d36ea2e |
| **Status** | **FINISHED** (started 9/14/2026, 10:47:34 AM SAST, finished 11:08:18 AM SAST, ~21 min; started by `socials`) |
| **Install (QR / device)** | https://expo.dev/accounts/socials/projects/mobile/builds/7f3694b9-8066-4b28-b956-e4957d36ea2e |
| **APK artifact** | https://expo.dev/artifacts/eas/zlOYuV5AEbLyj6eyfbBPQuZJM5hgAgwdGB1gzklAOcw.apk |
| **Fingerprint** | `6f564ea16d103f39d9cc0bc46b60575ebd2951d5` |
| **Flag snapshot** | Confirmed against `mobile/eas.json` before triggering: all `EXPO_PUBLIC_FEATURE_*` = `"false"` in the `preview` profile env block, identical to `426e5c01`'s recorded snapshot in §1 |
| **Env access** | `eas whoami` → `ashleymashigo013@gmail.com` (account `socials`); `eas build:list`/`build --non-interactive` both worked from `mobile/` — EAS CLI access confirmed present in this session |

**2. Live tunnel dev server started as a faster path to a human tester.** The owner said "let's
do it" and has a real phone, so rather than wait ~15 min for the EAS build alone, also started a
local Expo dev server in tunnel mode (`@expo/ngrok`, already a project dependency — see
`mobile/package.json`) pointed at current `main` (same commit `2630cd9`, working tree clean
under `mobile/`):

```
cd mobile && CI=1 npx expo start --tunnel
```

Found and killed one stale leftover dev server from an earlier session first (non-tunnel, bound
to port 8081, PID from a 3+ day old process) plus a second stale tunnel instance on port 8090, so
only one clean tunnel is live now.

| Field | Value |
|---|---|
| **Connection URL (Expo Go)** | `exp://yxp6o0u-socials-8081.exp.direct` |
| **Web/manifest URL** | https://yxp6o0u-socials-8081.exp.direct (verified `200` via `curl`, both at start and re-checked ~20 min later while the EAS build ran) |
| **Mode** | `expo start --tunnel` against local commit `2630cd9` (`main` HEAD) — **not** the `preview` build's flag snapshot. This is a plain dev-client/Expo-Go session running the **development** profile's env implicitly (`mobile/.env`: `EXPO_PUBLIC_API_BASE_URL` only — no `EXPO_PUBLIC_FEATURE_*` overrides are set for local `expo start`, so screens read `mobile/src/config/features.ts` defaults, not the preview `"false"` block). **This matters for scope:** a live-tester session over this tunnel is useful for exercising §3 (auth/policies/assets/notifications) but is not evidence for §2's flag-off claims, since it is not running the same build/flag configuration recorded in §1. Only the EAS `preview` artifact (`7f3694b9`, or the still-live `426e5c01`/`1f89a386`) should be used for §2 rows. |
| **Caveat: `expo-notifications` in Expo Go** | Dev-server logs show repeated warnings that remote push via `expo-notifications` is unsupported in Expo Go (SDK 53+) — expected, not a new finding, doesn't block §3 walkthrough of auth/policies/assets/notification-*preferences* (local, non-push UI). |

**What the owner needs to do next to become the actual human tester this checklist needs:**

- **For a genuine §2 flag-off pass:** install build `7f3694b9` (APK link above — **finished**,
  fresh, not expired) on a real Android device, sign in as `test.customer@tditsolutions.dev` (seeded via
  `backend/scripts/seed-test-accounts.ts`), and walk each row in §2's table, §3's table, then
  §5's AsyncStorage-inspection step — this is the only surface that carries the preview flag
  snapshot the checklist actually calls for.
- **Fastest immediate option (right now):** open Expo Go on their phone and enter/scan
  `exp://yxp6o0u-socials-8081.exp.direct` — this gets a live, tappable app in front of them in
  seconds, useful for a first-look/UX pass and for §3's "must work" auth/policy/asset flows
  against the real Render backend, but again **not** a substitute for §2 since it runs dev-flag
  defaults rather than the preview build's all-`false` block.
- Either way, this is still `manual-qa-engineer`/a human with fingers, not a further automated
  session — this session still has no `idb`/Maestro/tap-injection tooling, so it cannot self-certify
  §2/§3/§4/§5 no matter which build or dev server is reachable.

File completed checklist path back to `docs/organization/incidents/INC-001-location-ingestion.md` §9.5 A-13 when done.

---

### 2026-09-14 — the "no tap-injection tooling" blocker is resolved (T-26)

Every prior session on this checklist (2026-09-10, 2026-09-14 morning) hit the same wall: no
`idb`/Maestro/tap-injection capability, so §2/§3/§4/§5 could only ever be traced statically or
evidenced by bundle-string inspection, never actually driven live. That blocker is now closed —
`automation-qa-engineer` stood up a real Maestro harness (`mobile/e2e/`, see its README for
setup) that genuinely drives the app via XCUITest tap injection against a running Expo Go
instance, not a simulated/inferred pass.

**§2's Claims row is now the first row in this entire checklist actually walked live, not
inferred:** logged in as `test.customer@tditsolutions.dev` against the real Render backend, deep
linked to `/claims` with `EXPO_PUBLIC_FEATURE_CLAIMS=false`, and confirmed the real
`ClaimsComingSoonScreen` component renders ("Claims filing is coming soon.") rather than the live
claims flow — independently re-verified by the orchestrator by grepping that exact string in
`mobile/src/screens/claims/ClaimsComingSoonScreen.tsx` before trusting the agent's report. Tab-bar
composition (no Map/Alerts tabs with those flags off) and §3's auth/assets/account "must work"
flows were also driven live successfully.

**Not yet complete:** §2's other nine rows (map, device-locations, alerts, KYC, hardware-tracker,
security-operator) still need the same `openLink` + `assertVisible` pattern extended to them —
documented as the next step in `mobile/e2e/README.md`, not yet done. §4 (network egress via proxy)
and Android coverage remain out of scope (no proxy/log access, no Android SDK in any session to
date). A real, reproducible password-field flakiness on extended navigation was found and is
documented (not hidden) in the README's "Known quirks" section, with the likely cause identified
but not yet conclusively isolated.

**This checklist item (criterion 6) is still not closable from this alone** — §2 is now
partially, not fully, walked live, and §4/§5 remain untouched. But the structural blocker that
made every future attempt here start from zero is gone; the next session can extend the existing
flows rather than re-discover that no tooling exists.

---

### 2026-09-14 (evening) — `automation-qa-engineer`: §2 extended to 9/10 rows, §3 to 5/5, §5 executed, §4 attempted and honestly blocked

Dispatched by `cto` (`docs/organization/cto-status/2026-09-14-task-assignment.md` Appendix 1,
T-26 follow-up) to extend the harness landed earlier today (commit `847988b`) from the 1/10 §2
row and 3/5 §3 rows it proved, toward the full checklist. This section reports exactly what
changed and under what configuration — **all rows in this session ran against a local Metro dev
server (`expo start --port 8098` / `8099`) loaded into Expo Go 57.0.9 on the iPhone 17 Pro
Simulator (iOS 26.5), with `EXPO_PUBLIC_FEATURE_*` env vars set per-session to mirror the
`preview`/`production` profile's all-`"false"` block (§2 runs) or left at their local-dev default
(§3/§5 runs) — never against the actual EAS artifact (`7f3694b9`, Android, or any iOS-equivalent
build). No .ipa/.apk was installed this session; Expo Go remains the substitute it was earlier
today.** Every row below is tagged with this same caveat individually, per the CTO's explicit
correction that the first pass on this checklist under-disclosed exactly this gap.

**§2 — flag-off "coming soon" rows: 9 of 10 now driven live (was 1/10).**

`mobile/e2e/flows/flags-off-screens.yaml` was extended with one `openLink` + wait + screenshot
block per row, following the same pattern as the existing Claims row. Before writing each
assertion the actual gated component source was read for its literal copy (not assumed) —
confirmed the map/device-locations/live-tracking trio all share one component
(`LocationTrackingUnavailableScreen`, headline "Live location tracking is coming soon.") while
claims/alerts/KYC-profile/KYC-verification/theft-report/hardware-tracker each render
`FeatureUnavailableScreen` with per-route copy. Every row's screenshot was independently reviewed
by the orchestrating session (not just the automation agent's own pass/fail report) and the exact
on-screen headline text was read back and matched against the gate file string before being
counted as proven:

| Row | Gate file | Headline (verified in source + on-screen) | Result |
|---|---|---|---|
| Claims | `app/(app)/claims/_layout.tsx` | "Claims filing is coming soon." | **Live, Expo Go config** |
| Map | `app/(app)/(tabs)/map/_layout.tsx` | "Live location tracking is coming soon." | **Live, Expo Go config** |
| Device locations | `app/(app)/device-locations/_layout.tsx` | "Live location tracking is coming soon." | **Live, Expo Go config** |
| Live tracking | `app/(app)/live-tracking/_layout.tsx` | "Live location tracking is coming soon." | **Live, Expo Go config** |
| Alerts | `app/(app)/(tabs)/alerts/_layout.tsx` | "Alerts are coming soon." | **Live, Expo Go config** |
| KYC profile | `app/(app)/(tabs)/account/profile.tsx` | "Profile editing is coming soon." | **Live, Expo Go config** |
| KYC verification | `app/(app)/(tabs)/account/verification.tsx` | "Identity verification is coming soon." | **Live, Expo Go config** |
| Theft report | `app/(app)/report-theft/_layout.tsx` | "Theft reporting is coming soon." | **Live, Expo Go config** |
| Hardware tracker | `app/(app)/(tabs)/assets/[id]/activate-tracker.tsx` | "Tracker setup is coming soon." | **Live, Expo Go config** |
| Security operator app | `app/(security-app)/_layout.tsx` | "Operator portal is coming soon." | **Not driven — see below** |

Tab-bar composition (no Map/Alerts tabs with those flags off) was reconfirmed live as part of the
same run.

**Selector-reliability finding, disclosed rather than hidden:** `assertVisible`/`extendedWaitUntil`
against the actual headline `<Text>` elements on these `openLink`-reached screens was
**consistently unreliable** in this session — the exact same string that a screenshot taken at the
moment of "FAILED" clearly shows on-screen would still fail the query, reproducibly, across a
fresh terminate+relaunch and a fresh Metro reload, ruling out ordinary navigation-timing race as
the sole cause. Root cause not conclusively isolated (see `mobile/e2e/README.md` "Known quirks").
**Mitigation used:** each row now waits for the fallback screen's "Back to home" **button**
(a `Pressable`/native-accessible element, which did *not* show this flakiness) as the drive/reach
proof, and a `takeScreenshot` is captured and independently read back by the orchestrator as the
copy-match proof — a different, not weaker, evidence combination than a green `assertVisible`
would have been, but flagged here so it isn't mistaken for the original plan.

**Security operator app row — not driven, genuine access block, not a tooling gap.** The seeded
`test.security@tditsolutions.dev` account (`backend/scripts/seed-test-accounts.ts`) has
`mfaRequired: true` and is already TOTP-enrolled from a prior seeding run; this session has no
`backend/.env.local` / Supabase admin credentials to either read the existing TOTP secret or run
`--force` to re-enroll and capture a fresh one, so a real login as that account (which the
`(security-app)` route group requires — `app/_layout.tsx`'s `Stack.Protected` guards gate that
whole route group on `status === 'signed-in' && appShellGate === 'security-app'`, so the fallback
screen inside it is unreachable without actually completing that login) could not be performed.
Confirmed via source read only: `FEATURE_SECURITY_OPERATOR_ENABLED` gate and
`"Operator portal is coming soon."` copy exist in `app/(security-app)/_layout.tsx`. This is the
same class of access gap named in the CTO's status doc (T-25) — one more credential nobody in this
session's environment holds — not evidence the row doesn't work.

**§3 — "must work" rows: 5 of 5 now driven live (was 3/5).**

`mobile/e2e/flows/policies-and-assets.yaml` extended. Auth/Assets/Account-hub were already proven
in the earlier pass today; this session added:

- **Policies — list:** confirmed live via `openLink` to `/policy` (the same target the Account
  tab's "Protection plan" row navigates to — that row's own tap-navigation was proven live in the
  earlier pass today; this session used `openLink` to the identical route instead of re-driving the
  tap, because the Account screen's `ScrollView` position proved non-deterministic across repeated
  Maestro runs in this session, which made scroll-then-tap flaky in a way `openLink` to the same
  non-gated route wasn't). Screen shows the real seeded "Essential" policy (R199/month, 1/5 assets,
  "pending activation" badge) from a live `GET /v1/policies` round trip — screenshot captured and
  reviewed (`mobile/e2e/README.md` verification record references the artifact path).
- **Policies — create:** `CreatePolicyScreen` reached live via "Choose another plan", rendering the
  real plan catalog (Essential R199/mo, Plus R399/mo "MOST POPULAR", both with real feature lists)
  from a live `GET /v1/plans` round trip — confirmed via screenshot, not empty/error state.
  **Deliberately stopped short of tapping a plan tile / completing `POST /v1/policies`:**
  `test.customer@tditsolutions.dev` is a shared, non-disposable fixture account reused by every
  E2E/manual-QA session against this checklist, and the seed script has no `--teardown` support for
  policies (unlike assets/accounts). "List + create" is read here as *the create screen mounts and
  loads real live data* — the terminal mutation was not exercised, to avoid permanently changing
  shared fixture state with no rollback path. Documented as a deliberate scope line, not a gap that
  was missed.
- **Notification preferences — loads and saves:** reached live via `openLink` to
  `/notification-preferences`; screenshot confirms real per-category/channel toggle state from a
  live `GET /v1/notifications/preferences` (Theft-alerts Push correctly shown locked/disabled with
  "Required — cannot be turned off", matching the backend's documented business rule). A `testID`
  (`toggle-<slug>`) was added to `mobile/src/theme/primitives/Toggle.tsx` (same pattern as the
  existing `Input.tsx` fix) to make the Switch tap-selectable; a full flow tapped the General/Email
  toggle and confirmed no error `Alert` appeared afterward — a live `PATCH` round trip, assessed
  indirectly since RN's native `Switch` accessibility value isn't reliably queryable via Maestro's
  text selectors here. `npx jest` confirms `Toggle.test.tsx` and the full 158-test mobile suite
  still pass after this change.
- A **single, fully green, uninterrupted run of the entire extended `policies-and-assets.yaml`
  flow end-to-end was not achieved** in this session, despite ~10 attempts — the same
  text-assertion flakiness noted in §2 above hit different individual steps on different runs
  (never the same step twice), plus one XCUITest driver hang that required a simulator
  reboot to clear. Every individual segment (Home, Assets tab, Account tab, policy list, policy
  create catalog, notification preferences load+toggle) **was independently captured passing with
  a reviewed screenshot across these runs** — the claim above is "each screen proven live," not
  "one clean pass proves the whole chain," and that distinction is intentional, not glossed over.

**§5 — AsyncStorage persistence: executed, with a real (not simulated) populate → force-quit →
relaunch → inspect cycle, under `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` at its default (`true`)
so the location-summary query genuinely had something to persist if the exclusion didn't work.**

Found the storage location via `xcrun simctl get_app_container … data`: Expo Go namespaces
`AsyncStorage` per-experience under
`Documents/ExponentExperienceData/@socials/mobile/RCTAsyncLocalStorage/`. `manifest.json` lists
`td_insurance.query_cache` (the exact key from `mobile/src/query/queryClient.ts:50`) mapped to a
separate file named by the **MD5 hash of the key string** (confirmed: `md5("td_insurance.query_cache")
== 5eafb4df7857a2359c8459af010cd775`, matching the actual filename present).

Procedure: started a fresh Metro session with default (location-tracking-on) flags, confirmed via
screenshot the Home "Live protection map" widget rendered a real (non-loading, non-error) "No
pinned locations yet" state — i.e. `GET /v1/assets/location-summary` genuinely executed and
returned — then opened `/device-locations` and `/map` (both read that same endpoint per their
gate-file comments), `xcrun simctl terminate` (force-quit) + relaunch, then read the persisted
blob directly:

- Persisted query count after relaunch: 11 keys, including `['assets', {...}]`, `['policies',
  {...}]`, `['plans']`, `['account','me']`, `['recovery','cases',{...}]`, `['alerts', 50]`.
- **`['assets','location-summary']` — the exact key `shouldPersistQuery` excludes — is absent from
  the persisted set**, despite the query having genuinely run (per the UI evidence above).
- A full-text scan of the persisted blob for `"lat"`, `"lng"`, `"latitude"`, `"longitude"`, and any
  coordinate-shaped number pattern (`-?\d{1,3}\.\d{4,}`) returned **zero matches**.

This is real, on-device confirmation of the exclusion working end-to-end (query executes live →
persister runs → force-quit → relaunch → inspect), not the unit-test-only evidence the checklist
previously rested on. **Still using Expo Go / local Metro, not the EAS build artifact — same
configuration caveat as §2/§3 above.**

**§4 — network egress: a genuine, further attempt than any prior session, still honestly
blocked, for a newly-specific reason.** Checked what's installable in this sandbox (per the
dispatch's instruction): no `brew` at all (`command not found`); `pip3 install mitmproxy`
**succeeded** (mitmproxy 12.2.3, a real, working install — further than any prior session got).
Generated its CA cert successfully (`~/.mitmproxy/mitmproxy-ca-cert.cer` etc.) and confirmed
`xcrun simctl keychain <udid> add-root-cert` exists as the mechanism to trust it on the simulator
without any manual Settings-app tap sequence. **Blocked at the one remaining step: routing
Simulator traffic through the proxy requires setting the host Mac's HTTP/HTTPS proxy
(`networksetup -setwebproxy` / `-setsecurewebproxy`), which this sandbox's shell user cannot do —
`networksetup` returned "Command requires admin privileges" and `sudo -n true` confirmed no
passwordless sudo is available.** This is a more specific, different blocker than "no proxy tool
installable" (the tool installed fine) — it is a host-OS admin-privilege wall, consistent with the
CTO's framing that this section may stay access-blocked regardless of which role attempts it
(T-25's "one access problem wearing five hats"). Not pursued further per the dispatch's own
instruction not to over-invest here once genuinely blocked. All four §4 checkboxes remain
unchecked.

**Net effect on this document's open items:** §2 now 9/10 live-proven (was 1/10), §3 now 5/5
live-proven with one noted scope line on the policy-create mutation (was 3/5), §5 now executed
with a real device-level result (was unit-test-only), §4 remains unchecked with a sharper-specified
blocker than before. **Still not a criterion-6 sign-off** — the security-operator row, the EAS
build-artifact configuration, and §4 remain open, and are named as such rather than rounded up.
`mobile/e2e/README.md`'s "Verification record" section carries the full per-row detail and screenshot
references.
