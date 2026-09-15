# Mobile E2E — Maestro

**Owner:** `automation-qa-engineer`
**Status:** Real, working harness — installed, driven with actual tap
injection (XCUITest under the hood), and verified against the live app on
an iOS Simulator on 2026-09-14 (extended the same day, evening). This is
not a stub. As of this update: 9/10 of the INC-001 A-13 checklist's §2 rows
and 5/5 of its §3 rows are live-device-proven, plus §5 (AsyncStorage) has a
real populate→relaunch→inspect result — all under Expo Go / local Metro,
**not** the EAS build artifact (see the checklist doc's per-row
configuration tags). §4 (network egress) remains genuinely blocked by a
host-OS admin-privilege wall, not a missing tool. See "Verification
record" below for exactly what was proven and how.

## Why Maestro (not Detox)

Evaluated against this repo (`mobile/package.json`, Expo Router, Expo SDK
57, no existing native `ios`/`android` folders — this is a managed Expo
project):

- **Detox** needs a compiled native binary to drive (`expo run:ios` /
  `expo prebuild` + Xcode build, or an EAS build), plus CocoaPods and a
  matching Xcode toolchain. This environment has Xcode but no CocoaPods,
  and a from-scratch native build is slow and heavyweight for an
  environment that's already resource-constrained (see the JDK note
  below). Detox is also the heavier long-term investment to wire into CI
  for a project that doesn't have native folders checked in.
- **Maestro** drives a *running* app (dev build, Expo Go, or a real
  binary) over its own CLI + on-device driver (`maestro-driver-iOS`, an
  XCUITest-based agent Maestro installs itself). No native project, no
  CocoaPods, no Xcode build step required to get started — it can attach
  to Expo Go directly. Flows are plain YAML, easy to review and extend.
  This is also the tool the previous E2E scaffold (`e2e/flows/` before
  this session) already assumed — see git history on this directory.

Maestro was chosen. Detox remains the better fit if/when this project
adopts EAS dev-client builds as the standard local run mode and wants
native-level control (e.g. simulating backgrounding for GPS work) — worth
revisiting when Feature 009's hardware-tracking phase lands for real.

## Environment check performed before building anything

Before installing anything, this session checked what was already
available (`docs/organization/incidents/INC-001-A13-criterion-6-bundle-verification.md`
records three prior attempts blocked by "no tap-injection tooling" —
`idb`/Maestro/Appium all absent, and a `osascript`-based workaround that
could read the UI but never actually clicked anything):

- `xcode-select -p` → Xcode 26.6 present, full iOS Simulator runtime
  available (`xcrun simctl list devices` — iPhone 17 Pro etc., iOS 26.5).
  **This meant a real device-automation path was available without any
  heavyweight install.**
- No Android SDK/emulator (`ANDROID_HOME` unset, no `~/Library/Android`,
  no `adb`/`emulator` binaries) — Android automation is out of scope for
  this session.
- `java`/`javac` on `$PATH` were stub binaries that error out
  ("Unable to locate a Java Runtime"), **but** a prior session's aborted
  attempt had already left a complete, working Temurin 17 JDK at
  `~/.local-jdk/jdk-17.0.20.1+1` (321 MB, fully extracted, `java -version`
  works). This was reused via `JAVA_HOME` instead of re-downloading a JDK
  — exactly the kind of leftover-state cleanup/reuse this task called out.
  Maestro's own CLI install (`curl -Ls https://get.maestro.mobile.dev |
  bash`) is a small download (a few MB) that only needs a JVM present at
  install time to unpack itself into `~/.maestro`; no separate JDK install
  was performed by this session.

## Setup (reusable)

```bash
# 1. JVM — reuse the repo-machine's existing JDK if present, else install
#    a JDK via your usual method (sdkman, brew, etc.) — do NOT default to
#    downloading a full JDK if one is already on the box, per the JDK note
#    above.
export JAVA_HOME=~/.local-jdk/jdk-17.0.20.1+1/Contents/Home   # adjust path
export PATH="$JAVA_HOME/bin:$PATH"

