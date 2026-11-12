# Backlog: next work items needing no client decision and no vendor (2026-11-12)

Author: product-manager (acting for cto). Not a ratified roadmap; sequencing for cto/TPM review.
Basis: code grep of mobile/ (DraggableAssistFab, config/features, DEPLOY.md), Feature 018
pre-launch-blockers.md, and the `Status:` lines of features 010-017 and 020 business-requirements.md.
Those lines read "Draft" for 010-017 and 020, but they may be stale. Each item's "ready" column
assumes the doc status was re-verified against code first.

Out of scope here: payment gateway, GPS hardware vendor, security-partner agreement, and the
018 business/legal blockers (ceiling number, Ombud values, legal copy). Those are owner-held.

| # | Item | Value | Owner roles | Eng-ready now | Size | Gate |
|---|------|-------|-------------|---------------|------|------|
| 1 | Remove or gate the dead "Protection assistant" FAB. It is `mobile/src/navigation/DraggableAssistFab.tsx`, mounted in `mobile/app/(app)/(tabs)/_layout.tsx`, and shows an Alert saying "coming soon" with nothing behind it. Add a build-time flag (default off, same pattern as `mobile/src/config/features.ts`) so it is hidden and not just reworded. Update tests. | Removes an honest-state defect and a broken-promise tap target from every demo and build. | mobile-engineer; design-system-manager (sign-off on removal); product-manager | Yes | S | No Stage 8 (no data). Honesty rule applies (doc standards 07). |
| 2 | First-login perceived speed (mobile). Show a branded splash or skeleton and "Waking up the server..." copy during the cold-start window. Fire a non-blocking warm-up `GET /health` at app launch, before the login screen is submitted. Set a longer login timeout with one automatic retry. Cache last-known policy/assets for instant paint (stale-while-revalidate). | The Render free-plan cold start makes the first login look broken. This is the largest perceived-quality gap. | mobile-engineer; backend-engineer (confirm a cheap unauthenticated health route); ux-researcher (copy) | Yes | M | Stage 8 light: the cache must hold no tokens or PII beyond secure-store policy. Security-engineer to review. |
| 3 | Backend cold-start mitigation within the current plan. Add a scheduled external ping (free uptime pinger) during demo windows, trim startup work (lazy DB connections, defer seeding), and measure the cold-start time budget. A paid always-on instance is an owner cost decision, so list it as an option and do not assume it. | Cuts first-request latency without changing the vendor. | devops-engineer; backend-engineer | Yes | S | No Stage 8. The pinger must hit only a public, data-free route. |
| 4 | Demo APK realism with the forbidden flags left OFF. Add a clearly labelled "Demo data" seed for the demo account: a few registered assets with categories and values, a realistic protection-centre home, notification preferences, and plan-tier display. Use the existing self-device phone location (Feature 008 Phase 1, already built) on the demo phone asset. Keep the claims, hardware-tracking and theft-reporting flags unchanged. Add a demo-script one-pager in `mobile/docs/`. | Gives a convincing walkthrough using only real, honest, already-built paths. | mobile-engineer; backend-engineer (seed script with production guard, as with seed-test-accounts); technical-writer | Yes | M | The seed must be blocked in production (existing guard pattern). No real PII in the seed. |
| 5 | Feature 009 usability test (5 participants) plus the real-device QA checklist. Unrun for lack of anyone to run it, though no vendor is needed. Recruit 5 people, run a moderated session on the demo APK, and file findings. | Closes the evidence gap noted in the 009 README line 51. Feeds the polish backlog. | ux-researcher; manual-qa-engineer; product-manager | Yes (needs item 4 first) | M | POPIA: consent form, and no real customer data in the sessions. |
| 6 | Claims engineering remainder (018 items 6a-6c: CR-018-10 placeholder guard, CR-018-11 `OTHER` reason of at least 100 characters, CR-018-12 ClaimDetailScreen decision-notice display). It is engineering-only and does not depend on the owner values. | Moves 018 toward "flip the switch" the day legal items close. | backend-engineer; mobile-engineer; ui-designer | Yes | M | Stage 8 re-check of delta (security-engineer) and Stage 10 QA. Compliance-specialist sign-off on CR-018-12. |
| 7 | Staging environment on Render (a second service with its own env, Supabase branch or project, and Mongo database). Let the demo APK point at staging so demos stop touching production data. | Safe demo and test loop. Prerequisite for realistic Stage 10 testing. | devops-engineer; cloud-infrastructure-architect; security-engineer | Yes, per ADR-0003 | M | Stage 8: secrets separation, with no production data copied. |
| 8 | Feature 015 account deletion (in-app, POPIA right to erasure). Replaces the mailto stub. Confirm current state against code and any existing 015 Stage 2+ docs first. | A POPIA obligation and a store-review expectation. Needed before real customers. | product-manager; backend-engineer; mobile-engineer; compliance-specialist | Needs Stage 2-7 confirmation. Requirements exist (Draft). | L | Stage 8 hard gate, POPIA (erasure vs retention of claims and insurance records, to be ruled by compliance-specialist). |
| 9 | Feature 020 protection score (the doc says ready for Stage 2). Derived from existing data only: registered assets, photos present or not, tracker status, profile completeness. A score with next-step prompts. | A retention and engagement driver, and a customer-visible value story beyond "coming soon". | product-manager; solution-architect; backend-engineer; mobile-engineer | Stage 2-3 first, then yes | M | POPIA: profiling and transparency review by compliance-specialist. Stage 8. It must not imply claim outcomes (insurance vs subscription rule). |
| 10 | Replace "coming soon" dead ends with honest status copy and hide what has no path. These are `account/profile.tsx`, installation-guide, activate-tracker and device-health, plus the AssetPhotoSlots copy. Where a screen is flag-gated and unreachable, drop it from navigation. | The app reads as finished and honest. Low cost. | mobile-engineer; ux-researcher; design-system-manager | Yes | S | No Stage 8. Honesty rule. |

## Suggested order
1, 2, 3 (in parallel; same week), then 4, 7, 6, 5, 10, then 8 and 9 once Stage 2 intake is done.

## Deferred (all needing a vendor, partner or client decision)
Features 010, 011, 012, 013, 014, 016 and 017 remain at Draft per their own requirements docs and are
not ranked here. 013 and 016 depend on the KYC/ID-verification vendor. 011 and 010 depend on SAPS or
partner and operational staffing. 012 and 014 need scope ratification. A chatbot or AI assistant is
excluded: it needs a model/vendor decision and a compliance review, and nothing exists to build on
(item 1 removes the placeholder).

## Open items for cto
- Confirm Render paid always-on is an owner cost decision (item 3).
- Re-verify the 010-017 statuses in code, since the Draft markers may be older than the build.
