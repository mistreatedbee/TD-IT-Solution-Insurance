# Feature 020: Protection Score (Ruling A, non-pricing). Architecture

**Stage:** 3, Architecture (lifecycle stage numbering per the dispatch; BRD §6 calls this "Stage 5–7" work)
**Owner:** `solution-architect`
**Date:** 2026-11-13
**Status:** Proposed. Needs `backend-architect`, `mobile-architect` and `cybersecurity-architect` review. No code exists yet.
**Inputs:** `business-requirements.md` (BRD), `compliance-ruling.md` (CR). Where they disagree, CR wins: it is later and narrower.

---

## 0. What I checked in code, and what I changed from the brief

I read `backend/src/routes/{assets,policies,customer-profile}.ts`, `backend/src/lib/{tracking-profile,profile-completion,customer-profile-serializer,asset-validation,policy-asset-serializers}.ts`, `backend/src/repositories/{assets,policies}.ts`, `mobile/src/config/features.ts` and `mobile/src/screens/home/{ProtectionHomeScreen,ProtectionHealthCard}.tsx`.

The brief suggested four candidate inputs that I **dropped** after checking the code and the rulings:

| Candidate | Why dropped |
|---|---|
| Asset photos present | `AssetDocument.photos` exists, but nothing writes to it. Every create path sets `photos: []` and there is no upload route (MP-5, no object-storage vendor). A factor nobody can complete is a dark pattern (CR W-6/W-7). Revisit when MP-5 ships. |
| Phone location status (`locationSource === 'self_device'`, which `resolveTrackingProfile` reports as "This phone") | This is the Feature 008 self-device location consent. Consent-gated inputs are **forbidden** (BRD §3, R09-3; CR §4). |
| Hardware tracker linked (`resolveTrackingProfile` with a device) | This is IN-8. It is a placeholder until a GPS vendor is ratified and G-6 is answered. It must be **absent**, not shown as zero (BRD AC-8, CR W-7). Today every hardware path resolves to `providerId: 'hardware_pending'`. |
| Recovery case resolved (IN-6) | Cut from v1 (CR §4, gate condition (a)). |

So the score service **does not call `resolveTrackingProfile` at all**, and it does not read `tracking_devices`, `lastLocation`, `locationSource` or `recovery_cases`.

**Discrepancy with CLAUDE.md (flag to `technical-writer`):** CLAUDE.md says no `claims.ts` exists. In fact `backend/src/routes/claims.ts` and `admin-claims.ts` both exist. That makes the AC-1/AC-5 separation in §9 a real, testable boundary, not a hypothetical one.

**Orphan component:** `ProtectionHealthCard` is exported but nothing renders it. No screen imports it. Reusing it means adding a new placement on the home screen, not changing an existing one.

---

## 1. Scoring rubric (v1)

All inputs are booleans or bands computed from fields that already exist. None of them is consent-gated, location-derived, value-weighted, claims-derived or sourced from a third party.

| Item id | BRD input | Source in code (exact field) | Done when | Points |
|---|---|---|---|---|
| `mfa` | IN-1 | Supabase verified TOTP factor (`findVerifiedTotpFactor`, the same call as `resolveMfaEnrolled` in `customer-profile.ts`) | verified factor exists | 20 |
| `profile_basics` | IN-2 | `customer_profiles.firstName`, `lastName`, `phone` | all three are non-blank after trim. **Presence only. Values are never returned or logged.** | 15 |
| `plan_active` | IN-3 | `policies.status` | at least one policy with `status === 'active'` (`past_due`, `suspended`, `pending_activation`, `cancelled` and `expired` all count as not done) | 25 |
| `asset_registered` | IN-5 | `assets` where `status === 'active'` | at least one exists | 20 |
| `identity_verified` | IN-7 | `customer_profiles.verificationStatus` | `=== 'verified'` **only** | 15 |
| `plan_tenure` | IN-4 | `policies.effectiveDate` of the earliest-effective **active** policy | 0–3 months: 0 · 3–12 months: 3 · 12+ months: 5 | 0 / 3 / 5 |

