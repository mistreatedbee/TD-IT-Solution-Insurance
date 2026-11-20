# Feature 023 — Customer verification: full information and documents

**Author:** `business-analyst`
**Date:** 2026-11-20
**Stage:** 1 (business requirements draft). Not scoped, not built.
**Owner request (2026-11-20):** "I want the client to be able to upload all the information needed
for them to be approved, and the admin should be able to see all this information and be able to
approve or decline the user."

This feature builds on Feature 009 Phase 2 (profile + manual review) and Feature 013 (SA ID
verification). It must not contradict
[`../013-sa-id-verification/compliance-review-kyc-identity-documents.md`](../013-sa-id-verification/compliance-review-kyc-identity-documents.md).
Where the owner's request and that review disagree, this document says so. It does not overrule it.

---

## 1. What exists today (checked in code, 2026-11-20)

### 1.1 Backend

| What | Where |
|---|---|
| Customer reads and edits their profile: first, middle, last name, date of birth, phone, last 4 digits of the ID number, residential address, emergency contact | `GET/PATCH /v1/account/profile` in `backend/src/routes/customer-profile.ts` |
| Customer submits for review. Submit fails unless name, phone, address city and ID last 4 are filled in | `POST /v1/account/profile/verification/submit`; checks in `backend/src/repositories/customer-profiles.ts` `submitVerification` |
| Profile is locked while it is in review | `ProfileVerificationLockedError` -> 409 |
| Profile picture upload (JPEG/PNG/WebP, max 512 KB, stored as bytes in MongoDB) | `PUT/GET/DELETE /v1/account/profile/picture` |
| Status values: `not_started`, `in_progress`, `pending_review`, `verified`, `rejected`, `action_required` | `customer-profiles.ts` |
| Admin queue (only `pending_review`), queue count, single profile view | `GET /v1/admin/verification-requests`, `.../count`, `GET /v1/admin/accounts/:id/profile` in `backend/src/routes/admin-verification.ts` |
| Admin decision: approve (`verified`), decline (`rejected`), or `action_required`. A customer-safe reason is required for decline and action required. Step-up auth required. Stale-page guard via `expectedRevision` (409 if the customer resubmitted) | `PATCH /v1/admin/accounts/:id/profile/verification` |
| Audit trail: every admin read and every decision is logged (actor, session, IP, user agent, decision value) | same file; `customer_verification_decision` event |
| Customer is told the outcome by an **in-app alert** only, with the customer-safe reason | `backend/src/lib/sync-account-alerts.ts` |

### 1.2 Web and mobile

| What | Where |
|---|---|
| Admin "Verification review" page: queue + detail with every profile field, masked ID, completion %, decision box | `src/admin/pages/AdminVerificationPages.tsx` |
| Web customer dashboard has a Verification nav item | `src/customer/layout/CustomerDashboardLayout.tsx` (`/dashboard/verification`) |
| Mobile verification centre (edit + submit, no file) | `mobile/src/screens/account/VerificationCentreScreen.tsx`, route `mobile/app/(app)/(tabs)/account/verification.tsx` |
| Asset registration captures VIN, licence plate, serial number, IMEI as **text** | `backend/src/lib/asset-validation.ts` |

### 1.3 Important limits on what exists

- The KYC surface is behind `FEATURE_KYC_ENABLED` (mobile) and it is **off** for real users. It has
  **no Stage 8 security review** (INC-001 A-12 / F009-1). It is on only in the owner-test build.
- Only the **last 4 digits** of the ID number are accepted and stored (CT-11). This is deliberate.
- **Nothing is gated on verification.** No policy, asset or claim route checks `verificationStatus`.
  A customer can do everything without being approved.
- The admin queue shows only `pending_review`. There is no list of approved, declined or action
  required customers.
- There is no internal admin note (only the customer-safe reason).
- No email or push is sent on a decision. In-app alert only.

## 2. What is missing

1. **Document upload of any kind.** There is no object-storage vendor (MP-5). ID photo, passport,
   selfie, proof of address and proof of ownership cannot be uploaded today.
2. Compliance has **blocked** document collection until conditions close (C-013-2, C-013-5, C-013-6).
   This is a rule, not only a missing build.
