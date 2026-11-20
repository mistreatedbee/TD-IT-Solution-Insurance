# Feature 023 — Pre-launch blockers (before real users)

Append-only shared document. Each section is dated and attributed.

## 2026-11-20 — filed by backend-engineer after the KYC Phase A Stage 8 review

Sources: [`security-review.md`](security-review.md) (cybersecurity-architect, PASS for owner-test only) and [`stage8-existing-kyc-review.md`](stage8-existing-kyc-review.md) (security-engineer). The PASS covers the owner-test build only. Every item below is a **hard blocker** before real customer data reaches the KYC surface. This includes turning `FEATURE_KYC_ENABLED` on for real users, or enabling `KYC_CLAIM_GATE_ENABLED` anywhere.

| # | Blocker | Owner | Location / note |
|---|---|---|---|
| 1 | **KYC-3 ruling.** `verified` is self-asserted: name, DOB, address and ID last 4, with no document or third-party check. Until the ruling lands, **keep `KYC_CLAIM_GATE_ENABLED` off** and do not treat `verified` as proof of identity anywhere. The ruling decides whether to rename the status or wait for Feature 023 document checks. | cybersecurity-architect + compliance-specialist | `claims.ts` claim gate keys off `verificationStatus` |
| 2 | **KYC-6.** Give reviewers a fixed list of reasons, plus an optional short note. Refuse links/URLs in reviewer free text. | backend-engineer + frontend-engineer | `sync-account-alerts.ts`, `domain-email-templates.ts` (decision email) |
| 3 | **K42-1.** A note write is audited as the generic `privileged_data_access` with no note id. Use a distinct event type (for example `customer_verification_note_created`, which needs a Postgres migration). Generate the ObjectId before the insert so the audit row can carry it. | backend-engineer + database-architect | `backend/src/routes/admin-verification.ts:506` |
| 4 | **K42-2.** Nothing technical stops a full ID number being typed into a note; the rule is policy only. Reject 13-digit SA ID patterns and long digit runs in the note schema, and add a UI hint. | backend-engineer | `backend/src/routes/admin-verification.ts:22` |
| 5 | **KYC-7 / KYC-8 re-check.** KYC-7: date of birth accepts any date. KYC-8: submit has no state guard. Neither was re-checked in the Phase A review. | security-engineer | `customer-profile-validation.ts`, `customer-profiles.ts` `submitVerification` |
| 6 | **Sign-off.** security-engineer and compliance-specialist must concur with the Phase A review. | security-engineer, compliance-specialist | |
| 7 | **Full Stage 8.** The `waived-no-security-review-performed` entries in `docs/organization/gates/stage8-manifest.json` are waivers, not reviews. A full Stage 8 of the whole verification surface is still owed (F009-1). Stage 10 QA follows it. | cybersecurity-architect | `backend-admin-verification-history`, `backend-admin-verification-notes`, `backend-customer-profile`, `web-admin-verification` |

Non-blocking follow-ups from the same review: K42-3 (add `collMod` if the notes schema ever changes) and K42-4 (make `syncAccountAlerts` non-blocking after a decision).
