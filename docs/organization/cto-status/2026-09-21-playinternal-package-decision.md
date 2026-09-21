# playInternal Android package — owner decision, 2026-09-21

**Status: decided by owner, recorded here. Not yet reconciled with T-01.**

## What happened

While creating the Google Play Console app entry for internal testing, the owner typed
`co.za.tditsolution.insurance` (singular "tditsolution") as the Android package name.
Google Play binds the applicationId at app-entry creation, not merely at first upload, so
this is now permanent for this Play Console app entry regardless of what gets uploaded to
it.

This does **not** match:
- `mobile/app.json`'s `expo.android.package` (`co.za.tditsolutions.insurance`, plural) —
  the still-unconfirmed production placeholder tracked under T-01.
- `mobile/app.json`'s `expo.ios.bundleIdentifier` (also plural).
- `src/lib/mobileAppLinks.ts`, `mobile/README.md`, `mobile/docs/DEPLOY.md`, the sprint
  plan, and the roadmap — all plural.

When offered the option to delete this draft app entry (no release had been uploaded yet,
so it was still freely deletable) and recreate it with the correct spelling, **the owner
explicitly declined and directed keeping it as-is**: "just fix it here, its fine the way it
is on Google playstore."

## What was changed

`mobile/app.config.ts` now special-cases the `playInternal` EAS build profile: instead of
the generic `.internal`-suffix pattern used by other preview/test profiles, it hardcodes
the Android package to the literal string `co.za.tditsolution.insurance` so the uploaded
AAB matches what Play Console already has bound. This is scoped **only** to the
`playInternal` profile — `app.json`'s production value, the iOS bundle ID, and all other
build profiles are unchanged.

## Open question this creates for T-01

T-01 (`docs/organization/cto-status/2026-09-14-task-assignment.md`) is "bundle ID
`co.za.tditsolutions.insurance` confirmation" — owner sign-off on the **production**
identifier, still BLOCKED-OWNER as of the last status check. This decision is scoped to
the `playInternal` **test** track only and does not resolve T-01. But it does raise a real
question that should go back to the owner explicitly, not be assumed either way:

- Is `co.za.tditsolution.insurance` (singular) now also intended as the real production
  Android package, superseding the plural placeholder everywhere else in the repo? If so,
  T-01 should close with *this* spelling, and the iOS bundle ID / rest of the repo need to
  be reconciled to match (or deliberately diverge, which is unusual but not impossible).
- Or does production still get its own, separately-confirmed package name later, leaving
  this playInternal test track permanently on a one-off spelling that only exists for
  Google Play Console history and is never reused?

**Do not assume either answer.** Whoever picks up T-01 next should ask the owner this
specific question rather than silently converging the spelling one way or the other.