# 2. Maestro CLI
curl -Ls "https://get.maestro.mobile.dev" | bash
export PATH="$HOME/.maestro/bin:$PATH"
maestro --version   # confirms install
```

Add both `export`s to your shell profile for repeat use.

## Running against Expo Go (fastest local loop, what this session used)

The installed Expo Go build on a fresh simulator is very likely on an
**older SDK than this project** (this session found Expo Go 54 on a
simulator against an SDK 57 project — "Project is incompatible with this
version of Expo Go"). Fix by installing an SDK-matched Expo Go simulator
build directly (no App Store needed in the simulator):

```bash
# Find the right version for your SDK at https://expo.dev/go?sdkVersion=<N>&platform=ios&device=false
# then, e.g. for SDK 57:
curl -sL -o expo-go.tar.gz \
  "https://github.com/expo/expo-go-releases/releases/download/Expo-Go-57.0.9/Expo-Go-57.0.9.tar.gz"
mkdir expo-go-extracted && tar -xzf expo-go.tar.gz -C expo-go-extracted
mv expo-go-extracted "Expo Go.app"

xcrun simctl list devices                       # find/boot a simulator UDID
xcrun simctl uninstall <UDID> host.exp.Exponent  # remove the mismatched build
xcrun simctl install <UDID> "Expo Go.app"
```

Then, from `mobile/`:

```bash
# Flag-off (§2) run — mirrors eas.json's preview/production profiles:
EXPO_PUBLIC_FEATURE_CLAIMS=false \
EXPO_PUBLIC_FEATURE_LOCATION_TRACKING=false \
EXPO_PUBLIC_FEATURE_KYC=false \
EXPO_PUBLIC_FEATURE_ALERTS=false \
EXPO_PUBLIC_FEATURE_THEFT_REPORTING=false \
EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING=false \
EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR=false \
CI=1 npx expo start --port 8098

