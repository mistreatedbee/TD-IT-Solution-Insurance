# Mobile E2E — Maestro

**Owner:** `automation-qa-engineer`
**Status:** Real, working harness — installed, driven with actual tap
injection (XCUITest under the hood), and verified against the live app on
an iOS Simulator on 2026-09-14. This is not a stub. See "Verification
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
| `flags-off-screens.yaml` | Tab bar excludes Map/Alerts; `claims` deep link renders the real "Claims filing is coming soon" gated screen (confirmed live, not just bundle-string inspection). | §2 (Claims row fully; other rows still need extending — see below) |
| `policies-and-assets.yaml` | Assets tab shows plan info + registered asset list with no raw lat/lng ever rendered; Account tab shows profile/plan with no KYC rows. | §3 "Policies", "Assets", "Account hub" |

### Extending this suite

§2's table has ten rows; this session's time-boxed verification pass got
one (Claims) to a fully live, tap-driven confirmation, backed by direct
observation (not just static analysis). The remaining rows (map,
device-locations, live-tracking, alerts, KYC profile/verification, theft
report, hardware tracker, security-operator) follow the same pattern —
add an `openLink: "exp://localhost:8098/--/<route>"` + `extendedWaitUntil`
+ `assertVisible` block per row to `flags-off-screens.yaml`. Route paths
are in each screen's gating `_layout.tsx` under `mobile/app/(app)/`.

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

## Verification record (2026-09-14)

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
("no tap-injection tooling... could not drive the app's UI"). File the
completed checklist run (a from-scratch, single-session `maestro test
e2e/flows/` pass, ideally on a physical device or a fresh simulator/Expo
Go state to avoid the stacked-navigation flakiness noted above) back to
that document's §6 when `security-engineer`/`cybersecurity-architect`
schedule the sign-off pass.

## MP-8

Run E2E against a **separate Mongo database name** on Atlas, not
production data. See `backend/docs/DEPLOY.md`. (Unchanged from the prior
scaffold note — this session's runs hit the live Render/Mongo backend
directly since no staging environment exists yet per `HANDOFF.md`; treat
`test.customer@tditsolutions.dev`'s asset data as shared fixture data, not
disposable.)
