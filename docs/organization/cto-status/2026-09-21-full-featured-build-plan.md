# Full-featured Play Store build plan — 2026-09-21

**Status: decision recorded, build not yet produced.** Owner directed that the Play Store
Data Safety declaration should describe the real end product, not the minimal-scope
`playInternal` test build already uploaded today — and that a matching full-featured build
must be produced before this is actually rolled out to testers/production.

## Decision

Data Safety form is being filled out assuming the following feature flags are **on**:

| Flag | Backend exists? | Include in next build? |
|---|---|---|
| `EXPO_PUBLIC_FEATURE_LOCATION_TRACKING` | Yes — `backend/src/routes/asset-location.ts`, `tracking-devices.ts` | **Yes** |
| `EXPO_PUBLIC_FEATURE_ALERTS` | Yes — `backend/src/routes/alerts.ts` | **Yes** |
| `EXPO_PUBLIC_FEATURE_THEFT_REPORTING` | Yes — `backend/src/routes/recovery.ts` | **Yes** |
| `EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING` | Yes — `backend/src/routes/tracking-devices.ts` | **Yes** |
| `EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR` | Yes — `backend/src/routes/security-cases.ts` | **Yes** |
| `EXPO_PUBLIC_FEATURE_CLAIMS` | **No backend route exists at all** (`backend/src/routes/claims.ts` does not exist; mobile screens at `app/(app)/claims/` are UI-only stubs) | **No — would 404 for real users** |
| `EXPO_PUBLIC_FEATURE_KYC` | Partial — `admin-verification.ts` review-queue exists, but document-upload is a confirmed hard blocker (no object storage, no KMS/encryption-at-rest anywhere in repo — see `docs/organization/kyc-identity-verification-security-architecture.md`) and Tier 1 data-only verification isn't built yet either (see `docs/features/016-kyc-identity-verification/product-scope-decision.md`) | **No — nothing safe to ship yet** |

## Data Safety declaration basis

The Play Console Data Safety form is being answered to match this planned full-featured
build (location, alerts, theft-reporting, hardware-tracking, security-operator all on),
**not** the already-uploaded minimal `playInternal` build. Location is declared collected
and shared (with security-company partners, via the recovery/security-cases flow) —
Optional, not Required, since not every customer attaches GPS hardware to a registered
asset.

**Consequence that must not be skipped:** the Data Safety answers now describe a build
that does not exist yet. Before this test round is actually rolled out to real testers (or
promoted beyond a private draft), a new `eas build` must be produced with the flags above,
and the uploaded binary must match what this form declares — an unmatched
declaration-vs-binary is a real Play policy risk, not just a technicality (see prior
discussion this session on why the original minimal build couldn't declare location).

Claims and KYC stay off in this next build too — their backend/infrastructure gaps are
real, independently discovered work items already tracked elsewhere
(`CLAUDE.md` "Not built" list; `docs/features/016-kyc-identity-verification/`), not a
scope choice being reconsidered here.

## Next action

A new EAS build profile (or an edit to `playInternal`) needs `EXPO_PUBLIC_FEATURE_CLAIMS`
and `EXPO_PUBLIC_FEATURE_KYC` left `false`, and the other five flags above flipped to
`true`, then rebuilt and re-uploaded before this Data Safety form's answers are accurate
against a real artifact. Not yet done as of this note.
