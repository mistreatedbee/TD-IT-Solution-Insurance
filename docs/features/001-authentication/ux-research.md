# Feature 001 — Customer Account Creation & Authentication

**Lifecycle stage:** 3 — UX Research
**Stage owner (A):** `ux-researcher`
**Contributors:** `ui-designer`, `product-manager`
**Status:** Draft — ready for `ui-designer` handoff (Stage 4) pending Pre-Approval Checklist review below
**Input artifacts:** [`business-requirements.md`](./business-requirements.md) (Stage 1), [`product-plan.md`](./product-plan.md) (Stage 2), [`ADR-0002`](../../organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md) (Accepted)

---

## 0. Framing Note

This feature has no prior UI to research against — there is no existing signup/login surface, and the current `src/components/` library is a marketing-site design system (Accordion, Card, TestimonialCard, IndustryCard, LogoCloud, etc.) with **no authenticated-app components yet**. This document is therefore *generative* UX research (flows + personas + heuristic/accessibility analysis against the ratified business rules), not *evaluative* research against a shipped product. Usability testing with real users is deferred to post-Stage-4 prototypes; this stage's job is to hand `ui-designer` a validated, evidence-informed starting point, per this role's charter.

Every flow below is scoped strictly to what Stage 1/2 authorized — identity and session lifecycle only. No policy purchase, asset registration, claims, or theft-reporting UI is designed here; those are separate future features. Where a flow touches a future feature's entry point (e.g., "resume policy purchase"), it is shown only as a redirect target, not designed.

Supabase Auth (ADR-0002, Accepted) supplies the underlying mechanics for verification emails, password reset links, TOTP MFA enrollment/challenge, and session/token handling. The flows below describe what the *user* experiences; they are compatible with, but do not depend on, that implementation detail — noted only where it shapes user-facing timing (e.g., email delivery latency) or MFA factor type (TOTP as the baseline factor).

---

## 1. User Flows

Each flow is a numbered step sequence with the screen/state the user is on, and branch points called out. Emotion/anxiety annotations are marked `⚠` at steps carrying elevated risk of frustration, confusion, or abandonment, per this role's journey-mapping practice.

### 1.1 Customer Signup → Email Verification → First Login (Mobile, Customer App)

1. User opens app, taps **Create account** from the welcome/landing screen.
2. Signup form: email, password, confirm password (or password + strength meter), consent/ToS checkbox (unbundled from any marketing opt-in per POPIA — Stage 1 §9.2).
3. Inline password-strength feedback as user types (policy TBD by `authentication-engineer`, but *some* real-time signal is required — do not let a user submit and only then learn the policy).
4. User submits.
   - **If email already registered:** generic rejection message that does not confirm/deny an existing account (FR-5, AC-2) — e.g. "We couldn't create this account. If you already have one, try logging in or resetting your password." with links to both. `⚠` — this message must not read as evasive/broken to a first-time user typing a fresh email by mistake; copy needs `technical-writer` collaboration.
   - **If valid:** account created in `pending_verification` state (BR-5); proceed to step 5.
5. Confirmation screen: "Check your email" — states the email address sent to, expected arrival window, and a **Resend** action (rate-limited, with visible cooldown).
6. User leaves app or backgrounds it, opens email client, taps verification link.
7. Link opens (deep link back into app if installed, else web confirmation page) → verification succeeds → account transitions to `active` (AC-3).
8. App shows a success state and routes user to first-login/home, now unlocked for commerce actions (policy purchase / asset registration entry points become available — those flows are out of scope here, shown only as unlocked entry points).
9. **Branch — user returns to app before verifying (common case):** app recognizes `pending_verification` session state, shows a persistent-but-dismissible verification reminder (not a blocking modal) with a **Resend email** action, and clearly marked, low-emphasis limitations of the unverified state (see §1.8 for the commerce-gate moment specifically).
10. **Branch — verification link expired/already used:** clear message + one-tap **Send a new link**, no dead end.

**Anxiety note:** This is the first-touch flow for someone trying to protect a device (e.g., insuring a laptop before travel). Step 5–7's email round-trip is the single highest drop-off risk point in the whole feature — see §3.

### 1.2 Customer Login, With Optional MFA (Mobile, Customer App)

