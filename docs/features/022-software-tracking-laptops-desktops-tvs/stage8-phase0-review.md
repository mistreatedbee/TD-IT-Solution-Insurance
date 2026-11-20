# Feature 022 Phase 0 — Stage 8 light security review (PR #35)

- **Reviewer:** security-engineer
- **Date:** 2026-11-20
- **Scope:** branch `fix/mobile-no-gps-device-copy` (commits `26269db`, `331eb23`), reviewed as `git diff origin/main...HEAD` (21 files, +327/-39). Requested by `cto` as a light review because the change is copy and UI only.
- **Verdict:** **CONCUR — no security impact. Clear to merge from a security standpoint.** This review does not cover the Feature 022 desktop/TV software agent. That agent is not built and needs its own full Stage 8 review.

## 1. What changed

| Area | Change |
|---|---|
| `backend/src/lib/tracking-profile.ts:41-112` | New `SOFTWARE_TRACKED_NOUN` early return for laptop, desktop, tv and tablet. It returns `providerId: 'hardware_pending'` (unchanged contract), `PENDING_HARDWARE_CAPABILITIES`, `device: null`, `telemetry: null`, and new label/status copy only. |
| `mobile/src/tracking/trackingMethod.ts` (new) | A pure function that maps asset type to `this_app`, `our_software` or `gps_hardware`. Unknown or missing types fall back to `gps_hardware`, which is the earlier behaviour. |
| `mobile/src/location/LocationConsentModal.tsx:122` | The "Other assets" paragraph now says laptops, computers, TVs and tablets are not tracked today and that a future app will ask for its own permission. |
| Mobile and web screens | Activation and installation-guide buttons are hidden for non-GPS types. Labels and copy are updated. |

## 2. Checks

1. **API change: none.** No route, schema, query, middleware or response shape changed. `providerId` stays `'hardware_pending'`. The capabilities object is the same pending constant, so nothing new is unlocked. The tracking-profile route still has the same authN and object-level authZ.
2. **Linked devices are not hidden.** The new branch runs *after* `if (device)` (`tracking-profile.ts:69`). A laptop that already has a linked tracking device still returns its real device and status. The mobile guards are `!usesGpsHardware && !linkedDevice` (`AssetDetailScreen.tsx:511`) and `!device && assetType && !usesGpsHardware` (`DeviceHealthScreen.tsx:82`), so they only take effect when no device exists.
3. **Does hiding the buttons remove a security control? No.** Device activation and the installation guide are features. They are not controls. All server-side enforcement in `tracking-devices.ts` (auth, ownership, rate limits) is unchanged and does not depend on the client. The buttons are now hidden more often, never shown more often, so the client exposes no new path.
4. **Does the copy mislead about what is collected? No. It is more accurate.** The new consent text says nothing is collected from laptops, computers, TVs or tablets today, and that matches the code (no agent exists). It keeps the existing truthful sentences: the setting only affects this phone, and last-known locations already held for other assets stay visible. The copy never says unbuilt software works ("coming soon" throughout). The consent modal still asks only for this phone's location, so the scope of consent is unchanged. Compliance owns the wording, and this review takes no position on the legal sufficiency of the text.
5. **Secrets and logging:** none added.

## 3. Notes (non-blocking)

- **N-1 (Info):** `providerId: 'hardware_pending'` now also means "our software, coming soon". When Feature 022 ships the agent, it should get its own provider id rather than overloading this one. This is a design note for `backend-architect`.
- **N-2 (Info):** `origin/main` already has `docs/features/022-software-tracking-laptops-desktops-tvs/README.md`, and this branch is behind it. A two-dot diff against main therefore shows that README as deleted. Rebase or merge main before merging so the README is not treated as removed.
- **N-3 (Future gate):** the consent sentence "it will ask for its own permission" is a commitment. The Feature 022 agent's Stage 8 review must verify that it has a separate consent flow.