**Maximum: 100.** A brand-new customer can reach 95 through their own actions, which puts them in the top band. That meets CR §4 IN-4: tenure must not act as a de facto loyalty penalty.

**Rubric notes, each binding on the implementation:**

- **IN-2 deliberately does not reuse `computeProfileCompletion`/`completionPercent`.** That function counts `address` (residential city) and `emergency` (emergency contact name). CR §4 excludes both: address is address-derived and emergency contact is third-party PI (OB-12). It also counts `identity` as done at `pending_review`, which would break AC-7. The score gets its own pure function and the existing profile checklist is left alone.
- **IN-5 collapses to binary.** BRD §3 asks for "proportion of assets owned (self-reported asset count)". No self-reported count field exists. Also, `asset-validation.ts` makes an identifier mandatory for every asset type (`vin`, `imei` or `serialNumber` is `min(1)`), so every registered asset already has one and the proportion is always 100%. Binary is the honest version of this input. It is not weighted by count, value or type (CR §4 wealth-proxy rule).
- **IN-7 reads only `verificationStatus === 'verified'`.** The repository sets `verified` only through the admin decision path (`customer-profiles.ts`, the `pending_review` → decision transition guarded by `expectedRevision`). No client check can set it (AC-7, R05-3).
- **Tenure** is computed only while `plan_active` is done. With no active plan it shows as not done and has no `nextStep` prompt, because the customer can't speed up time. Its row text explains the band rather than urging an action.

**Bands.** These are labels for display only. They are never returned to any non-customer surface (§9).

| Points | `band` | Display label (draft; final copy is a `technical-writer` deliverable) |
|---|---|---|
| 0–49 | `getting_started` | "Getting started" |
| 50–84 | `well_set_up` | "Well set up" |
| 85–100 | `fully_set_up` | "Fully set up" |

The band labels contain no CR W-5 vocabulary. Per CR W-1, the UI is **checklist-first**. Whether the number is shown at all is a Stage 4 decision. The API returns it either way so the UI can choose.

**Configuration (AC-9).** Weights, band thresholds, tenure bands and all item copy live in one typed module, `backend/src/lib/protection-checklist-config.ts`, with a `configVersion` string. **This is a deviation from AC-9's "without a code deploy".** On Render a config change still needs a deploy. A Mongo-backed editable config would add a new admin write surface, which needs its own Stage 8, for a v1 that has six inputs. Recommendation: accept the deploy-gated config for v1 and record the deviation for `product-manager`. Change control follows CR §4: changing the input list needs a dated `compliance-specialist` sign-off in the commit, and weight-only changes are logged in the module's changelog header.

---

## 2. Server-side computation (not client)

The score is computed **only on the server**, in a pure function:

```
computeProtectionChecklist(input: ProtectionChecklistInput, now: Date, config): ProtectionChecklistView
```

- The input is a minimal projection of six booleans/dates. The function never receives the profile, policy or asset documents.
- Why the server: (1) IN-7 must come from the server-held `verificationStatus`, never from client state (AC-7). (2) MFA status needs the Supabase admin path. (3) It gives one reviewed copy source for CR §5 wording, which a test can lint. (4) Web and support surfaces can reuse it later with the same logic.
- The client renders exactly what the server returns. It does no arithmetic and has no fallback scoring.

---

## 3. Endpoint contract

`GET /api/v1/account/protection-checklist`

- **Router:** new `backend/src/routes/protection-checklist.ts`, mounted on the existing `v1` router in `backend/src/index.ts`.
- **Auth:** `createAuthenticateMiddleware(ctx.env, ctx.kv)`. The subject is **only** `req.auth.accountId`. No path params. Any query params are ignored, `accountId` included. That makes IDOR structurally impossible and a test asserts it (§7).
- **Rate limit:** `createRateLimiter(ctx.kv, DEFAULT_AUTHENTICATED_LIMIT, req => 'protection-checklist-get:' + req.auth.accountId)`, the same pattern as `profile-get`.
- **Headers:** `Cache-Control: private, no-store`.
- **Errors:** `401 UNAUTHORIZED` when there is no session or the account isn't found. Upstream failures go through `next(err)` and the standard error handler (`500`).
- **MFA lookup failure:** `resolveMfaEnrolled` already swallows errors to `false`. For the score, a failed lookup must **not** silently show "MFA not done", which could be a false claim to the customer. Instead the `mfa` item returns `done: null, unavailable: true` and is left out of `points`/`maxPoints` for that response.
- **No admin or support variant in v1.** BRD §4 allows a support view. That is a separate route with its own authz design and Stage 8, and it must never be mounted near the claims, recovery or security-partner surfaces (CR §3).