1. User opens app, lands on **Log in** (default if a previous session exists but is expired/logged out; otherwise reachable from the welcome screen).
2. Enters email + password, taps **Log in**.
3. **If credentials incorrect:** generic error ("Incorrect email or password") — never states which field is wrong (AC-5, anti-enumeration-consistent). Failed-attempt counter is invisible to the user until near the lockout threshold (see step 6).
4. **If correct and MFA is not enabled on this account:** session issued, user lands on home. (FR-10 — MFA optional for customers.)
5. **If correct and MFA is enabled on this account:** app prompts for the second factor (TOTP code entry screen) before issuing a session.
   - Code entry: single input for a 6-digit code, numeric keypad, auto-submit on 6 digits.
   - **If code wrong/expired:** inline error, retry allowed, no separate lockout counter conflated with the password-attempt counter (avoid punishing a slow typist as though they were brute-forcing).
   - **If correct:** session issued, user lands on home.
6. **Approaching lockout (e.g., 1 attempt remaining before rate-limit per FR-11):** the error message escalates to warn the user *before* they're locked out, not only after ("One more incorrect attempt will temporarily lock this account. Forgot your password?") with an inline password-reset link. `⚠` — see §3 on lockout-recovery framing.
7. **Locked out:** clear, non-punitive message stating this is temporary, why it happened (too many attempts), how long (or "check your email to reset now" if no fixed cooldown is exposed), and a direct path to password reset — never a dead-end "come back later" with no action available.

### 1.3 Customer Forgot-Password Flow (Mobile, Customer App)

1. From the login screen, user taps **Forgot password?**
2. Enters email, submits.
3. Same-appearance confirmation regardless of whether the email exists ("If an account exists for this email, we've sent a reset link") — anti-enumeration (FR-15).
4. User checks email, taps single-use, time-limited reset link (FR-16).
5. Link opens (deep link or web) → new-password form (password + confirm, same real-time strength feedback as signup).
6. User submits new password → success confirmation.
7. **All existing sessions for the account are invalidated (FR-17)** — the app on this and any other device shows the user logged out and must re-authenticate. This must be **explicitly communicated** at the success screen ("You've been logged out of all other devices for security") so a user checking the app on a second device isn't confused/alarmed by an unexplained logout. `⚠`
8. **Expired/used link:** no dead end — clear message + direct restart of step 1–2.

### 1.4 Admin / Security-Company Operator / Support Agent: First Login After Invitation → Forced Password Set → Mandatory MFA Enrollment (Web)