3. Business rules that block anything until the customer is approved.
4. Email/push notice of the decision.
5. Admin history view (all statuses, past decisions, who decided).
6. Stage 8 review of the whole verification surface.

## 3. Information and documents needed to approve a customer (South Africa)

"Needed" here is the owner's business ask. Compliance has the final say on what may be collected.

| # | Item | Today | Notes and compliance position |
|---|---|---|---|
| 1 | Full legal name | Collected | — |
| 2 | Date of birth | Collected | — |
| 3 | Mobile number | Collected | Verified by OTP? Not today. Open question |
| 4 | Residential address | Collected as text | — |
| 5 | Emergency contact | Collected | Step-up needed to change |
| 6 | SA ID number | Last 4 only | Full number never stored (Feature 013 §6). Checksum check is Feature 013 Tier 1 |
| 7 | **SA ID document photo** (green book, smart ID card both sides) **or passport** for non-citizens | Not possible | Blocked: C-013-2. Must be deleted on decision, max 30 days (C-013-5) |
| 8 | **Selfie / liveness check** | Not possible | **Biometric = special personal information** (POPIA s26). Needs explicit consent copy (s27(1)(a)). Zero storage on our side. Realistically only via a verification vendor. Recommend: leave out unless the owner insists |
| 9 | **Proof of address not older than 3 months** | Not possible | **Compliance refused this as a default** (§5.5). It shows third-party data. Only allowed if the Client instructs it, and then redacted, or on exception |
| 10 | **Proof of asset ownership**: invoice or receipt | Not possible | Not identity data. Needs its own compliance ruling on retention (likely kept for the life of the policy plus claims period, not deleted on decision) |
| 11 | Serial number / IMEI | Collected as text | Admin can already see it on the asset |
| 12 | Vehicle registration certificate (NaTIS) + licence plate + VIN | Plate and VIN as text; certificate not possible | Certificate shows owner ID number. Treat like an ID document |

Proof of ownership belongs to the **asset**, not the person. It should be reviewed per asset, and it
matters most for claims (Feature 018). It should not hold up identity approval unless the owner
decides so (decision D-5 below).

## 4. Customer flow (mobile and web, same rules)

1. Customer opens **Verification** (mobile Account tab; web `/dashboard/verification`).
2. A checklist shows each required item and its state: missing, added, in review, accepted, needs fixing.
3. Customer fills in details. Phase B: customer takes a photo or picks a file per document.
   File types: JPEG, PNG, PDF. Size limit set by `backend-architect`.
4. Customer sees what each document is for and how long it is kept, before upload (consent copy
   from `compliance-specialist`).
5. Customer taps **Submit for review**. Submit is blocked until every required item is present.
6. Status shows **In review**. Fields lock.
7. Outcome:
   - **Approved:** status Verified. Locked fields stay locked. Changing name, ID or DOB restarts
     verification.
   - **Action required:** customer sees the reason and which item to fix. Only that item is
     unlocked (Phase B; Phase A unlocks the profile). Customer fixes and resubmits.
   - **Declined:** customer sees the reason and how to contact support. Resubmission rule is a
     decision (D-4).

## 5. Admin review flow

1. Queue lists customers in review, oldest first, with submitted date and wait time.
2. Detail shows every field (as today) plus, in Phase B, every document as a thumbnail.
3. Admin can open a document full size, zoom and rotate. **Download is off by default**
   (recommendation: view only, no download, to limit copies of ID images). Owner decision D-6.
4. Masked ID stays masked.
5. Admin picks **Approve**, **Action required** (pick the items to fix plus a customer-safe reason),
   or **Decline** (customer-safe reason). Step-up auth stays.
6. Admin may add an **internal note** that the customer never sees (new).
7. Every view of a document and every decision is audit-logged: who, which customer, which
   document, when, why (purpose). This is C-013-6.
8. History tab: all past decisions with reviewer and time.

**Who can see documents:** only admin users with a new verification-reviewer permission. Not support
agents, not call-centre staff, not security-company partners. Engineers get no routine database
access to documents. Final access list is `compliance-specialist` + `cybersecurity-architect`.

## 6. Notifications to the customer

