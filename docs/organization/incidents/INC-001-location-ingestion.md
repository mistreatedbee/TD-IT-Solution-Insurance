# INC-001 — Post-Mortem: Location Ingestion Shipped Past an Explicit ADR Prohibition

- **Status:** **CONTAINED** (server-side write kill switch live in production and confirmed; client feature flag off). **Not closed.**
- **Chair:** `cybersecurity-architect` · **Date:** 2026-08-25
- **Severity:** High (Stage 8 bypass on the platform's most sensitive data class) — **not** Critical, and the reason it is not is at §3.
- **Related artifacts:** [`ADR-0009 §18`](../adr/0009-self-asserted-location-ingestion-trust-boundary.md) (append-only correction of the false verification) · [`INC-001-location-events-inventory.md`](./INC-001-location-events-inventory.md) (`database-architect`, data inventory + quarantine, purge/retain decision open with `compliance-specialist`)
- **Blameless.** Every artifact named below was written in good faith by a role doing its job. The failure is in the *method* the project uses to verify claims, not in anyone's diligence.

---

## 1. What happened

`POST /v1/assets/:assetId/location-report` shipped to production and into a client-distributed preview APK. It writes customer smartphone GPS coordinates to `assets.lastLocation` and appends every ping to a `location_events` collection. Three owner-scoped read endpoints shipped with it, plus `expo-location` in the mobile client and map surfaces on web (Leaflet) and mobile (`react-native-maps`).

It shipped:

- **without SDL-4** — no server-side consent record of any kind. Consent is a string in device SecureStore (`mobile/src/location/consent.ts`); the server never checks it.
- **without SDL-9** — no step-up re-authentication to enable tracking, no out-of-band notification to the account holder, no server-side opt-out.
- **without SDL-1's `assertionMode`** — the field does not exist anywhere in the codebase.
- **without SDL-8** — no TTL, no purge job, against a retention period that has never been set.
- **without a Stage 8 security review**, which `CLAUDE.md` and `02-feature-lifecycle.md` both describe as a hard gate that is never skipped.
- **against an explicit, ratified, written prohibition.** ADR-0009 §14 says, in the imperative: *"Not an instruction to add `expo-location`, a permission string, or any client capability… `mobile/package.json` has no location dependency today and should not acquire one on the strength of this document."*

What was built correctly, and should be said plainly: **SDL-3** (session-authenticated write, owner-scoped, dedicated rate limiter, fail-closed on an unbound device), **SDL-11** (server-side `smartphone`-only scope lock and constrained `triggeredBy` enum), and the server-side hardcoding of `source: 'self_device'` — the request body cannot launder a self-asserted ping into a stronger evidence class. `database-architect`'s findings on all of these are confirmed against the code by this chair.

## 2. Containment

`LOCATION_INGESTION_ENABLED` (`backend/src/config/env.ts`, `backend/src/routes/assets.ts` ~L111–119) fails closed on unset **and** on any unrecognised value, is checked before any session or database work, and is regression-tested three ways in `backend/src/routes/asset-location.test.ts`. Client-side, `FEATURE_LOCATION_TRACKING_ENABLED` prevents `expo-location` from being called at all. The write path is unreachable.

**The read paths are not gated.** Pre-containment coordinates remain readable by their owner and, via `GET /v1/admin/assets/:assetId`, by any admin. That is a live decision for `compliance-specialist`, not for this document.

## 3. Why this is contained rather than a personal-safety incident: SDL-2 held

Every consumer of `location_events` and `assets.lastLocation` was traced in this audit. **Nothing on this platform uses a self-asserted coordinate to drive a real-world, financial, or dispatch consequence.** The partner-organisation surface exposes a timestamp and never a coordinate; both security-operator live-tracking screens are honest placeholders; the alerts engine reads account/policy/case state and no location; `recovery_cases.lastLocation` still has no writer; there is no claims or payments consumer to leak into.

SDL-2 held **because nobody built the consumer yet** — not because a control refused one. That is precisely what SDL-2 was designed to be (a structural defence that makes a class of harm impossible rather than one that relies on developers remembering), and it is the single reason a Stage-8 bypass on live geolocation is a remediation exercise instead of a disclosure event.

## 4. How code shipped past an explicit prohibition

1. **The prohibition lived in a document, and documents are not enforcement.** ADR-0009 §14 is unambiguous, ratified, and cited in `HANDOFF.md` and `CLAUDE.md`. It stopped nothing, because nothing mechanical read it.
2. **A design package became its own authorization.** Feature 009's phased roadmap is detailed, honest, and explicitly says *"Not approved for coding yet: KYC, hardware GPS, security partner map…"* — and Phases 2, 4, 5 and 6 shipped anyway. A design document that is thorough enough *reads* like a green light, and no artifact had to exist before merge to prove it wasn't one.
3. **The two features blurred at the boundary.** The ingestion endpoint is Feature 008 by ADR and Feature 009 Phase 5 by roadmap. Each frame could plausibly assume the other's gate applied. Nothing in the repository forced the question.
4. **The chair's own status check said the coast was clear.** ADR-0009 §17.4, signed the same session, asserted that no ingestion endpoint existed. Anyone who checked before building would have been told, by the governing document, that they were first. That is §5.

## 5. Root cause — the third instance this session

`cto`'s framing, adopted here as the finding:

> **This project's verification is narrative rather than mechanical.**

Three independent cases in a single session, none of which share an author, a domain, or a mechanism — only a method:

| # | The document said | The code said |
|---|---|---|
| 1 | **SR-007-11:** "no admin account-suspend/deactivate endpoint exists anywhere in this codebase" | `admin-accounts.ts` had a complete `PATCH /admin/accounts/:id/state` with RBAC, audit logging, session revocation and push-token disablement — **built, and test-covered** |
| 2 | **ADR-0009 §14 / §17.4:** "verified 2026-08-24: no location ingestion endpoint exists… no `expo-location` dependency exists" | `POST /v1/assets/:assetId/location-report` was live in production and in a distributed APK; `expo-location` was a declared dependency |
| 3 | **App icons:** documented as "the real TD IT Solution Insurance brand mark", correcting an earlier line that called them Expo defaults | `mobile/assets/android-icon-monochrome.png` is a **completely blank white image** — verified by opening it during this audit |

Two of the three were *corrections of earlier errors* — someone went back to fix the record and introduced a new false statement in the same motion. Being careful is not the missing ingredient. **The pattern is that a claim about the state of the codebase was produced by a human-scale reading, written into prose, and thereafter cited as fact by every downstream document, with no mechanism able to notice when it stopped being true.**

The sharpest sub-lesson, from case 2 and now a standing rule in ADR-0009 §18.3:

> **A negative verification must enumerate what was searched, or it proves nothing.**

The 2026-08-24 check was real. It examined `recovery_cases.lastLocation` — the path ADR-0009's own §2 survey had focused on — found no writer, and generalised one true negative into a claim about the entire platform. The live path used a different collection, a different field, and a route file nobody would grep for by name. "I checked these paths with this pattern and found nothing" is evidence. "No X exists" is not, and the distance between the two sentences is where this incident lived.

## 6. Remedy — CI checks, not more careful prose

Proposed mechanical gates, each mapped to the case it would have caught. All are cheap, all fail the build, none require anyone to remember anything.

### CI-1 — Route/screen inventory vs. Stage 8 manifest *(catches cases 1 and 2; catches all of §7)*
A script enumerates every `router.<verb>('<path>')` under `backend/src/routes/`, every file under `mobile/app/**`, and every route in `src/*/Routes.tsx`, and diffs the result against a checked-in `docs/organization/gates/stage8-manifest.yaml` in which each entry names its feature, its `security-review.md`, the chair verdict, and the sign-off date. **Any surface not in the manifest fails CI.** A new endpoint cannot merge without either a gate record or an explicit, reviewed `waived:` entry with an owner. This is the single highest-value control here: it would have made Feature 009 impossible to ship silently and would have made SR-007-11's claim self-correcting.

### CI-2 — ADR prohibition guard *(catches case 2)*
`docs/organization/gates/prohibitions.yaml` encodes each live ADR prohibition as a machine-checkable rule — e.g. `forbid_dependency: expo-location in mobile/package.json # ADR-0009 §14`, `forbid_route_pattern: location-report # ADR-0009 §14`. CI fails with the ADR section quoted in the error. Lifting a prohibition then requires editing the rule file, which is a reviewable act with an author; today it requires nothing.

### CI-3 — Executable negative assertions in documents *(catches cases 1 and 2 — the same failure in both directions)*
Any document making a state claim carries a fenced, re-runnable claim block:
```verify
absent: rg "location-report" backend/src/routes/
absent: dependency expo-location in mobile/package.json
present: function purge_expired_audit_log scheduled
```
CI re-executes every block on every run and fails when a claim goes stale. This converts "verified 2026-08-24" from a sentence into an assertion that keeps verifying itself, and it makes the enumeration requirement of §5 structural: you cannot write the claim without writing the search.

### CI-4 — Asset non-blankness and reference integrity *(catches case 3)*
For every image referenced by `mobile/app.json`, `index.html`, or a manifest: assert the file exists, and assert it is not a single uniform colour (fail if the distinct-pixel count or Shannon entropy is below a floor). A blank white 1024×1024 PNG is trivially detectable and was shipped as a brand mark.

### CI-5 — Sensitive-value egress assertions *(defence in depth for SDL-6)*
Grep-level: no `console.*` / log call may take an identifier matching `lat|lng|latitude|longitude|coord`. Test-level: golden-response tests asserting that no non-owner serializer emits `latitude`/`longitude`, and that `PersistQueryClientProvider`'s dehydrate filter excludes location query keys. ADR-0009 §7 already specified test case 6 as "a grep-able assertion, not only a unit test" — this makes it one.

### CI-6 — Generated status blocks *(removes a whole class of drift)*
Test counts, route lists and collection inventories in `HANDOFF.md` / `CLAUDE.md` are emitted by `npm run docs:status` into delimited generated blocks; CI regenerates and fails on any diff. Numbers that drift every session should not be typed by hand.

**Owners:** CI-1/CI-2/CI-3 `devops-engineer` + `cybersecurity-architect` (rule content), CI-4 `devops-engineer`, CI-5 `security-engineer`, CI-6 `technical-writer` + `devops-engineer`. **CI-1 and CI-3 are the two that matter most; the rest are worth having but would not, alone, have prevented any of the three cases.**

## 7. Systemic Stage-8 audit of Feature 009 — "I assume nothing about what else shipped ungated"

Every Feature 009 surface found in the tree, mapped to its Stage 8 record. **There is no `docs/features/009-customer-experience-redesign/security-review.md`.** The only security artifact in the package is `08-qa-security-accessibility.md` §1 — a pre-implementation checklist, with no chair verdict, no `security-engineer` concurrence, no `compliance-specialist` concurrence, and two of its own seven rows still marked **Open**. It is an input to a Stage 8, not a Stage 8.

| Surface (route / screen) | Phase | Stage 8 record |
|---|---|---|
| `GET /v1/account/profile`, `PATCH /v1/account/profile` | 2 | **None** |
| `POST /v1/account/profile/verification/submit` | 2 | **None** |
| `GET /v1/admin/verification-requests` | 2 | **None** |
| `GET /v1/admin/accounts/:id/profile` | 2 | **None** |
| `PATCH /v1/admin/accounts/:id/profile/verification` | 2 | **None** |
| `GET /v1/tracking/installation-guide` | 4 | **None** |
| `POST /v1/tracking-devices/register` | 4 | **None** |
| `POST /v1/assets/:assetId/tracking-devices/link` | 4 | **None** |
| `GET /v1/assets/:assetId/tracking-profile` | 4 | **None** |
| `POST /v1/assets/:assetId/location-report` | 5 / F008 | **None** — this incident |
| `GET /v1/assets/:assetId/location`, `GET /v1/assets/location-summary`, `GET /v1/assets/:assetId/location-history` | 5 | **None** |
| `GET /v1/alerts`, `PATCH /v1/alerts/:alertId` | 6 | **None** |
| Collections `customer_profiles`, `tracking_devices`, `location_events`, `alerts` | 2/4/5/6 | **None** — no Stage 6 field-sensitivity review for any of them |
| Mobile: home, alerts, map, device-locations, live-tracking, report-theft ×3 | 1/5/6/7 | **None** |
| Mobile: assets vault, asset detail, register, activate-tracker, device-health, installation-guide | 3/4 | **None** |
| Mobile: account, account/profile, account/verification | 2 | **None** |
| Mobile: `(security-app)` operator portal — index, `cases/[caseId]`, `tracking/[caseId]`, profile, prefs | 8 | **None** |
| Mobile: `claims/` ×3 | — | **None**; no backend route exists behind them (stub against a 404) |
| Web: customer protection map (`/dashboard`, Leaflet) | 5 | **None** |
| Web: `src/admin/pages/AdminVerificationPages.tsx` | 2 | **None** |
| Web: `src/security/pages/SecurityCasePages.tsx` | 8 | **None** |

**Coverage: 0 of ~24 Feature 009 surfaces have a Stage 8 record.** Beyond the location incident, the audit found:

- **F009-1 (High) — KYC/identity-verification shipped against its own roadmap.** `09-implementation-roadmap.md` says *"Not approved for coding yet: KYC"*; Phase 2 shipped a full profile + verification pipeline handling SA ID number, residential address, phone, and emergency contact, plus an admin review surface. Storing only `idNumberLast4` is a genuinely good design choice — made unilaterally, with no `compliance-specialist` data-classification ruling, no field-sensitivity review, and no RoPA entry (C-006-4 remains open).
- **F009-2 (High) — no audit trail on the admin verification surface.** `GET /v1/admin/verification-requests`, `GET /v1/admin/accounts/:id/profile`, and `PATCH …/verification` are privileged non-owner reads and writes of identity documents. They must carry ADR-0006 Trail B `admin_access_log` entries (and, for the PATCH, an accountable decision record). Same shape as SD-FU-05 and SD-FU-10; these three should be closed as one work item.
- **F009-3 (Medium) — privileged token minting on a routine read.** `GET /v1/account/profile` and the verification submit path call `ctx.supabase.mintTransientUserAccessToken(account.email)` inside a `try { } catch { /* best-effort */ }` to determine MFA state. A privileged credential is minted on every profile view, and any failure silently reports `mfaEnrolled: false` — a security-posture indicator that fails *open* into "you are less protected than you are", or into a nudge loop. Needs `authentication-engineer` review.
- **F009-4 (Medium) — hardware tracking-device registry shipped with no vendor and no Stage 8.** `tracking_devices` stores customer-supplied IMEI/serial with a cross-account collision check that returns `CONFLICT` — which is an existence oracle for another account's registered IMEI. Low practical value to an attacker today, real once devices are real; the deferred-takeover precedent from SR-007-2 is the pattern to apply.
- **F009-5 (Medium) — `location_events` history ordering is client-controlled** (ADR-0009 SDL-7; filed as SD-FU-11).
- **F009-6 (Medium) — coordinates leave the platform boundary to map vendors** (SD-FU-08) **and rest in plaintext `AsyncStorage` on the device** (SD-FU-09). See ADR-0009 §18.5.

**Chair verdict on Feature 009: BLOCKED for real customer data.** Not blocked for continued internal development. The gate cannot be discharged retroactively by this document; it needs a real `security-review.md` for Feature 009 with `security-engineer` and `compliance-specialist` concurrence, and F009-1/F009-2 close before any real identity data is processed.

**Release Gate A moves.** Per `cto`'s standing ruling that further gaps move the gate, Gate A cannot be held with 24 ungated surfaces and two ungated new PII classes.

## 8. Actions

| ID | Action | Owner | Blocks |
|---|---|---|---|
| A-1 | Feature 009 `security-review.md` — chaired Stage 8 across all §7 surfaces | `cybersecurity-architect` + `security-engineer` + `compliance-specialist` | Release Gate A; any real customer data on 009 surfaces |
| A-2 | CI-1 (route/screen ↔ Stage 8 manifest) | `devops-engineer` + `cybersecurity-architect` | Nothing — but it is the control that prevents recurrence |
| A-3 | CI-3 (executable negative assertions) | `devops-engineer` + `technical-writer` | — |
| A-4 | CI-2 (ADR prohibition guard) | `devops-engineer` | — |
| A-5 | F009-2 audit trail on admin verification surface (with SD-FU-05, SD-FU-10) | `backend-architect` + `cybersecurity-architect` | Real identity data |
| A-6 | F009-1 data classification + field-sensitivity review for `customer_profiles` | `compliance-specialist` + `database-architect` | Real identity data |
| A-7 | SDL-4 + SDL-9 design (server-side consent object, step-up, out-of-band notice, immediate opt-out) | `authentication-engineer` + `backend-architect` | Re-enabling ingestion |
| A-8 | SDL-1 `assertionMode` + SDL-8 scheduled purge against a retention number | `database-architect`; period from `compliance-specialist` | Re-enabling ingestion |
| A-9 | Purge/retain decision on pre-containment location data | `compliance-specialist` | **CLOSED 2026-09-02 — NIL PURGE.** Inventory returned zero `location_events` documents and zero assets with a non-null `lastLocation`; the §7 purge ruling stands with nothing to operate on. Ruling and its limits: [`INC-001-location-events-inventory.md` §2a/§2b/§6](./INC-001-location-events-inventory.md). **No longer blocks closing INC-001.** New condition **INC-001-C-13** (database-identity positive control, `database-architect`, 2026-09-08) blocks the nil purge certificate (C-7), not A-9 |
| A-10 | CI-4 asset non-blankness; re-cut `android-icon-monochrome.png` | `devops-engineer` + `ui-designer` | Store-bound builds |
| A-11 | `HANDOFF.md` corrected — it still describes Feature 008 as wholly unimplemented, ADR-0009 as design-time only, and `mobile/package.json` as free of `expo-location`; `CLAUDE.md` cites a `backend/src/routes/asset-location.ts` that does not exist (the location routes live in `assets.ts`) | `technical-writer` | — |

**INC-001 closes when A-7, A-8 and A-9 are complete and a chaired Stage 8 signs off re-enabling ingestion. Not before.**

---

## 9. Chair's second pass — 2026-08-28

Appended, not rewritten. §1–§8 were re-verified against the tree and stand. This section adds what §1–§8 did not have: a **reachability** dimension on §7's audit (a surface with no Stage 8 record matters differently depending on whether a client can open it), the SDL-2/SDL-6 completion status, and the Release Gate A criterion-6 ruling.

### 9.1 SDL-2 — complete, and it held

Re-traced independently rather than carried from §3. Searches, per §5's own standing rule: `rg "lastLocation|dispatch|notify|alert" backend/src/routes/security-cases.ts` returns **nothing**; `rg "lastLocation|location_events|latitude" backend/src` returns 17 files, every one traced; no `claims.ts` or `payments.ts` route file exists; `recovery_cases.lastLocation` still has no writer.

**Finding: no self-asserted coordinate reaches a dispatch, pricing, adjudication, or third-party-instruction path.** SDL-2 is closed as a verification item. It remains a **standing** constraint — the day someone builds the first consumer, SDL-12's attestation requirement fires and this verification expires. Recorded in ADR-0009 §18.7(e).

### 9.2 SDL-6 — **not** complete

§18.2's "substantially met" refers only to the leakage floor. The requirement's own closing clause makes **SD-FU-02** — AUD-12's field-level-encryption evaluation, filed as Feature 008's `field-sensitivity-review.md` — a precondition on shipping ingestion. That file does not exist; `docs/features/008-self-device-gps-tracking/` holds four documents and none is it. The evaluation has not started, and it is a four-role joint item (`cybersecurity-architect` + `security-engineer` + `compliance-specialist` + `database-architect`), so it cannot be closed by this chair alone.

Also open and unremediated: **SD-FU-09** — `mobile/src/query/queryClient.ts` still calls `createAsyncStoragePersister` with no `shouldDehydrateQuery` filter, so coordinate results persist to plaintext `AsyncStorage`. Because of §9.3, this continues to occur in a flag-off preview build. **SD-FU-08** (map-tile vendor egress) is open. **SD-FU-10** is open and confirmed live: `serializeAsset` (`backend/src/lib/policy-asset-serializers.ts:59`) emits `lastLocation`, so `GET /v1/admin/assets/:assetId` returns coordinates to a non-owner with no AUD-9 purpose reference.

**SDL-6 status: floor met inside our own boundary; the mandated evaluation not started. Blocking on re-enabling ingestion.**

### 9.3 The reachability finding §7 did not make

§7 established that **0 of ~24** Feature 009 surfaces have a Stage 8 record. That table is confirmed mechanically: `docs/features/**/security-review*.md` returns 001, 004 (×2), 006, 007 — **no 008, no 009.** What §7 did not ask is which of those ungated surfaces a client can actually open in build #2. That question is criterion 6, and the answer is worse than the containment narrative suggests.

**The two flags in `mobile/src/config/features.ts` are the only client-side gates that exist.** `FEATURE_CLAIMS_ENABLED` blocks `app/(app)/claims/` at its `_layout.tsx`. `FEATURE_LOCATION_TRACKING_ENABLED` guards `useLocationReporter` and `AssetDetailScreen`'s **capture** path — and nothing else. Every other Feature 009 surface in §7's table has no gate of any kind.

Verified reachable in a preview/production build, ungated, with no Stage 8 record:

| Surface | Why it is a criterion-6 blocker, specifically |
|---|---|
| `app/(app)/device-locations/` → `DeviceLocationsScreen.tsx` | Calls `GET /v1/assets/location-summary`, reads `item.lastLocation.latitude/longitude` into map pins. Neither the screen nor its `_layout.tsx` imports the location flag. **Renders pre-containment coordinates to a client build today.** |
| `app/(app)/map/` → `ProtectionMapScreen.tsx` | Calls `useAssetLocationHistoryQuery` → `GET /v1/assets/:assetId/location-history`. Same absence of any guard. Also the SD-FU-09 persistence path. |
| `app/(app)/account/verification.tsx`, `account/profile.tsx` | Submits SA ID number, residential address, phone and emergency contact to `POST /v1/account/profile/verification/submit` (`backend/src/routes/customer-profile.ts:140`). This is **F009-1** — KYC shipped against its own roadmap's "not approved for coding yet" — and it is live, ungated, in the client build. A second new PII class with no data-classification ruling and no Stage 8. |
| `app/(app)/alerts/`, `app/(app)/index.tsx`, `report-theft/` ×3, `assets/[id]/activate-tracker`, `device-health`, `installation-guide`, `(security-app)/` ×5 | No gate, no Stage 8 record. Lower individual severity than the two above; they are in scope for criterion 6 all the same, because criterion 6 is not a severity test. |

**The kill switch closed the write path. It did not close the surface.** The server switch stops new coordinates being written; it does not stop the client displaying the ones already there, and the read endpoints have no switch (`compliance-specialist`'s POPIA assessment §2.4 reaches the same conclusion from the other direction and orders `Asset.lastLocation` nulled ahead of the general purge for exactly this reason). Coordinates collected without a lawful basis — that determination is `compliance-specialist`'s, §4.3, and is not softened here — remain renderable on a customer's screen in build #2 as things stand.

**Answer to the question this audit was set: the INC-001 gate bypass is not an isolated miss. It is the pattern.** Feature 009 shipped ~24 surfaces to a client build with zero Stage 8 records; location ingestion is the instance that happened to collide with an explicit ADR prohibition and therefore got noticed. Nothing about the *mechanism* was specific to location. Had `expo-location` not been an unusually greppable, unusually prohibited dependency, this would still be undetected — which is the whole argument for CI-1 at §6.

### 9.4 Release Gate A criterion 6 — **WITHHELD**

> Criterion 6: *"No surface that bypassed Stage 8 security review is reachable in a client build, and `cybersecurity-architect` signs a positive statement to that effect."*

**I do not sign it. Criterion 6 is unsigned and Release Gate A is not closeable. Build #2 (sprint items 3.1 and 3.2) does not ship.**

The statement criterion 6 asks for is not merely unproven — on the evidence above it is **false**. At least two ungated, un-Stage-8'd surfaces (`device-locations`, `map`) render location coordinates in a client build, and a third (`account/verification`) collects SA ID numbers. Signing would be the same failure this incident exists to correct: a narrative assertion outrunning the code, on the specific gate created to stop that happening.

**No partial or conditional sign-off is available.** Criterion 6 is worded as a universal negative over the client build. I cannot sign "no surface" while any surface qualifies, and I decline to reword it into something signable — the wording is doing exactly the work it was written to do.

**What would let me sign it.** Either path is legitimate; the first is faster and the second is better.

- **Path A — flag them off.** Extend the `features.ts` pattern to every §9.3 surface (a `_layout.tsx` guard each, as `claims/_layout.tsx` already does), set the flags `"false"` on the `preview` and `production` EAS profiles, and land a test per flag. Build #2 then ships an honestly-scoped app: auth, policy, assets, notifications. I sign criterion 6 on a re-verified build once `security-engineer` confirms the guards hold in the compiled bundle, not just in source. Owner `mobile-architect` + `mobile-engineer`; days, not weeks.
- **Path B — gate them properly.** Run A-1: a real chaired Feature 009 `security-review.md` across all §7 surfaces with `security-engineer` and `compliance-specialist` concurrence, closing F009-1 and F009-2 first. This is the correct outcome and it is not a build-#2-timeframe activity.

`cto` may of course accept this risk over my recommendation — that is `cto`'s authority and not mine. If that happens I will record the dissent here in full, per this role's standing obligation that no risk is accepted silently. **What must not happen is criterion 6 being marked green without either path completing.** `technical-project-manager`'s sprint plan already anticipates this: item 7 of Blockers to Watch says 3.1/3.2 slip if criterion 6 is unsigned, regardless of criteria 1–5.

### 9.5 Actions added

| ID | Action | Owner | Blocks |
|---|---|---|---|
| A-12 | Path A build-flag guards on every §9.3 surface, `"false"` on preview/production, tests per flag | `mobile-architect` + `mobile-engineer` | **Criterion 6 / build #2** — **DONE 2026-08-28** (`main`) |
| A-13 | Re-verify criterion 6 against the compiled preview bundle once A-12 lands — source-level guards are not evidence about a build | `security-engineer`, chaired by `cybersecurity-architect` | **Criterion 6 sign-off** — checklist filed; **blocked on EAS preview build** |
| A-14 | SD-FU-02 — AUD-12 field-level-encryption evaluation, filed as `008/field-sensitivity-review.md` | `cybersecurity-architect` + `security-engineer` + `compliance-specialist` + `database-architect` | Re-enabling ingestion (SDL-6) |
| A-15 | SD-FU-09 — `shouldDehydrateQuery` filter excluding location query keys from the persisted cache | `mobile-architect` + `security-engineer` | — **DONE 2026-08-28** |
| A-16 | `features.ts` comment says "fail-closed"; the implementation is enabled-when-unset. Comment-only correction | `mobile-engineer` | — **DONE 2026-08-28** |
| A-17 | `app.json` still declares `expo-location` + `ACCESS_FINE_LOCATION` with capture flagged off — decide whether build #2 ships a manifest asserting an unused capability | `mobile-architect` + `product-manager` | Store submission — **interim: `app.config.ts` strips plugin/permissions when flag off at build time (2026-08-28)** |
