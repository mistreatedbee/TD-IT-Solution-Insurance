# Feature 023 — Security review (Stage 8)

Append-only shared document. Each section is dated and attributed. Do not rewrite another role's section.

## Stage 8 review — KYC Phase A (2026-11-20, cybersecurity-architect): PASS for owner-test

Scope: PR #42 (branch `feat/kyc-phase-a-owner-test`). This verdict covers the **owner-test build only**. It is not clearance for real users; see [`pre-launch-blockers.md`](pre-launch-blockers.md).

Earlier review of the existing KYC surface (security-engineer, findings KYC-1 to KYC-8): [`stage8-existing-kyc-review.md`](stage8-existing-kyc-review.md) (on `main`). The "Prior findings" table below re-checks those findings against PR #42.

Filed by backend-engineer from cybersecurity-architect's review text (`stage8-41-42.md`, the PR #42 section and its "Remaining before real users" list), copied verbatim below except that headings are moved down one level.

### PR #42: KYC Phase A. Verdict: PASS (owner-test)

Prior findings (`scratchpad/stage8-kyc-review.md`) checked against the code:

| Prior | Status | Evidence |
|---|---|---|
| KYC-1 audit before save | **Fixed.** A state and revision pre-check runs first, then both audit rows are written, then the decision is applied. The decision write still checks the revision atomically. The remaining race over-logs an attempt, which is the safe direction. | `admin-verification.ts:284-332` |
| KYC-2 customer-only routes and server switch | **Fixed.** Every `/account/profile*` route has `requireUserType('customer')`. `kycApiEnabled` is fail-closed: only `'true'` turns it on, and anything else logs a warning and stays off (`config/env.ts:588-596`). The switch runs before authentication on submit and on every verification-workflow admin route, and returns 404 when off. `render.yaml:60` sets `sync:false`. | `customer-profile.ts:56,86,181-190`; `admin-verification.ts:65-71,75,135,235,396,474` |
| KYC-3 self-asserted "verified" | **Open (design). Escalation stands.** It now matters more: `KYC_CLAIM_GATE_ENABLED` makes the status an input to the claim-filing gate. | `claims.ts:116-122` |
| KYC-4 emergency phone | **Fixed.** Admin payloads show only the last 4 digits. | `admin-verification.ts:42-56` |
| KYC-5 non-customer detail | **Fixed.** Non-customer accounts get 404. | `admin-verification.ts:186-190` |
| KYC-6 free-text customer reason | **Open (Low).** The email escapes the reason and the push carries none. Phishing text from an admin is still possible. | `domain-email-templates.ts:370`; `verification-notification-service.ts:53` |
| KYC-7, KYC-8 | Not re-checked here. | |

New surfaces checked:
- **Claim gate:** customer-only. It applies only when the env value is exactly `true`. Theft and recovery reports are not gated (`recovery.ts`). PASS.
- **Decision notifications:** these run in the background after the decision commits, so a delivery failure never undoes a decision.
  - Each message goes only to the subject's own customer account, re-checked in the service (`:39`).
  - Email and push preferences are respected.
  - The email carries the escaped customer-safe reason only. `escapeHtml` covers `& < > "`, and every interpolation sits in text or a double-quoted attribute.
  - Push uses fixed templates with no reason text.
  - No note text, reviewer identity or ID details are sent. PASS.
- **Decision history:**
  - Admin-only, kill-switched, customer subject only.
  - Bounded to 50 rows. The SQL is parameterised (`audit-log.ts:296-309`).
  - Audited before serialisation (`admin-verification.ts:439`).
  - Staff emails are shown to admins only. PASS.
- **Internal notes:**
  - Admin-only, kill-switched, customer subject only.
  - Limited to 1-2000 characters, both in Zod (`:22-24`) and in the Mongo `$jsonSchema` (`customer-verification-note-collections.ts:21`).
  - Rate-limited to 30 per 15 minutes.
  - The audit row is written before the insert, and the note text is never put in the audit log.
  - Only `admin-verification.ts`, `context.ts` and the repository reference the collection, so no customer route can read it. `verification-notes-isolation.test.ts` exists, but I did not run it.
  - The admin page renders notes as a React text node (`src/admin/pages/AdminVerificationPages.tsx:187`), so there is no stored XSS. PASS.

New findings (none blocks owner-test):

| ID | Sev | Location | Finding | Remediation |
|---|---|---|---|---|
| K42-1 | Low | `admin-verification.ts:506-514` | A note write is audited as the generic `privileged_data_access` with no note ID, so the trail cannot tell writing a note apart from reading one. | Use a distinct event type, for example `customer_verification_note_created`. Generate the ObjectId before the insert so the audit row can carry the note ID. |
| K42-2 | Low (POPIA) | `admin-verification.ts:22-24` | Notes are free text, and "no ID numbers or document content" is policy only, with no technical control. | Reject 13-digit SA ID patterns (and long digit runs) in the note schema, and add a UI hint. |
| K42-3 | Info | `customer-verification-note-collections.ts:36-42` | The validator is applied only when the collection is created, with no `collMod` for an existing collection. | Acceptable while the collection is new. Add `collMod` if the schema ever changes. |
| K42-4 | Info | `admin-verification.ts:334` | If `syncAccountAlerts` throws after the decision commits, the admin gets a 500 and a retry returns 409. This is a UX problem, not a security one. | Make it non-blocking, like the notifications. |

### Remaining before real users
1. **KYC-3 ruling** (cybersecurity-architect and compliance-specialist). Until it lands:
   - Leave `KYC_CLAIM_GATE_ENABLED` off.
   - Do not treat `verified` as proof of identity anywhere.
   - Rename it or wait for Feature 023 document checks.
2. **KYC-6:** offer reviewers a set list of reasons, and refuse URLs in the free-text note.
3. **K42-1** (separate audit event for notes) and **K42-2** (block ID-number patterns in notes).
4. **Re-check KYC-7 and KYC-8, and run the test suites.** That includes the notes-isolation and audit-fail tests.
5. **Sign-off:** security-engineer and compliance-specialist concurrence. Record the manifest entries for both PRs.