**Response `200`:**

```jsonc
{
  "configVersion": "2026-11-13.1",
  "points": 60,              // sum over items where done === true
  "maxPoints": 100,          // sum over items not marked unavailable
  "band": "well_set_up",     // getting_started | well_set_up | fully_set_up
  "doneCount": 4,
  "totalCount": 6,
  "disclosure": "This does not affect your premium, your cover or your claims.",  // CR W-2, verbatim
  "items": [
    {
      "id": "mfa",                         // mfa | profile_basics | plan_active | asset_registered | identity_verified | plan_tenure
      "title": "Two-factor sign-in",
      "benefit": "Keeps your account safer from someone signing in without you.",  // CR W-3: what it does FOR the customer
      "done": false,                        // true | false | null (null only when unavailable)
      "unavailable": false,
      "points": 0,
      "maxPoints": 20,
      "nextStep": {                         // null when done, unavailable, or plan_tenure
        "label": "Turn on two-factor sign-in",
        "action": "open_security_settings"  // closed enum of client route keys, never a URL
      }
    }
    // ...the other five items. IN-8 is never present (W-7)
  ]
}
```

- `action` is a closed enum: `open_security_settings | open_profile | open_plans | add_asset | open_verification`. The client maps each key to a route and **hides the CTA when the target surface is flag-gated off**. For example, `open_verification` is hidden when `FEATURE_KYC_ENABLED` is false, which is the case in preview and production today. The item still shows with its benefit sentence.
- **No PII in the response**, including the caller's own: no names, phone, email, ID, address, asset names, policy ids, dates or verification reasons. The only account-derived data is booleans, a points total and a band. Everything else is static copy.

---

## 4. Caching and performance (Render free plan)

- **Per request:** one `customer_profiles` read (projection of `firstName`, `lastName`, `phone`, `verificationStatus`), one policies query (projection of `status`, `effectiveDate`), one `assets` existence check (`limit 1`, `status: 'active'`), and two Supabase calls for MFA (mint a transient token, then list factors). Run the Mongo queries and the MFA lookup with `Promise.all`. The Supabase round-trips dominate the latency.
- **No server-side cache in v1.** CR §7 says compute on read with no history. An in-process cache on Render doesn't help much: free instances spin down, so it is cold after every idle period, and invalidating it on profile, MFA, policy or asset writes would mean coupling those routes to this feature. Revisit only if measured p95 is above 800 ms warm.
- **Cold starts:** the free plan spins down after idle, so the first request can take tens of seconds. The mobile client must (a) never block the home screen on this call, (b) render the card's skeleton or loading state, (c) time out after about 15 s to an error state that offers retry, with neutral copy and no "at risk" language, and (d) fetch in parallel with the existing home data, not chained after it.
- **Client cache:** in memory only, with a stale time of about 60 s, refetched on focus. **Never persisted** to AsyncStorage or SecureStore, so no score history accumulates on the device (CR §7).
- **Note for `cloud-infrastructure-architect`:** cold-start UX is a platform-wide free-plan issue, not specific to this feature.

---

## 5. Honesty and wording rules (binding)