| Event | In-app | Email | Push |
|---|---|---|---|
| Submitted | Exists | New | New |
| Approved | Exists | New | New |
| Action required (with reason) | Exists | New | New |
| Declined (with reason) | Exists | New | New |
| Document about to be deleted / deleted | — | New (Phase B) | — |

Email and push must not contain the ID number, document images or file names (C-013-6 / §5.2).
Owner: `backend-engineer` with the Feature 007 notification templates.

## 7. Business rules (proposed — owner must confirm)

- **BR-1.** A policy may be **created** before approval, but it may not become **active** until the
  customer is Verified. (Alternative: block policy creation. Decision D-1.)
- **BR-2.** A claim may not be **filed** (Feature 018) unless the customer is Verified at filing time.
- **BR-3.** A recovery/theft report is **never** blocked by verification. Safety first.
- **BR-4.** Changing name, date of birth or ID last 4 after approval sets status back to
  `in_progress` (this already happens) and BR-1/BR-2 apply again.
- **BR-5.** Re-verification every N years, or when a claim is above a value threshold. N and the
  threshold are decisions (D-3).
- **BR-6.** A declined customer cannot hold an active policy. What happens to existing assets and
  open claims is a decision (D-4).
- **BR-7.** Documents are deleted automatically on decision, at most 30 days later (C-013-5). The
  outcome, reviewer, time and a document fingerprint (hash) are kept.
- **BR-8.** Tier entitlements (`essential`/`plus`/`pro`/`business`) do not change verification rules.

## 8. Acceptance criteria

Phase A:

- **AC-A1.** Given a customer with all required fields, when they submit, then status is
  `pending_review` and the item appears in the admin queue.
- **AC-A2.** Given a missing required field, when they submit, then the API returns 400
  `VALIDATION_ERROR` and the app names the missing field.
- **AC-A3.** Given a profile in review, when the admin approves, then status is `verified`, an
  in-app alert, email and push are sent, and a `customer_verification_decision` audit row exists.
- **AC-A4.** Given decline or action required with an empty reason, then the API returns 400 and
  nothing changes.
- **AC-A5.** Given the customer resubmitted after the admin opened the page, when the admin decides,
  then the API returns 409 and the page asks to refresh. (Exists; keep the test.)
- **AC-A6.** Given an unverified customer, when they try to activate a policy (BR-1) or file a
  claim (BR-2), then the API returns 403 `VERIFICATION_REQUIRED` and the app links to Verification.
- **AC-A7.** Given an unverified customer, when they report a theft, then the report succeeds (BR-3).
- **AC-A8.** Given an admin note, then it never appears in any customer API response.
- **AC-A9.** Admin history lists every past decision with reviewer and time.

Phase B (only after section 9 dependencies close):

- **AC-B1.** Given a required document is missing, then submit is blocked and the checklist shows it.
- **AC-B2.** Given a file that is not JPEG/PNG/PDF or is too large, then upload is refused with a
  clear message.
- **AC-B3.** Given an admin opens a document, then an audit row with actor, subject, document id,
  time and purpose is written **before** the image is returned. If the audit write fails, the image
  is not returned.
- **AC-B4.** Given a user without the reviewer permission (support, call centre, partner), when they
  request a document, then the API returns 403.
- **AC-B5.** Given a decision was made, then the document bytes are deleted within 30 days by an
  automated job, and only outcome, reviewer, time and hash remain. A test proves the job runs.
- **AC-B6.** Given action required on one document, then only that document can be replaced.
- **AC-B7.** No 13-digit number appears in logs, responses, file names or storage keys (C-013-6 test).
- **AC-B8.** Document URLs are never public. Access is short-lived and per request.

## 9. Dependencies and owners