1. Invitee receives an email (triggered by an admin invitation action, FR-6/FR-7) with a unique invitation link. No public signup path exists for this role — this is the *only* entry point (AC-12).
2. Link opens the web dashboard's invitation-acceptance screen: shows the invited email (read-only, cannot be changed here) and, for security-company operators, the partner organization they're scoped to (BR-7) — shown for the user's own confirmation ("You're joining as an operator for [Org Name]"), building trust that the invite is legitimate and correctly scoped.
3. User sets a password (+ confirm), same strength feedback pattern as customer signup for consistency.
4. Submits → password set → **immediately and without option to skip or defer**, routed into MFA enrollment (BR-4, AC-7 — "no path to skip or defer").
5. MFA enrollment screen: presents the supported factor (TOTP baseline per ADR-0002) — QR code + manual entry-key fallback for users without a camera-ready second device at hand, plus clear instructions naming a compatible authenticator app category (not tied to one vendor).
6. User scans/enters key in their authenticator app, enters the resulting 6-digit code to confirm enrollment.
7. **On successful verification:** enrollment complete, account becomes usable, user lands on the dashboard home.
8. **On failed verification code:** inline retry, no attempt-count lockout at this step (this is setup, not a login attempt — conflating the two would strand a legitimate new user over typos).
9. **Recovery codes:** after successful enrollment, present a set of one-time backup/recovery codes with an explicit instruction to store them securely (download/copy action) before proceeding — this is the account's only self-service path back in if the authenticator device is later lost, and its absence would directly contradict BR-4's "no admin-level override... without a `cto`-signed risk acceptance" by leaving no lawful self-service recovery at all. `⚠` **Flag to `authentication-engineer`/`cybersecurity-architect`:** confirm recovery-code mechanism is in scope for Stage 5/6 — UX assumes it exists; if it doesn't, step 9 must be redesigned around whatever recovery mechanism is chosen, and the "no bypass without cto sign-off" language needs a documented human process for a lost-device operator in the meantime.
10. **Branch — invitation link expired or already used:** clear message directing the invitee to contact the admin/org who invited them (no self-service resend for privileged roles, consistent with BR-3's admin-controlled provisioning) — this must state *who to contact*, not just that the link failed.

### 1.5 Privileged Login With Mandatory MFA Challenge (Web, Admin/Security-Company/Support)

1. User lands on the dashboard's **Log in** screen (no signup link present anywhere on this surface, per AC-12).
2. Enters email + password, submits.
3. **If incorrect:** generic error, same anti-enumeration posture as customer login.
4. **If correct:** always prompted for MFA — no branch where MFA is skipped for these roles (FR-9, AC-6). Code-entry screen identical in pattern to §1.2 step 5.
5. **If correct MFA code:** session issued, dashboard home loads.
6. **If incorrect MFA code:** inline retry; standard rate-limiting applies per FR-11 (this *is* a login attempt, unlike enrollment-time step 8 in §1.4).
7. **Lost authenticator device at login (no code available):** a visible **"Can't access your authenticator?"** link on the MFA-challenge screen routes to recovery-code entry (if that mechanism is confirmed per §1.4 step 9's flag) — without this, a locked-out admin/operator has no self-service path at all, which is an unacceptable dead end for a role whose daily work may include time-sensitive recovery-related actions on other features. `⚠` **This is a hard flag, not a nice-to-have** — see §3.
8. **Lockout after repeated failures:** same non-punitive, clear-path messaging as §1.2 step 7, adapted to note that privileged-role lockouts may warrant a note to contact an admin/support if self-service reset doesn't resolve it.

### 1.6 Privileged Password Reset With MFA Re-Verification (Web)

1. From dashboard login, user taps **Forgot password?**
2. Enters email, submits → same non-enumerating confirmation as §1.3.
3. Reset link (single-use, time-limited) opens → new-password form.
4. Submits new password → **before the reset is finalized**, user is prompted for MFA verification (AC-10, FR-18 — reset does not bypass MFA for privileged roles). This is a meaningful UX divergence from the customer flow (§1.3) and must be visually/copy-distinguished so it doesn't read as a bug ("wait, I already reset my password, why is it asking for a code now?").
5. MFA code entered and verified → reset finalized → success screen, explicitly stating all other sessions/devices have been logged out (FR-17), same as §1.3 step 7.
6. **If user has lost their MFA device and is also resetting their password (compound worst case):** this is the single hardest recovery scenario in the whole feature — locked out of both factors simultaneously. Needs an explicit, human-escalation path (e.g., "Contact your administrator" for operators/support, or a named internal process for admins themselves) surfaced directly on this screen, not buried in a help center. `⚠` **Flag to `authentication-engineer`/`cybersecurity-architect`:** this scenario needs a defined resolution process before Stage 4 finalizes copy/flow for it — UX cannot resolve it, only ensure it isn't a silent dead end.

### 1.7 Logout (All Surfaces)

1. User selects **Log out** from account/profile menu (consistent placement expected across mobile app, admin dashboard, security-company dashboard per FR-14's "functionally identical in effect across all four user types and all three surfaces").
2. Optional lightweight confirmation for web (accidental-click protection on a persistent nav item) — **not** required on mobile where logout is typically nested deeper and less likely to be an accidental tap; `ui-designer` discretion, not a hard requirement.
3. Session/tokens invalidated immediately (FR-13, AC-8) — user is routed to the logged-out/login screen, no residual authenticated state briefly visible (avoid a flash of stale dashboard data before redirect).
4. **Dashboard idle-timeout logout (FR-21, not user-initiated):** when a web session times out from inactivity, the user's *next* action should surface a clear "You were logged out due to inactivity" message at the login screen — not a silent redirect that looks identical to a manual logout, which would be confusing ("did I do something wrong?") for privileged users handling sensitive data. `⚠`

### 1.8 What a User Sees When Blocked by BR-2 (Unverified Account Attempting a Commerce-Gated Action)

1. Customer with a `pending_verification` account navigates to a policy-purchase or asset-registration entry point (these entry points themselves are future-feature UI; only the *block* is in scope here).
2. Action is intercepted before proceeding (AC-11) — the user is **not** silently prevented (e.g., a disabled button with no explanation) but is shown an explicit, specific gate screen/modal:
   - States **why**: "Verify your email to unlock policy purchases and asset registration" — not just "This action is unavailable."
   - States **how**: direct **Resend verification email** action, plus a reminder of which address it was sent to.
   - Does **not** shame or alarm the user — this is a routine, expected state for a brand-new account, not a punitive block; copy tone should read as "one more step," not "something is wrong."
3. Primary action on this screen is **Resend email**; secondary is **Back** (return to what they were doing, browsing, etc. — do not trap the user on this screen).
4. Once verification completes (via the email link, per §1.1), the next time the user opens the app or returns to the gated entry point, the block is gone with no additional action required (no manual "refresh my status" step).

**Why this matters beyond UX polish:** BR-2 is explicitly a hard business rule, not a UX nicety (Stage 1 §4) — but *how* it's communicated is entirely a UX decision, and a poorly worded gate ("Access Denied") reads as a system error or account problem, eroding trust at exactly the moment a new customer is deciding whether to trust this platform with an asset.

---

## 2. Personas

Lightweight, feature-scoped personas — not full persona-library documents. Each includes the anxiety/urgency state relevant to *this* feature specifically (identity/session only), per this role's practice of segmenting by anxiety state.

### 2.1 Thabo — First-Time Customer, Registering a Laptop Policy

- **Context:** Just bought a new work laptop; wants it insured before a trip next week. Discovered the app via a search/referral, has never used the platform before.
- **Goal for this feature:** Create an account and get verified fast enough to actually buy a policy before he loses momentum/interest.
- **Anxiety/urgency state:** Mild task-urgency, low trust (new platform, doesn't know if it's legitimate yet). Not in crisis — this is a *before* moment (theft hasn't happened), but the signup flow being slow, confusing, or leaving him stuck at "check your email" with no clear next step is enough to make him abandon and consider a competitor.
- **What this feature must get right for Thabo:** §1.1 (signup→verification) must feel fast and low-friction; §1.8's gate messaging must not feel like a wall; no MFA friction imposed (correctly optional per FR-25).
- **Design implication:** minimize steps before "check your email," make the resend/troubleshooting path obvious, and never let him feel he did something wrong.

### 2.2 Naledi — Admin Operator, Daily Dashboard User

- **Context:** Internal TD IT Solution staff, logs into the Admin Dashboard multiple times a day across a normal work week. Account was provisioned by invitation; MFA is mandatory and cannot be turned off.
- **Goal for this feature:** Get past login/MFA quickly and reliably so it doesn't interrupt her actual work (viewing customers, policies, assets — out of scope here, but the *reason* she's logging in repeatedly).
- **Anxiety/urgency state:** Not anxious about security — mildly *annoyed* by repeated friction if MFA re-prompts too aggressively or the flow is clunky (e.g., manual code re-entry every time with no "remember this device" consideration). Her risk is disengagement/workaround behavior (writing codes on a sticky note, complaining to IT) if friction outweighs perceived value — a real usability risk even though the mandate itself is correctly non-negotiable per BR-4.
- **What this feature must get right for Naledi:** §1.5's MFA challenge must be fast (auto-submit on 6 digits, no unnecessary extra clicks); re-prompt cadence (deferred to `authentication-engineer` per FR-9) should be raised as a UX input, not purely a backend policy decision — recommend involving `ux-researcher`/`product-manager` in that cadence tradeoff once Stage 5 architecture defines the options.
- **Design implication:** MFA must be as low-friction as security allows without being weakened — this is a balance point to flag explicitly to `product-manager`/`cybersecurity-architect`, not something UX can unilaterally resolve.

### 2.3 Sipho — Security-Company Operator, External Partner, On the Go

- **Context:** Works for an external security-company partner org; uses the Security Company Dashboard from a phone browser or a shared office laptop, sometimes in the field, not always on a fast/stable connection. Less familiar with corporate SaaS login patterns (authenticator apps, MFA) than an internal admin might be.
- **Goal for this feature:** Log in reliably from wherever he is, without needing to call his own IT/admin contact every time something goes slightly wrong.
- **Anxiety/urgency state:** Moderate — lower digital literacy plus external-partner status means he's more likely to get stuck on unfamiliar steps (e.g., "what's an authenticator app?") and less likely to have an easy internal support contact the way an in-house admin does. A confusing MFA-enrollment screen (§1.4) risks a support-burden spike or operators giving up mid-enrollment.
- **What this feature must get right for Sipho:** §1.4's MFA enrollment instructions must not assume authenticator-app familiarity — plain-language explanation of *what* an authenticator app is, not just *how* to scan a code; recovery-code presentation (step 9) must be unmissable and simply worded, since he's less likely to know to ask "what if I lose my phone?" proactively.
- **Design implication:** enrollment copy needs `technical-writer` involvement calibrated for lower assumed technical fluency, distinct from the internal-admin tone that might be acceptable for Naledi's flow even though it's the same underlying screen.

---

## 3. Trust and Anxiety-Sensitive Design Considerations

Theft-reporting itself is a separate future feature, but this feature sits directly upstream of it — the account a locked-out or confused user has *right now* is the same account they'll depend on the day something is actually stolen. Trust built or eroded here compounds forward.

- **Account lockout must never be a dead end.** A customer locked out after failed attempts (§1.2 step 7) could plausibly be trying to log in *because* something urgent is happening (e.g., wants to check policy details after noticing a laptop is missing, even though formal theft-reporting isn't built yet). Lockout messaging must: state clearly this is temporary and why, give an immediate self-service path (reset), and never read as punitive ("Your account has been locked" reads very differently from "For your security, we've paused login attempts — reset your password to get back in now"). **Recommendation:** escalate the warning *before* lockout (§1.2 step 6), not only after.
- **MFA friction vs. mandate tension (Naledi, §2.2) is real and must be surfaced, not silently absorbed by UX polish alone.** UX can reduce *perceived* friction (auto-submit, clean code entry, clear recovery path) but cannot and should not reduce the *actual* security requirement — that tradeoff boundary belongs to `cybersecurity-architect`/`product-manager` (re-prompt cadence, FR-9), and this document flags it rather than resolving it unilaterally, per this role's charter ("recommends but does not unilaterally decide... technical feasibility trade-offs").
- **Verification-gate messaging (BR-2, §1.8) must explain *why*, not just *that*.** A generic "action unavailable" reads as a system fault and directly undermines the trust a first-time customer (Thabo, §2.1) needs to feel before handing over payment details for a policy. This is a compliance-and-conversion-both issue, not just a nicety.
- **Compound lockout (password + MFA device both unavailable, §1.6 step 6) is the single highest-anxiety scenario in this feature** and currently has no confirmed resolution mechanism — flagged as an open dependency for `authentication-engineer`/`cybersecurity-architect` before Stage 4 can finalize this screen's copy and flow. Shipping this screen with a silent dead end would materially violate this role's Best Practice against leaving high-anxiety flows without a visible human-support escalation path.
- **Unexplained logouts (idle timeout, password-reset session invalidation) must always self-explain at the next login screen.** A silent, unexplained logout reads as a possible security incident or app bug to a non-technical user and is a needless trust cost that a single line of copy avoids entirely.
- **Invitation-flow legitimacy (§1.4 step 2) matters for external partner trust.** Sipho (§2.3) has no independent way to verify an invitation email is legitimate beyond what the product shows him — confirming the org name and email on the acceptance screen gives him a concrete, checkable detail rather than blind trust in an email link, which also happens to be good anti-phishing hygiene.

---

## 4. Accessibility Considerations (WCAG 2.1 AA baseline)

- **MFA must not depend on a single sense or modality.** TOTP code entry (visual, typed) is the baseline; ensure the QR-enrollment step (§1.4 step 5) always ships with the manual entry-key **text** fallback already implied in the flow — a screen-reader or low-vision user cannot use a QR code alone. Recovery codes (step 9) must be presented as selectable/copyable text, not an image.
- **Form error messaging must be programmatically associated with fields**, consistent with the existing `Input` component's pattern (`aria-invalid` + `aria-describedby` linking hint/error text — see §5) — every new auth-specific field (MFA code input, password-confirm, invitation acceptance) must follow the same association pattern, not introduce a visually-adjacent-but-unlinked error message.
- **Generic anti-enumeration error copy (signup, password reset) must still be specific enough to be actionable** for assistive-tech users — "something went wrong" fails accessibility guidance on error identification (WCAG 3.3.1) even while correctly avoiding enumeration; the recommended copy in §1.1/§1.3 threads this (states the outcome and offers a concrete next action without confirming/denying account existence).
- **Timed flows (verification links, reset links, session/MFA code entry) need generous, clearly communicated time limits or an easy way to request a fresh one** (WCAG 2.2.1) — every timed link in this feature already has a "resend/request new one" branch designed in (§1.1 step 10, §1.3 step 8, §1.4 step 10); this must not regress at implementation.
- **Support-portal-adjacent audience (Sipho, §2.3) may have lower digital literacy** — plain-language instructions for MFA enrollment, avoiding unexplained jargon ("TOTP," "authenticator") without a one-line definition, and keyboard/touch-target sizing appropriate for on-the-go mobile-browser use on the Security Company Dashboard (a web surface likely to be used on a phone in practice, even though it's not the dedicated mobile app).
- **Lockout/error states must not rely on color alone** to convey severity (consistent with the existing `Badge` component's own guidance note: "color alone should not convey meaning; keep the label descriptive") — apply the same principle to new error/warning states introduced for this feature.
- **Focus management on redirect-heavy flows** (email deep links returning to app, MFA-challenge interstitials, forced first-login redirects) must set focus to the new screen's primary heading/action for screen-reader users, not leave focus stranded on a now-gone element.

---

## 5. Handoff Notes for `ui-designer` (Stage 4)

### 5.1 What exists and is reusable

- **`Input`** (`src/components/Input`) — covers email, password, and text fields directly (signup, login, reset, invitation acceptance). Already supports `error` + `aria-describedby`/`aria-invalid` wiring, which every auth form in §1 should reuse rather than reinvent. Note: current variant list (`text | email | tel | url | password | textarea`) has no numeric/OTP-optimized variant — see §5.2.
- **`Button`** (`src/components/Button`) — `primary` for the main submit action on each screen (Log in, Create account, Verify, Reset password), `secondary`/`tertiary` for the paired lower-emphasis action (Resend, Back, Cancel). The existing `loading` prop (spinner + `aria-busy`) should be used on every submit button that triggers a network round-trip (login, verification resend, MFA verify) — these are exactly the moments users are most likely to double-tap out of anxiety.
- **`Card`** (`src/components/Card`) — suitable as the containing surface for auth forms on web (Admin/Security-Company Dashboard login, invitation-acceptance, MFA enrollment) and for the BR-2 gate modal/panel content (§1.8). `interactive={false}` is correct here — these are not clickable cards.
- **`Badge`** (`src/components/Badge`) — usable for lightweight status labels (e.g., an account-state indicator in a future admin-facing account list, out of scope for this feature's own UI but worth noting for consistency). Current tones (`neutral | gold | emerald`) have **no error/danger/warning tone** — see flag below.

### 5.2 Flags for `design-system-manager` sign-off (new components likely needed — not invented here, only flagged)

1. **OTP/MFA code-input component.** No existing component is built for a 6-digit, numeric, auto-advancing/auto-submitting code entry (§1.2 step 5, §1.4 step 6, §1.5 step 4, §1.6 step 4). This appears in nearly every privileged flow and the optional-MFA customer flow — worth building once as a shared primitive rather than each surface (mobile app, two web dashboards) implementing its own. Needs: numeric keypad on mobile, paste support, clear per-digit error state, screen-reader-friendly grouping (not six unlabeled single-character inputs with no relationship announced).
2. **Alert/inline-banner or status-message component.** No existing component covers a persistent-but-dismissible inline warning (§1.1 step 9's verification reminder), a blocking gate message (§1.8), or a success/logged-out-elsewhere confirmation (§1.3 step 7, §1.7 step 4). `Card` can act as a container but nothing in the current library expresses severity/tone (info vs. warning vs. success) the way this feature repeatedly needs. Recommend checking whether this is more broadly needed across other future features before building it just for auth — likely yes, given claims/recovery flows will need the same primitive.
3. **Badge tone gap — no error/danger/warning tone exists** (`neutral | gold | emerald` only). If any auth-adjacent status surface (account state, lockout indicator) uses `Badge`, a fourth tone is needed. Flag to `design-system-manager` rather than extending `Badge` unilaterally in this feature's implementation.
4. **Recovery-code display component** (§1.4 step 9) — a set of one-time codes presented for copy/download/print, with an explicit "I've saved these" confirmation gate before proceeding. No equivalent exists in the current library (nothing handles sensitive, copy-once secret display). Small, purpose-built, but security-sensitive enough that `cybersecurity-architect` should review the pattern alongside `design-system-manager`, not just `ui-designer` alone.
5. **QR code display** for MFA enrollment (§1.4 step 5) — no existing component; likely a thin wrapper (`design-system-manager` to decide if this belongs in the shared library or is a one-off implementation detail, given it's driven by whatever MFA library `authentication-engineer` selects at Stage 5/6).

### 5.3 Open dependencies UI Design should not silently resolve

- Recovery-code/lost-MFA-device mechanism (§1.4 step 9, §1.5 step 7, §1.6 step 6) is **not yet confirmed** as in-scope by `authentication-engineer`/`cybersecurity-architect`. `ui-designer` should design the happy path now but flag these specific screens as pending confirmation rather than finalizing copy/flow that may need to change.
- MFA re-prompt cadence (FR-9) is undetermined — affects how often Naledi (§2.2) hits §1.5's challenge screen. Design for "every login" as the safe baseline per FR-9's literal text, but don't hardcode assumptions that block a lighter cadence later if `authentication-engineer` lands on session-risk-based re-prompting.
- Exact password-strength policy (FR-2) is undetermined — design the real-time feedback pattern (§1.1 step 3) to be policy-agnostic (a strength meter/checklist driven by whatever rules are configured), not hardcoded to a guessed policy.

---

## 6. Pre-Approval Checklist (ux-researcher self-review)

- [x] **Journey map covers happy path, edge cases, and worst-case/high-anxiety scenario.** Each flow (§1.1–§1.8) includes branch points for errors, expired links, and lockouts; §1.6 step 6 and §3 explicitly name the compound worst-case (password + MFA device both unavailable) as the highest-anxiety scenario in this feature.
- [x] **Persona(s) affected are identified and their needs explicitly addressed.** §2.1–§2.3 (customer/Thabo, internal admin/Naledi, external partner/Sipho) each map back to specific flow steps and design implications.
- [ ] **Usability testing (or documented rationale for skipping) completed with severity-rated findings.** Not completed — rationale: no UI exists yet to test against (see §0 Framing Note); this is generative research feeding Stage 4, not evaluative research against a build. **Recommendation:** moderated usability testing on Stage 4's prototypes (signup, MFA enrollment, and the compound-lockout recovery screen specifically) before Stage 9 Development begins, prioritizing Thabo- and Sipho-type participants (first-time/low-tech-literacy) given the accessibility and trust risks flagged in §3–§4.
- [x] **Accessibility check performed against WCAG 2.1 AA for the affected flow.** §4 covers MFA multi-modality, error-field association, timed-link limits, plain-language/literacy considerations, and color-independent status — mapped to relevant WCAG success criteria (2.2.1, 3.3.1) where applicable.
- [x] **Findings shared with `ui-designer` and `product-manager` with clear recommendations.** §5 (handoff notes, component reuse, and flagged new-component needs for `design-system-manager`) is written directly for `ui-designer`'s Stage 4 intake; §2.2 and §3's MFA-cadence tradeoff is explicitly routed to `product-manager`/`cybersecurity-architect` rather than resolved here.
- [x] **Anxiety/trust-sensitive moments have visible next steps and human-support escalation paths.** §1.2 step 7, §1.4 step 10, §1.5 step 7, §1.6 step 6, and §1.8 each specify a concrete next action; §1.6 step 6 and §1.5 step 7 are flagged as *not yet backed by a confirmed mechanism* — this is disclosed, not glossed over, and is the one place this checklist item is satisfied at the "flow has a place for it" level rather than the "resolution is confirmed" level.
- [ ] **Success metrics defined and baseline captured before launch.** Feature-level success metrics were already defined at Stage 2 (product-plan.md §"Success Metrics" — signup-to-verified conversion, invitation-to-first-login completion, MFA enrollment completion, login failure/lockout rate, password-reset completion/time). No UX-specific baseline (e.g., task-success-rate targets, time-to-complete targets per this role's own Success Metrics) has been captured yet, since there is no shipped flow to baseline against — recommend defining flow-specific UX target metrics (e.g., signup-to-first-successful-login time, MFA-enrollment completion rate/time on first attempt) at Stage 4 sign-off once wireframes stabilize, and capturing actual baselines once Stage 9/10 produces a testable build.

**Net status:** Ready to hand off to `ui-designer` (Stage 4) with two unchecked items disclosed above (usability testing deferred by documented rationale; UX-specific success-metric baselines deferred to Stage 4/post-build) — neither blocks Stage 4 entry per the lifecycle's stated criteria, but both are flagged as follow-up obligations, not silently dropped. Three open dependencies (§5.3) require `authentication-engineer`/`cybersecurity-architect` input before the compound-lockout and lost-MFA-device screens can be finalized — `ui-designer` should design placeholders for these, not final copy/flow.