1. **Feature flag:** add `FEATURE_PROTECTION_CHECKLIST_ENABLED = featureEnabled(process.env.EXPO_PUBLIC_FEATURE_PROTECTION_CHECKLIST)` to `mobile/src/config/features.ts`, as a **literal static member access** (the file's own Expo/Babel warning). Set `"false"` in the `eas.json` preview and production profiles, and add the key to `mobile/.env.example`. EAS builds fail closed if the key is unset (INC-002). It is still set explicitly so the intent is reviewable.
2. **Flags are not proof of state in distributed builds.** Until Stage 8 passes and someone has confirmed the flag value in the actual `eas.json` profile used to build, do not assume a distributed build hides or shows this surface. Local `expo start` and Jest default to **on**. Release notes and QA must check the profile, not the code default.
3. **The backend route has no flag.** It is read-only, returns only the caller's booleans and is harmless if the UI is off. If `cybersecurity-architect` wants it dark until Stage 8, gate the mount on an env var. That is a reviewer's call, recorded here as an open question.
4. **Copy is server-owned** and lives in one config module so that `compliance-specialist` and `technical-writer` review a single file. The draft strings in §3 are placeholders.
5. **CR §3 guardrail:** no copy may imply claim outcomes, pricing, discounts, rewards, cover eligibility, underwriting or risk. Permitted IN-3 style: "Your plan is active, so your registered devices are covered under it." Forbidden: "Verify your identity so your claim can be approved."
6. **CR W-5 forbidden terms** (risk, rating, insurable, eligible, qualify, approved, premium outside the disclosure, discount, reward, benefit tier) are enforced by a unit test over every config string (§7).
7. **The disclosure (W-2) renders on every render of the checklist** and cannot be dismissed. It is in the response body so the client can't drift from it.
8. **No comparison, ranking, percentile, streak, decay, countdown or fear copy** (W-4, W-6). Points drop only when a true state changes, such as a plan lapsing or MFA being removed.
9. **Reusing `ProtectionHealthCard`:** its existing strings "All systems operational" / "Needs your attention" / "N / M protected" and its tracking and alerts metrics are **not** part of this feature. Tracking metrics come from location data (forbidden input) and "protected" reads as cover. In checklist mode the card shows only the heading "Protection checklist", the items, the CTAs and the disclosure (§8).

---

## 6. Explicit non-goals

- Any link to pricing, premium, discount, billing, underwriting, renewal or claims (Ruling B, which needs a separate Stage 1).
- Ranking or gating any service, such as support priority, recovery dispatch or partner order (CR §2 trip-wires).
- Showing the score to admin-claims, recovery, security-company or partner surfaces, web or mobile.
- Support or admin views of the score (v1). The web customer dashboard (v1).
- Persisting scores, history, snapshots or trends. Analytics events or `product_events` about the score.
- IN-6 (recovery cases), IN-8 (hardware tracker), photo-based items, location or consent items.
- Push notifications or nudges driven by the score.
- Mongo-backed or admin-editable weights (see the §1 AC-9 deviation).

---

## 7. Test plan

**Backend unit (`protection-checklist.test.ts` next to the lib):**
- Each item is done or not done at its boundaries: blank or whitespace name, missing phone, each `PolicyStatus` value (only `active` passes), `verificationStatus` = `pending_review` → **not** done, `verified` → done.
- Tenure bands at 0, 89/90 days, 364/365 days and 12+ months. Tenure is 0 and has no `nextStep` when no plan is active. The earliest active policy wins.
- Maximum for a new customer = 95 → `fully_set_up`. All-false → 0 → `getting_started`. Band thresholds at 49/50 and 84/85.
- MFA unavailable → `done: null`, excluded from `maxPoints`, and the band is computed on the reduced max.
- No item with id `tracker`, `hardware`, `photo`, `location` or `recovery` can ever be emitted (whitelist assertion against the config).
- **Copy lint:** every string in the config is matched against the W-5 forbidden-term list (case-insensitive, word-boundary). The only exception is "premium" inside `disclosure`. The disclosure equals the CR W-2 text verbatim.
- `nextStep` is null whenever `done === true`.

**Backend route (`routes/protection-checklist.test.ts`, mirroring `assets.test.ts` fakes):**
- 401 with no session or an expired session.
- **IDOR:** authenticated as account A with `?accountId=B` → the response reflects A's data. Seed B with different state and assert no B-derived booleans leak.
- The response body has no keys outside the schema (strict snapshot of key sets) and no PII. Assert that seeded name, phone and email strings don't appear anywhere in the serialized body.
- Header `Cache-Control: private, no-store`. The rate limiter key is per account.
- Repository spies: the route does not call `recovery`, `trackingDevices`, `claims` or location repositories, and does not call `resolveTrackingProfile`.
- **AC-1/AC-5 static boundary test:** parse imports of `routes/claims.ts`, `routes/admin-claims.ts` and any billing or policy-billing module, and assert none imports `protection-checklist*`. The reverse direction is checked too.

**Mobile (`mobile` Jest, existing `@testing-library/react-native` setup):**
- `ProtectionHealthCard` in checklist mode renders the title, every item, its benefit sentence and the disclosure. Disclosure is present in loading-done, all-done and none-done states.
- There is no dismiss control for the disclosure.
- A done item has no CTA. The `open_verification` CTA is hidden when `FEATURE_KYC_ENABLED` is false (mock the config module).
- The legacy-mode props render unchanged, as a regression check for the existing (unused) card API.
- `ProtectionHomeScreen` doesn't mount the card when `FEATURE_PROTECTION_CHECKLIST_ENABLED` is false. Home content still renders while the checklist request is pending or has failed. The error state shows retry with neutral copy.
- The API client hits `/api/v1/account/protection-checklist` and has no persistence call. Spy AsyncStorage and assert no writes.

---

## 8. Mobile reuse of `ProtectionHealthCard`

Extend the existing component. **Do not create a new one.** Make its props a discriminated union:

```ts
type ProtectionHealthCardProps =
  | ({ mode?: 'status' } & ExistingProps)               // unchanged legacy shape
  | { mode: 'checklist'; checklist: ProtectionChecklistView; onAction: (a: ChecklistAction) => void; isActionAvailable: (a: ChecklistAction) => boolean };
```

Checklist mode reuses `Card`, `Badge`, `Metric`-row styling and theme tokens. It adds no new primitive. `design-system-manager` must confirm this counts as reuse and not a one-off component (house rule). `ui-designer` owns the visual treatment at Stage 4.

---

## 9. Stage 8 security checklist (for `cybersecurity-architect` / `compliance-specialist`)

- [ ] The route derives the subject only from `req.auth.accountId`. There are no path or query identifiers, and the IDOR test exists and passes.
- [ ] The response matches the §3 schema exactly, with no PII. Not even the caller's own name, phone or email is returned.
- [ ] Inputs match CR §4 exactly: `mfa`, `profile_basics` (name and phone presence only), `plan_active`, `asset_registered`, `identity_verified` (`verified` only), `plan_tenure`. There is **no** read of `lastLocation`, `locationSource`, `tracking_devices`, `recovery_cases`, `photos`, `estimatedValue`, `assetType`, `dateOfBirth`, address, emergency contact, `billing.*` or `product_events`.
- [ ] IN-8 and IN-6 are absent from the code and the config, not just hidden.
- [ ] AC-1/AC-5: there is no import or data path between the score modules and `claims.ts`, `admin-claims.ts` or any billing code, in either direction. The score is not stored on policy, asset, claim or profile documents and is not in any claim audit entry.
- [ ] The score is not mounted or rendered in admin, security-company, recovery or partner surfaces (web `src/admin/`, `src/security/`, mobile `(security-app)/`).
- [ ] No persistence: no collection, no KV key, no server cache, no client AsyncStorage. Nothing to erase under 015 D-15.
- [ ] Logs: the route doesn't log item states or points. The request log has only the standard fields.
- [ ] `Cache-Control: private, no-store`. A per-account rate limit is applied.
- [ ] The MFA lookup uses the existing transient-token path. Failure degrades to `unavailable` and is never reported as "not done".
- [ ] The copy lint test passes. The disclosure is verbatim CR W-2 and renders on every render without being dismissible. `compliance-specialist` has reviewed the final strings.
- [ ] The mobile flag is set `"false"` in the preview and production `eas.json` profiles. The static `process.env` access is in place.
- [ ] Prerequisites from CR §8: the PIA has been signed by the Client's Information Officer, the s18 privacy notice has been updated with this purpose, and the CT-4d Register A instruction is recorded.
- [ ] Open question for the reviewer: should the backend mount be env-gated until sign-off (§5.3)?

---

## 10. Implementation plan

Each task is small, independently testable and lands with its own tests. Backend tasks B1–B4 can merge before Stage 8 with the UI flag off. Nothing ships to a distributed build until Stage 8 and Stage 10 pass.

**backend-engineer**

1. **B1. Config module.** Create `backend/src/lib/protection-checklist-config.ts` with item ids, weights, tenure bands, band thresholds, draft copy, the disclosure, the `action` enum, `configVersion` and a changelog header. *Test:* whitelist assertion and copy-lint test.
2. **B2. Pure rubric.** Create `backend/src/lib/protection-checklist.ts` with `computeProtectionChecklist(input, now, config)`. It has no I/O and no imports from repositories, routes, claims or billing. *Test:* all the unit cases in §7.
3. **B3. Shared MFA lookup.** Move `resolveMfaEnrolled` from `customer-profile.ts` into `backend/src/lib/mfa-enrollment.ts` as a variant that returns `true | false | 'unavailable'`. Keep `customer-profile.ts` behaviour identical by mapping `unavailable` to `false` there. *Test:* the existing customer-profile tests stay green, plus a unit test for the new variant.
4. **B4. Minimal projections.** Add repository reads `customerProfiles.getChecklistFields(accountId)`, `policies.listStatusAndEffectiveDate(accountId)` and `assets.hasActive(accountId)` (limit 1). They project only the fields in §1. *Test:* repository tests assert the projected keys.
5. **B5. Route.** Create `backend/src/routes/protection-checklist.ts` (auth, rate limit, `Promise.all`, `no-store`) and mount it on `v1` in `index.ts`. *Test:* the §7 route tests (401, IDOR, schema/PII, header, repository spies).
6. **B6. Boundary test.** Add the static import-graph test for AC-1/AC-5 against `claims.ts`, `admin-claims.ts` and billing modules. *Test:* the test itself, which fails if anyone adds a cross-import.
7. **B7. Contract doc.** Add the endpoint to the backend API docs wherever the existing v1 routes are documented. New section only, append-only.

**mobile-engineer**

8. **M1. Flag.** Add `FEATURE_PROTECTION_CHECKLIST_ENABLED` to `mobile/src/config/features.ts` with a static env access, set `"false"` in the `eas.json` preview and production profiles, and add the key to `.env.example`. *Test:* a flag unit test, as in existing flag tests, if present.
9. **M2. API client and types.** Add `ProtectionChecklistView` types and a `getProtectionChecklist()` call to `/api/v1/account/protection-checklist` in the existing `mobile/src/api` client. Cache in memory only. *Test:* client test plus an assertion that nothing is written to AsyncStorage.
10. **M3. Card checklist mode.** Extend `ProtectionHealthCard` with the §8 discriminated union. The legacy mode is untouched. *Test:* the §7 card tests (disclosure always present, no dismiss, done items have no CTA, legacy regression).
11. **M4. Action mapping.** Map the `action` enum to Expo Router routes, with `isActionAvailable` checking `FEATURE_KYC_ENABLED` and others. *Test:* unit test for each key, including that the KYC CTA is hidden when the flag is off.
12. **M5. Home placement.** Render the card in checklist mode on `ProtectionHomeScreen` behind the flag. The fetch runs in parallel and doesn't block. Add the loading, cold-start-timeout and retry states. *Test:* the §7 home-screen tests (flag off → absent; pending or failed → home still renders).

**Before any distributed build:** CR §8 prerequisites (PIA, privacy notice, Register A), Stage 4 copy sign-off by `compliance-specialist`, `ux-researcher` and `technical-writer`, `design-system-manager` confirmation on §8, the Stage 8 checklist (§9), then Stage 10 QA, including a copy spot-check against shipped strings (BRD AC-6).
