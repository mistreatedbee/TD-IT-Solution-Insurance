# Build #2 — Release Notes (Draft)

**Status:** Draft for `product-manager` review (sprint 2.2)  
**Audience:** Client stakeholders evaluating the internal preview build  
**Owner:** `technical-writer`  
**Date:** 2026-08-28

Per Release Gate A roadmap §2 and CTO memo §7 — honest scope only. No launch date. Not "production-ready."

---

## What this build includes

- **Authentication** — signup, login, and MFA where enrolled, against the live API.
- **Policies** — create and view policies on the mobile app.
- **Assets** — register and view assets (all eight supported asset types). Photo upload is not included.
- **Notifications** — notification preference screen (push token registration where device permits).
- **Account** — basic account hub (email display, logout, plan link). Identity verification (KYC) is not enabled in this build.
- **Admin dashboard** (web) — existing admin panel at `/admin/*`.
- **Security-company partner dashboard** (web) — existing operator surface at `/security/*`.
- **Self-device location tracking** — design and architecture are documented; **no location capture or map features are enabled** in this client build (gated off per INC-001 containment).

## What this build does not include

Do not expect the following in this preview:

- **Payments or subscriptions** — billing is not configured; onboarding may end at pending activation.
- **Claims** — no claims backend; claims UI is hidden behind a build flag.
- **GPS tracker hardware** — no vendor integration; hardware activation flows are gated off.
- **Live recovery dispatch** — theft reporting and live tracking surfaces are gated off.
- **Alerts feed** — alerts tab and API hooks are gated off in this build.
- **Security-operator mobile portal** — gated off in customer builds.
- **Production-ready framing** — this is an internal evaluation build, not a public store release.

## Known gates before wider distribution

Release Gate A criteria still open at time of this draft:

1. Signing identity / bundle ID confirmation (owner)
2. Verified email delivery on fresh signup (owner / Resend)
3. Manual QA pass on physical device
4. Criterion 6 — bundle verification that no Stage-8-bypassed surface is reachable (`security-engineer` + `cybersecurity-architect`)

## Distribution

Internal preview channel only (EAS `preview` profile). Not submitted to public app stores.