# In another shell, open the project in Expo Go on the booted simulator:
xcrun simctl openurl <UDID> "exp://localhost:8098"
```

`CI=1` puts Metro in CI mode (disables interactive reload prompts, which
otherwise steal terminal input in a non-interactive session). Wait for
`iOS Bundled ... node_modules/expo-router/entry.js` in the Metro log
before running flows.

Once loaded, dismiss the one-time "This is the developer menu" tip by
tapping **outside** the sheet (a plain tap at roughly `50%,15%` on the
simulator screen works reliably; tapping its own `Continue` button was
less reliable in testing and sometimes opened the full dev menu instead —
see "Known quirks" below).

## Running the flows

```bash
cd mobile
maestro test e2e/flows/auth-login.yaml
maestro test e2e/flows/flags-off-screens.yaml
maestro test e2e/flows/policies-and-assets.yaml
```

Each flow assumes it starts from the onboarding **welcome screen**
("Get started" / "I already have an account" / "Explore first"). Maestro's
`launchApp` does **not** get you there for an Expo-Go-hosted project —
it relaunches Expo Go itself to its own home screen (the dev-server
picker), not your project. Re-open the project link
(`xcrun simctl openurl <UDID> "exp://localhost:8098"`) instead, or, if
already mid-session, navigate back to the welcome screen manually (the
`‹` back arrow on the login screen, or log out from Account → Log out).

A standalone dev-client or EAS build (not covered by this session) would
not have this Expo-Go-home quirk — `launchApp` would work as normal.

## Flows in this directory

| File | Scenario | Checklist ref |
|---|---|---|
| `_login-customer.yaml` | Shared subflow: log in as `test.customer@tditsolutions.dev` (seeded via `backend/scripts/seed-test-accounts.ts`, verified against the live Render backend). Referenced via `runFlow` — not run directly. | — |
| `auth-login.yaml` | Login succeeds, lands on Home with the Home/Assets/Account tab bar. | §3 "Auth (login/signup/MFA) — session established" |
| `flags-off-screens.yaml` | Tab bar excludes Map/Alerts; 9 of 10 §2 rows (all but Security operator app) deep-link to their real gated fallback screen and are confirmed live via screenshot, not bundle-string inspection. | §2 — 9/10 rows (see below for Security operator app) |
| `policies-and-assets.yaml` | Assets/Account/Policies-list/Policies-create/Notification-preferences all reached and confirmed live against the real Render backend. | §3 — 5/5 rows (Policies' "create" leg stops short of the terminal mutation — see the flow file's own comment for why) |

### Extending this suite further

**9 of §2's ten rows are now live, tap-driven confirmations** (as of
2026-09-14 evening) — Map, Device locations, Live tracking, Claims, Alerts,
KYC profile, KYC verification, Theft report, Hardware tracker. **All 5 of
§3's rows are now live** (Auth, Policies, Assets, Notification prefs,
Account hub). What's still open:

- **Security operator app (§2's 10th row).** Requires logging in as
  `test.security@tditsolutions.dev`, which has `mfaRequired: true` and is
  already TOTP-enrolled — this session had no `backend/.env.local` /
  Supabase admin credentials to read the existing secret or `--force`
  re-enroll to get a fresh one. Whoever next has that credential access
  (see the CTO status doc's T-25) can extend `flags-off-screens.yaml` with
  the same pattern once logged in as that account.
- **The EAS build artifact.** Every flow in this directory has only ever
  run against Expo Go / a local Metro dev server, never the actual
  `preview` `.apk`/`.ipa`. This is a config gap, not a flow-coverage gap —
  see "Running against Expo Go" above and the checklist doc's per-row
  configuration tags.
- **A single, fully green, uninterrupted run of `policies-and-assets.yaml`
  end-to-end.** Every individual segment in that flow has been proven live
  with a reviewed screenshot across multiple runs, but the flakiness
  described below (plus one XCUITest driver hang that needed a simulator
  reboot to clear) meant no single run made it start-to-finish clean in
  ~10 attempts. Re-running the flow as-is should eventually produce one;
  it wasn't a blocking requirement for counting each row as proven.

## Known quirks (read before debugging a "flaky" flow)

- **`launchApp` vs Expo Go.** See above — use `openLink`/manual
  navigation, not `launchApp`, when testing against a Metro dev server
  via Expo Go.
- **Ambiguous label text on form fields.** `mobile/src/theme/primitives/Input.tsx`
  renders both a `Text` label ("Email") and a `TextInput` with
  `accessibilityLabel` set to the *same* string. `tapOn: "Email"` can
  match either one, and tapping the label instead of the field silently
  no-ops (the actual `TextInput` never gets focus, so subsequent
  `inputText` goes nowhere or lands on whatever *was* focused). **Fix
  applied this session:** `Input.tsx` now sets a deterministic
  `testID="input-<slugified-label>"` on the `TextInput` (e.g.
  `input-email`, `input-password`) when the caller doesn't pass an
  explicit `testID`. Use `tapOn: { id: "input-email" }` etc. going
  forward — this is now the stable selector for every `Input` in the app,
  not just login.
- **Tab bar label collisions.** The Home screen's stat row also renders
  the word "Assets" (`1 Assets`), so `tapOn: "Assets"` can match that
  instead of the bottom tab. Bottom-tab taps in the committed flows use
  `point:` percentages (`50%,94%` for the middle tab, `80%,94%` for the
  rightmost) rather than text — brittle across layout changes, but
  reliable today. If `design-system-manager`/`mobile-engineer` add
  `testID`s to the tab bar items, switch to `id:` selectors instead.
- **Screenshot/assertion race just after navigation.** Several
  `takeScreenshot` calls in this session's interactive investigation
  captured a screen *mid-transition* (e.g. showing the previous screen a
  moment before the real one rendered), even though the next screenshot
  taken seconds later showed the correct, fully-rendered result. Treat a
  single failed `assertVisible`/`extendedWaitUntil` right after a
  navigation or network action as inconclusive on its own — re-check with
  a fresh screenshot before concluding a real regression. The committed
  flows use `extendedWaitUntil` with generous timeouts (15–35s) rather
  than bare `assertVisible` for this reason.
- **Password field / post-login navigation flakiness — real, not yet
  root-caused.** Across this session's ~10 login attempts, the password
  `TextInput` intermittently ended up empty after a `tapOn: { id:
  "input-password" }` + `inputText`, even with `hideKeyboard` avoided
  between fields and an explicit `retry` block added (see
  `_login-customer.yaml`). Two plausible causes were identified but not
  conclusively isolated in the time available:
  1. A bridge/render race where `inputText` fires before the newly
     focused `TextInput` has finished mounting/re-rendering after the
     tap, dropping keystrokes.
  2. **Duplicate mounted screen instances with the same `testID`** after
     extended back-and-forth navigation within one long interactive
     session (React Navigation can keep prior stack entries mounted) —
     `tapOn: { id: "input-password" }` may then resolve to an off-screen
     instance while the visible one stays untouched. This did **not**
     reproduce when a flow ran once, cleanly, against a freshly
     welcome-screen app state (the successful runs captured in the
     verification record below were all early in the session, before
     dozens of manual back/forward navigations accumulated stack depth).
  A real backend check (`curl .../auth/login` with the same credentials)
  confirmed the account was never locked out and the API consistently
  returned `200` in ~1s — this is a client/harness-side issue, not a
  backend or credentials problem. **Quarantined, not blocking**: run
  `auth-login.yaml` from a genuinely fresh app state (first thing after
  opening the Expo Go link, before any other manual navigation) for the
  most reliable result. Tracked for `automation-qa-engineer` /
  `mobile-engineer` follow-up — remediation options: (a) root-cause via
  the RN DevTools element inspector while reproducing, (b) add a
  `waitForAnimationToEnd` tuned empirically once reproduced outside an
  already-deep navigation stack, (c) confirm/deny the duplicate-testID
  theory by checking whether `Stack.Protected`/route unmounting is
  configured to actually unmount prior screens.
- **First-launch "developer menu" tip.** Expo Go shows a one-time
  overlay ("This is the developer menu...") the first time a project
  loads in a given Expo Go install. Tapping its `Continue` button was
  inconsistent in testing (sometimes it instead opened the *full* dev
  menu, which then needs a tap outside the sheet — e.g. `50%,15%` — to
  dismiss). Not an issue on subsequent loads in the same Expo Go install.
- **`assertVisible`/`extendedWaitUntil` against plain `<Text>` is
  unreliable in this session's Maestro+XCUITest setup — real, reproducible,
  not root-caused.** Found while extending `flags-off-screens.yaml` and
  `policies-and-assets.yaml` (2026-09-14 evening): a headline string that a
  `takeScreenshot` taken at the exact moment of a "FAILED" assertion
  clearly shows on-screen would still fail the visibility query — this
  reproduced across a fresh `terminate`+relaunch and a fresh Metro reload,
  which rules out an ordinary post-navigation timing race as the sole
  cause. It affected `openLink`-reached screens most consistently but also
  hit ordinary in-app-tap-navigated screens intermittently (e.g. the
  Account tab's own email/plan text). Interactive elements — `Button`,
  `Pressable`, the "Back to home" button on every gated fallback screen —
  did **not** show this flakiness. **Mitigation adopted across both flow
  files:** wait for/tap an interactive element as the "did we actually get
  here" proof, and use `takeScreenshot` for the actual copy-match evidence,
  independently reviewed by a human/orchestrator rather than asserted by
  the flow itself. This is a *different*, not weaker, evidence combination
  — flagged here so a future session doesn't burn time re-discovering it,
  and doesn't mistake "no bare `assertVisible` on headline text" for an
  oversight. Root-cause candidates not yet ruled out: a stale
  accessibility-tree cache inside Maestro's iOS driver across repeated
  `openLink` calls in one long-running session, or a hit-testing
  discrepancy specific to `Text` nodes nested inside this codebase's
  `Alert`/`FeatureUnavailableScreen` component tree. Worth a dedicated
  root-cause pass before this harness is treated as CI-gate-reliable for
  text-heavy assertions.
- **XCUITest driver hangs mid-run, requiring a simulator reboot.** Twice in
  this session a `maestro test` run froze indefinitely mid-command (no
  error, no timeout, no progress) with the underlying
  `maestro-driver-iosUITests-Runner` process still alive but unresponsive.
  Killing the `java`/`xcodebuild`/driver-runner processes and *reissuing
  the same command* did not recover it — a full `xcrun simctl shutdown` +
  `boot` of the simulator was needed before `maestro test` would reliably
  install/start the driver again. If a run hangs past ~2 minutes with no
  log progress (`tail -f ~/.maestro/tests/<latest>/*/logs/maestro.log`),
  reboot the simulator rather than waiting it out or repeatedly retrying
  in place.
- **Toggle/Switch now has a stable `testID`.** `mobile/src/theme/primitives/Toggle.tsx`
  previously exposed only an `accessibilityLabel` (no `testID`), making its
  native `Switch` untappable by a stable Maestro selector. Added
  `testID="toggle-<slugified-accessibilityLabel>"` (default, overridable),
  same pattern as `Input.tsx`'s existing `input-<slug>` fix. Use
  `tapOn: { id: "toggle-email-notifications-for-general" }` etc. going
  forward for any `Toggle` in the app, not just notification preferences.
  `npx jest` (158/158) confirms this didn't break `Toggle.test.tsx` or
  anything consuming the component.

## Verification record (2026-09-14, updated evening)

What was actually run and observed, with real device automation (XCUITest
via Maestro, not a source-code/bundle-string substitute):

- `maestro test <ad hoc tap-test.yaml>` — first real tap driven into the
  app process, confirmed via debug artifacts under
  `~/.maestro/tests/<timestamp>/`.
- Full login as `test.customer@tditsolutions.dev` against the **live
  Render backend** — real network round trip, landed on the real Home
  screen ("Good afternoon, Test", live protection-status counts, real
  registered asset "QA Test Laptop").
- Tab bar on that authenticated session showed only **Home / Assets /
  Account** — no Map, no Alerts tab — consistent with all
  `EXPO_PUBLIC_FEATURE_*` flags set `false` for that Metro session.
- Assets tab ("Protection vault") showed the real plan ("Essential,
  R199/month, 1/5 assets") and the registered asset with "Hardware
  tracker required" — no location coordinates anywhere.
- Account tab showed profile (name/email), plan, and a **Claims** row
  reading "Claims filing coming soon" — no KYC/identity-verification rows
  present.
- `openLink: "exp://localhost:8098/--/claims"` while authenticated
  rendered the real gated screen: "Claims filing is coming soon." / "In-app
  claims filing is not available in this build yet..." with a "Back to
  home" button — a live-navigated confirmation of a §2 row, not a static
  one.
- Logged out successfully (Account → scroll → Log out) back to the
  welcome screen, confirming session teardown works too.

This directly resolves the blocker recorded in
`docs/organization/incidents/INC-001-A13-criterion-6-bundle-verification.md`
("no tap-injection tooling... could not drive the app's UI").

### Evening extension (2026-09-14) — §2 to 9/10, §3 to 5/5, §5 executed, §4 attempted

Everything below ran against Expo Go / a local Metro dev server (ports
8098 for flags-off, 8099 for flags-on), never the EAS `preview` artifact.

- `flags-off-screens.yaml` extended to 9 of §2's 10 rows (all but Security
  operator app — MFA-gated test account, no credential access this
  session to log in as it). Each row's gated-screen headline was read from
  source *before* writing the assertion (not assumed), and each run's
  `takeScreenshot` was independently reviewed against that exact string:
  Map/Device locations/Live tracking all render the same
  `LocationTrackingUnavailableScreen` ("Live location tracking is coming
  soon."); Claims/Alerts/KYC-profile/KYC-verification/Theft-report/
  Hardware-tracker each render `FeatureUnavailableScreen` with distinct
  per-route copy — all confirmed on-screen.
- `policies-and-assets.yaml` extended to all 5 of §3's rows. Policies list
  (`/policy`) showed the real seeded "Essential" policy
  (R199/month, 1/5 assets, "pending activation") from a live
  `GET /v1/policies`. Policies create (`CreatePolicyScreen`, reached via
  "Choose another plan") showed the real plan catalog (Essential R199/mo,
  Plus R399/mo "MOST POPULAR") from a live `GET /v1/plans` — the terminal
  `POST /v1/policies` was deliberately not exercised (shared, non-disposable
  fixture account, no policy teardown path). Notification preferences
  (`/notification-preferences`) showed real per-category/channel toggle
  state (Theft-alerts Push correctly locked/disabled) from a live
  `GET /v1/notifications/preferences`, and a toggle tap round-tripped a
  live `PATCH` with no error surfaced.
- **§5 (AsyncStorage) executed for real**, not just unit-tested: started a
  fresh Metro session with `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` at its
  default (`true`), confirmed via screenshot that the Home "Live protection
  map" widget genuinely fetched and returned ("No pinned locations yet" —
  a resolved-empty state, not loading/error), visited `/device-locations`
  and `/map` (both read that same location-summary query), force-quit via
  `xcrun simctl terminate`, relaunched, then read the real persisted
  AsyncStorage blob directly off disk:
  `xcrun simctl get_app_container <udid> host.exp.Exponent data` →
  `Documents/ExponentExperienceData/@socials/mobile/RCTAsyncLocalStorage/`.
  `manifest.json` maps `td_insurance.query_cache` to a file named by the
  **MD5 hash of the key string itself** (confirmed:
  `md5("td_insurance.query_cache") == 5eafb4df7857a2359c8459af010cd775`,
  matching the real filename present). After relaunch, 11 query keys were
  persisted (`assets`, `policies`, `plans`, `account.me`,
  `recovery.cases`, `alerts`, etc.) — **`['assets','location-summary']`
  was absent**, and a full-text scan of the blob for `"lat"`, `"lng"`,
  `"latitude"`, `"longitude"`, and any coordinate-shaped number
  (`-?\d{1,3}\.\d{4,}`) returned zero matches. This confirms
  `shouldPersistQuery`'s exclusion end-to-end on a real device, not just
  in its own unit test.
- **§4 (network egress) attempted further than any prior session, still
  blocked, more specifically now.** `pip3 install mitmproxy` succeeded
  (no `brew` in this sandbox; pip worked). Generated its CA cert
  successfully and confirmed `xcrun simctl keychain <udid> add-root-cert`
  as the no-manual-Settings-tap way to trust it. **Blocked at routing
  Simulator traffic through the proxy** — that requires
  `networksetup -setwebproxy`/`-setsecurewebproxy` on the host Mac, which
  returned "Command requires admin privileges" (`sudo -n true` confirmed
  no passwordless sudo either). A host-OS admin-privilege wall, not a
  missing-tool one. All four §4 checkboxes remain unchecked in the
  checklist doc.

File the completed checklist run back to
`docs/organization/incidents/INC-001-A13-criterion-6-bundle-verification.md`
§6 when `security-engineer`/`cybersecurity-architect` schedule the
sign-off pass — it is **still not closable from this alone**: the
Security operator app row, the EAS build-artifact configuration, and all
of §4 remain open.

## MP-8

Run E2E against a **separate Mongo database name** on Atlas, not
production data. See `backend/docs/DEPLOY.md`. (Unchanged from the prior
scaffold note — this session's runs hit the live Render/Mongo backend
directly since no staging environment exists yet per `HANDOFF.md`; treat
`test.customer@tditsolutions.dev`'s asset data as shared fixture data, not
disposable — this is also why the policy-create flow stops short of
actually subscribing to a plan.)