| Dependency | Owner | Blocks |
|---|---|---|
| Object-storage vendor (MP-5), private, encrypted with a customer-data key, SA/cross-border review | `integration-architect` + `cloud-infrastructure-architect` | Phase B |
| Is the 512 KB in-Mongo pattern (used for profile pictures) acceptable for ID documents? Likely no (§5.1 needs a private bucket and customer-data key) | `cybersecurity-architect` + `compliance-specialist` | Phase B shortcut |
| POPIA: consent copy, special personal information (selfie), proof-of-address ruling, retention for ownership documents | `compliance-specialist` | Phase B |
| Deletion job + data model for documents and decisions | `database-architect` + `backend-engineer` | Phase B |
| Audit logging on every identity read with purpose (C-013-6; FU-A11, G-2) | `security-engineer` + `authentication-engineer` | Turning the flag on |
| **Stage 8 security review** (mandatory; also closes the old F009-1 gap) | `cybersecurity-architect` / `security-engineer` | Any launch |
| Stage 10 QA | `qa-architect` | Any launch |
| Backend routes, gates, notifications | `backend-engineer` | A and B |
| Mobile screens (`mobile/src/design` only) | `mobile-engineer` | A and B |
| Web customer + admin pages (reuse `src/components/*`) | `frontend-engineer`, `design-system-manager` for any new component (image viewer) | A and B |
| Optional ID-verification vendor (liveness, Home Affairs check) | `integration-architect`, blocked by C-013-7 | Selfie/liveness |

## 10. Phased plan

**Phase A — use what exists. No documents.**
1. Stage 8 review of the current verification surface (owed since F009-1).
2. Add BR-1/BR-2 gates and AC-A6/A7.
3. Email + push on decision.
4. Admin: history view, internal note, filter by status.
5. Customer checklist UI on mobile and web showing which fields are missing.
6. Feature 013 Tier 1 ID checksum (already specced).
7. Turn `FEATURE_KYC_ENABLED` on for real users only after C-013-6 and Stage 8 pass.

Approve / decline / action required **already exists**. Phase A does not rebuild it.

**Phase B — documents, once storage is chosen and compliance conditions close.**
1. Storage vendor chosen and reviewed.
2. Document model, upload API, deletion job.
3. Mobile camera/file upload; web upload.
4. Admin document viewer (zoom, rotate, no download by default), per-document action required.
5. Proof of ownership per asset (linked to Feature 018 claims).
6. Stage 8 again (new data class), then Stage 10.

**Phase C — optional.** Vendor liveness and Home Affairs check, only if the owner wants it and
C-013-7 closes.

## 11. Decisions the owner must make

- **D-1.** What does "not approved" block: policy creation, policy activation, or only claims?
- **D-2.** Which documents are required: ID/passport only, or also proof of address (compliance
  refused it as a default), selfie (biometric, needs a vendor), and proof of ownership?
- **D-3.** Re-verification: every how many years, and above what claim value?
- **D-4.** After a decline: can the customer resubmit, how often, and what happens to their policy
  and assets?
- **D-5.** Does proof of asset ownership hold up identity approval, or only claims on that asset?
- **D-6.** May admins download ID documents, or view only?
- **D-7.** Phone number check by OTP: yes or no?

## 12. Not in scope

Payments, payouts, FICA determination (C-013-4, counsel), full ID number storage.

---

## 13. CTO review (2026-11-20)

**Ruling: merge as a Stage 1 plan.** It is not a build approval, and it does not change any Feature 013 compliance condition.

Corrections and rulings:

1. **No shortcut for ID documents (§9 row 2).** Do not store ID or ownership documents as bytes in MongoDB, not even in the owner-test build. Phase B waits for the MP-5 storage choice. Supabase Storage is a candidate to look at first, because Supabase is already a vendor (its DPA is still pending). It is only a candidate until `integration-architect` delivers a scorecard. Storing documents must be recorded as an ADR.
2. **BR-1 depends on payments.** Payments are not built, so "active policy" has no billing meaning yet. In Phase A, build the BR-2 claim gate and the BR-3 theft exemption first. Build BR-1 once a policy status that payments can change exists.
3. **Owner-test scope.** Phase A items 2 to 5 can be built and run in the owner-test build, where `FEATURE_KYC_ENABLED` is already on. No new flag is needed. Real users still need Stage 8, Stage 10 and C-013-6 (Phase A item 7).
4. **First build step:** `backend-engineer` builds the BR-2/BR-3 gates and AC-A6/A7, with tests. `cybersecurity-architect` starts the Stage 8 review it already owes for the current surface (F009-1) at the same time.
5. **D-2 recommendation:** ID or passport only. Leave out the selfie and proof of address. Proof of ownership is per asset and needed for claims only (this also answers D-5).
