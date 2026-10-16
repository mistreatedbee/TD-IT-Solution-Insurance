# INC-004 — Mobile feature flags were not inlined into release bundles (gated surfaces fail-open)

**Chair:** `cto` · **Date:** 2026-10-16 · **Status:** **OPEN — code fix landed, nothing re-verified on a device**
**Severity:** High. **Class:** control failure (the control INC-001 A-12 and INC-002 depend on did not operate).
**Filed by:** the orchestrating session, on the `cto` ruling of 2026-10-16, for `cto` to confirm.
Filed separately from INC-001 and INC-002 because the root cause differs (the bundler never
substituted the values, rather than a config value being flipped), it covers all seven flags and
every EAS build, and it invalidates evidence held in those records. INC-002 is on HALT awaiting the
owner, who must not decide on stale facts.

---

## 1. What happened

`mobile/src/config/features.ts` read each gated flag with a dynamic lookup,
`process.env[envKey]`. Expo's Babel preset (`babel-preset-expo` 57.0.11, Expo 57.0.22) substitutes
a value into the bundle only for a **literal** `process.env.EXPO_PUBLIC_*` member access. A dynamic
read is left in place and is `undefined` in a shipped native bundle, and `process.env.EAS_BUILD_PROFILE`
(not an `EXPO_PUBLIC_` variable) is not substituted either. The function therefore always took its
fail-open default, `raw !== 'false'`, so **every gated flag evaluated ON in a release bundle,
whatever `mobile/eas.json` said.**

Flags affected (all seven): `CLAIMS`, `LOCATION_TRACKING`, `KYC`, `ALERTS`, `THEFT_REPORTING`,
`HARDWARE_TRACKING`, `SECURITY_OPERATOR`.

## 2. How it was found

The `expo/no-dynamic-env-var` lint rule failed CI on 2026-10-16. The lint failure was then
investigated rather than silenced. Evidence (build-level, **not** a device test): transforming
`features.ts` with `babel-preset-expo` in production mode left `process.env[envKey]` and
`process.env.EAS_BUILD_PROFILE` untouched; after the fix the same transform yields
`featureEnabled("false")` when the variable is `"false"`.

## 3. Exposure window

- The dynamic read is recorded as present by 2026-09-21 (INC-002 V-5, per the `cto` ruling). In git,
  `git log -S'process.env[envKey]' -- mobile/src/config/features.ts` shows it at `ac1685d`
  (2026-09-23) and removed at `236fa8e` (2026-10-16); the file's earlier history is not separable.
  **The true start is not established here; treat it as at least 2026-09-21.**
- **Treat every EAS artifact built before `236fa8e` as having all seven gated surfaces ON** (CTO
  ruling). Artifact ids named in the ruling and **not independently verified by this author:** preview
  APKs `426e5c01`, `7f3694b9`; simulator build `1f89a386`; every `playInternal` AAB.
- Builds after `236fa8e` are **not** established as correct until the CI checks in §6 pass and a
  device test is done.
- Location *permission* in the Android manifest is probably accurate: `stripLocationFromConfig()` runs
  in Node at build time and does read `eas.json` correctly. It was never verified with
  `aapt2 dump permissions` on a submitted AAB (see §5).

## 4. Evidence invalidated

Every test layer so far ran in a mode where this defect could not appear: Expo Go / Metro dev (which
honours the flags), and Jest (which reads real Node env). None of it is evidence about a release
bundle. This includes the e2e observations behind `INC-001-A13-criterion-6-bundle-verification.md`.
Every manifest waiver whose reason says "gated via FEATURE_X" rested on a premise that was false in a
shipped bundle (the INC-002-B pattern).

## 5. Second defect found the same day (introduced by the fix, caught and fixed)

`236fa8e` changed the call sites to `featureEnabled(process.env.EXPO_PUBLIC_FEATURE_X)`. The existing
CI guard `mobile/scripts/verify-eas-feature-flags.mjs` discovered flags with a regex that only matched
the old quoted-string form, so it found **0 flags and printed PASS** — the INC-002 CI net was checking
nothing between `236fa8e` and `c05a4a0`. Fixed in `c05a4a0`: discovery matches the static form,
ignores comments, reports the legacy dynamic form as a violation, and **fails if fewer than 7 flags
are found.** Verified: current code passes with 7 flags; the old dynamic form, an empty file and a
6-flag file each exit 1.

## 6. Actions

| # | Action | Owner | Due |
|---|---|---|---|
| INC-004-1 | Static `process.env.EXPO_PUBLIC_FEATURE_*` reads (`236fa8e`) and the guard-script fix (`c05a4a0`). **Done**, not device-verified. | orchestrator | done 2026-10-16 |
| INC-004-2 | Fail-closed default for release bundles: `__DEV__ ? raw !== 'false' : raw === 'true'`; remove the dead `EAS_BUILD_PROFILE` branch from `features.ts` (keep it in `app.config.ts`); Jest cases with `__DEV__ = false` for unset, `"False"`, blank. Reviewed by `mobile-architect`, `cybersecurity-architect` (the function underpins ~14 waivers) and `security-engineer`. | `mobile-engineer` | 2026-10-20; reviews 2026-10-21 |
| INC-004-3 | CI, four layers: (1) `expo/no-dynamic-env-var` as an error plus a grep for `process.env[`; (2) transform-and-evaluate test per non-development profile (resolved `eas.json` env, production Babel transform, empty `process.env`, `__DEV__ = false`, assert every flag equals the profile value; delete one key and assert OFF); (3) `expo export` bundle smoke test asserting no `EXPO_PUBLIC_FEATURE_` / `EAS_BUILD_PROFILE` lookups remain; (4) the discovery fix in §5. **No EAS build on any track until green.** | `devops-engineer`, `automation-qa-engineer`; `security-engineer` reviews | 2026-10-23 |
| INC-004-4 | Re-assess `play-store-data-safety-declaration.md` for every affected build: at least the KYC rows (name, phone, address, date of birth, Government ID), theft-report / recovery-case rows (including precise coordinates from `GET /recovery/cases/:id/location`) and the security-operator portal were inaccurate. POPIA s22 determination for the window under the 72-hour discipline. | `compliance-specialist` | 2026-10-19 |
| INC-004-5 | Run `aapt2 dump permissions` on each submitted AAB. | `devops-engineer` | 2026-10-20 |
| INC-004-6 | Append a premise-invalidation disposition to every manifest waiver reading "gated via FEATURE_X" (mobile and backend). | `cybersecurity-architect` | 2026-10-21 |
| INC-004-7 | Append to `INC-001-A13-criterion-6-bundle-verification.md` that all prior live evidence came from Expo Go / Metro dev and Jest. | `security-engineer` | 2026-10-19 |
| INC-004-8 | Re-run the A-13 §2 device checks on a real EAS **release** artifact, not Expo Go. | `manual-qa-engineer` | 2026-10-27 |
| INC-004-9 | Repeat the D-6 tester/install count for the full exposure window. | `mobile-architect`, `devops-engineer` | 2026-10-20 |

## 7. Constraints in force

- INC-002's HALT and its §4(5) no-upload rule stand and are **extended to internal APK links**.
  Lifting the INC-002 halt now additionally requires this incident to close.
- No submission to Play review of any build made before `236fa8e`.
- Not decided here (owner): any change to what has already been distributed to testers.

## 8. Closure

Closes only when INC-004-2 through INC-004-9 are done, a release-artifact device test passes, and
`cto` records the window and count.
