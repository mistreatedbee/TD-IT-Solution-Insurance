# Feature 001 — Customer Account Creation & Authentication

**Lifecycle stage:** 4 — UI Design
**Stage owner (A):** `ui-designer`
**Contributors:** `design-system-manager`, `frontend-engineer`, `mobile-engineer`
**Status:** Draft — screen-by-screen mockup specification, ready for `frontend-engineer`/`mobile-engineer` estimation input and `product-manager` sign-off. §4.9 (compound lockout) and the §4.4/§4.5 lost-MFA-device paths are now fully resolved (support-assisted manual reset, no recovery-code mechanism anywhere in this feature — see `design-system-additions.md` §0) and are no longer open placeholders.
**Input artifacts:** [`ux-research.md`](./ux-research.md) (Stage 3, complete), [`business-requirements.md`](./business-requirements.md) (Stage 1), [`product-plan.md`](./product-plan.md) (Stage 2)

---

## 0. Framing Note

This is a text-based mockup specification, not pixel artwork — it defines screen composition, component usage, states, copy, and responsive behavior precisely enough for `frontend-engineer`/`mobile-engineer` to build without guessing, and precisely enough for `manual-qa-engineer` to write visual test cases against. No component code is written here (that is Stage 9, Development).

Every screen below is composed from the **existing** `src/components/` library (`Input`, `Button`, `Card`, `Section`, `SectionHeading`, `Badge`, `StepItem`, `ArrowLink`, `Avatar`) wherever possible. Five gaps flagged by `ux-research.md` §5.2 are **not built yet** and are being specified in parallel by `design-system-manager`. Where a screen needs one of these, it is called out explicitly as **[NEW: ComponentName — spec owned by design-system-manager]** and I do not invent my own prop/behavior spec for it beyond referencing the plain-language contract `ux-researcher` already described. The five flagged components, referenced by the same names `ux-research.md` used:

1. **OTP/MFA code input** — 6-digit numeric, auto-advance/auto-submit.
2. **Alert/banner** — persistent-dismissible warning, blocking gate message, success/logged-out-elsewhere confirmation; needs info/warning/success/danger tone.
3. **Badge — danger/warning tone** — extends existing `Badge` (`neutral | gold | emerald`) with a 4th tone.
4. **Recovery-code display** — copy-once secret list with "I've saved these" confirmation gate. **Possibly descoped** — see §4.4 and §4.9.
5. **MFA QR display** — QR image + manual-entry-key text fallback.

Until `design-system-manager` ships these, `frontend-engineer` should treat every screen referencing them as blocked on that spec, not free to improvise a local one-off.

---

## 1. Visual Language Direction (applies to all 8 flows)

Reusing existing tokens only — no new palette introduced here (brand-identity-level decisions are outside `ui-designer` authority and route to `product-manager`/`cto` per charter).

- **Color:** `primary` (electric blue) is the single primary-action color across every auth screen — reserved for the one dominant CTA per screen (Create account, Log in, Verify, Reset password), consistent with `Button`'s own guidance of "one primary per view." `surface-navy` / `surface-navy-deep` anchor the privileged-role (Admin/Security Company Dashboard) login and invitation screens, giving those surfaces a deliberately more "operational, institutional" register than the customer app's lighter `background`/`card` surfaces — the same distinction Naledi (internal, daily-use) and Sipho (external partner, lower digital literacy) need to *feel*, not just functionally get. `success` / `success-light` are reserved for genuine completion states (verified, MFA enrolled, password reset done) — never reused for a merely neutral "in progress" state. `accent-gold` is not used anywhere in this feature — it signals premium/plan-tier elsewhere in the system and would misrepresent a routine auth step as an upsell moment.
- **Danger/warning color:** until `design-system-manager` ships the Badge danger/warning tone and Alert component, error/lockout copy uses the existing `Input` component's built-in red-500/red-600 error treatment (already token-defined per Input's Context.md) for field-level errors, and is specified here at the *content* level for banner-level messages pending the Alert component landing.
- **Typography:** `font-heading`/`font-body` (Inter) throughout — headings at `h1`/`h2` per screen per accessibility focus-management requirement (§6), body copy kept short-line (auth forms are single-column, narrow-measure by nature).
- **Spacing/elevation:** `Card` (`interactive={false}`) is the containing surface for every auth form on web dashboards and for modal/panel gate content; `radius-card` / `shadow-resting` apply automatically. Mobile app screens do not wrap the form in a `Card` — the screen background *is* the surface (mobile app pattern: full-bleed `background`, form content padded, no nested card shadow competing with the OS chrome). This distinction is intentional: web dashboards are multi-panel environments where `Card` establishes a form's boundary against surrounding chrome; the mobile app is single-task-per-screen and doesn't need that boundary.
- **Tone:** Calm, precise, credible — never alarmist. Every error/lockout/gate message in this document follows `ux-research.md` §3's rule: state what happened, why, and the next action, in that order, without words like "denied," "failed," "invalid" as the *headline* (they're acceptable only within a field-level micro-message, not a screen-level heading).

---

## 2. Flow Index

| § | Flow | Surface | Personas |
|---|---|---|---|
| 4.1 | Customer Signup → Email Verification → First Login | Mobile app | Thabo |
| 4.2 | Customer Login, Optional MFA | Mobile app | Thabo |
| 4.3 | Customer Forgot Password | Mobile app | Thabo |
| 4.4 | Privileged First Login: Invitation → Password → Mandatory MFA Enrollment | Admin / Security Company Dashboard (web) | Naledi, Sipho |
| 4.5 | Privileged Login With Mandatory MFA Challenge | Admin / Security Company Dashboard (web) | Naledi, Sipho |
| 4.6 | Privileged Password Reset With MFA Re-Verification | Admin / Security Company Dashboard (web) | Naledi, Sipho |
| 4.7 | Logout (all surfaces) | Mobile app + web dashboards | All |
| 4.8 | BR-2 Verification-Gate Block | Mobile app | Thabo |
| 4.9 | Compound Lockout (support-assisted manual reset) | Admin / Security Company Dashboard (web) | Naledi, Sipho |

(§4.9 is not a separate `ux-research.md` numbered flow but is called out on its own here per the platform-owner ruling in the task brief — it is the terminal branch of §1.6 step 6 in `ux-research.md`.)

---

## 3. Component Composition Legend

Used throughout: `Input`, `Button`, `Card` (+`CardHeader`/`CardBody`/`CardFooter`), `Section`, `SectionHeading`, `Badge`, `StepItem`, `ArrowLink`, `Avatar`. New/pending: **OTP input**, **Alert/banner**, **Badge (danger/warning tone)**, **Recovery-code display**, **MFA QR display** — each marked inline.

---

## 4.1 Customer Signup → Email Verification → First Login (Mobile App)

### Screen A — Welcome / Landing
- Layout: single-column, full-bleed `background`, logo top, headline, two stacked `Button` actions thumb-reachable in the lower third: `primary` "Create account", `tertiary` "Log in" beneath it.
- No `Card` wrapper — mobile screens are full-bleed per §1.

### Screen B — Signup Form
- `SectionHeading` (`as="h1"`, `size="lg"`) — title: "Create your account", subtitle: "Takes about a minute."
- Form fields, single column, generous vertical spacing for thumb-friendly tap targets (min 44×44pt each):
  - `Input type="email" label="Email"`
  - `Input type="password" label="Password"` — live strength feedback rendered directly under the field as the user types (policy-agnostic per `ux-research.md` §5.3 — render whatever checklist/meter `authentication-engineer` configures; spec here only fixes *placement*: inline, below the password field, updating on keystroke, never only revealed after submit).
  - `Input type="password" label="Confirm password"`
  - A plain (non-`Input`) checkbox row for consent/ToS — unbundled, single checkbox, no pre-ticked state, label: "I agree to the [Terms of Service] and [Privacy Notice]." No marketing-opt-in checkbox bundled here (POPIA — business-requirements.md §9.2).
- Primary action: `Button variant="primary" fullWidth loading={isSubmitting}` — "Create account". Disabled until required fields valid and consent checked.
- Below the button: plain text row, "Already have an account? " + `ArrowLink` "Log in".

**States:**
- *Empty:* fields unfilled, primary button disabled (not hidden — visible-but-disabled, so the action is discoverable).
- *Loading:* `Button loading` spinner + `aria-busy`, fields locked to prevent double submission.
- *Error — duplicate email (FR-5/AC-2, anti-enumeration):* **[NEW: Alert/banner, tone=warning]** rendered above the form, non-field-specific (this is deliberately not attached to the email `Input` via `aria-describedby`, since it is not a validation error about the *format* of the email — it's a business-rule rejection that must not read as "your email is wrong"):
  > **We couldn't create this account.**
  > If you already have an account with this email, try logging in — or reset your password if you've forgotten it.
  > [Log in] [Reset password]
  (Two `ArrowLink` or `secondary`/`tertiary` `Button` actions inline.)
- *Error — field validation (password mismatch, weak password, invalid email format):* standard `Input error=""` prop, per-field, `aria-invalid`+`aria-describedby` already wired by the component.
- *Success:* transitions immediately to Screen C — no separate success screen for account creation itself, since verification is the actual milestone.

### Screen C — "Check Your Email" Confirmation
- `SectionHeading` — title: "Check your email", subtitle rendered as body text, not subtitle prop (needs the interpolated address): "We've sent a verification link to **thabo@example.com**. It usually arrives within a couple of minutes."
- Primary visual: a simple envelope/mail glyph (no new component needed — treat as decorative icon inline with heading).
- `Button variant="secondary" fullWidth` — "Resend email" — rate-limited with a visible cooldown. Cooldown rendered as replacing the button label with disabled state text: "Resend available in 0:47" (countdown), reverting to the enabled "Resend email" button at zero. This is a plain disabled-`Button` state, not a new component.
- `ArrowLink tone="muted"` — "Wrong email? Go back" — returns to Screen B with fields preserved.
- **States:** *default* (as above); *resend-loading* (`Button loading`); *resend-success* — brief inline confirmation text under the button: "Email sent again." (auto-dismisses after a few seconds, or persists until next resend — implementation detail for `frontend-engineer`, not user-blocking either way).

### Screen D — Verification Link Opened (Deep Link / Web Fallback)
- *Success case:* Full-screen confirmation, `success`/`success-light` accent on a check-circle glyph, heading: "You're verified", subtitle: "Your account is ready. You can now purchase a policy or register an asset." Single `Button variant="primary" fullWidth` — "Continue" — routes to home. Screen-reader focus must land on the `h1` on mount (§6 accessibility, WCAG focus management after redirect).
- *Expired/already-used link:* heading: "This link has expired", body: "Verification links are only valid for a limited time. Request a new one and we'll send it right away." `Button variant="primary" fullWidth` — "Send a new link" (triggers resend, same rate-limit behavior as Screen C). No dead end — this screen always has a forward action.

### Screen E — Return-to-App Reminder (pending_verification session, persistent-but-dismissible)
- **[NEW: Alert/banner, tone=info, dismissible]** docked at the top of the home/app-shell screen (not a blocking modal — user can dismiss and keep browsing):
  > **Verify your email to unlock full access.** Check thabo@example.com for the link, or [Resend email].
- Dismiss (×) is a genuine dismiss, not a "verify later, never see again" — it should reappear on next app open if still unverified (frontend behavior note, not a new screen).

**Responsive:** Screens B–E are mobile-only per scope (Customer Mobile App); no desktop breakpoint required. If the app ships a responsive web fallback for the deep-link case (Screen D), reuse the same single-column layout centered in a max-w-sm column against `background`, no `Card` wrapper — keep the mobile-native feel even on web, since this is a one-off transitional page, not a dashboard.

---

## 4.2 Customer Login, With Optional MFA (Mobile App)

### Screen A — Log In
- `SectionHeading` `as="h1"` — "Log in".
- `Input type="email" label="Email"`, `Input type="password" label="Password"`.
- `Button variant="primary" fullWidth loading` — "Log in".
- Secondary row: `ArrowLink` "Forgot password?" (right-aligned or full-width tap target below button — mobile discretion, keep ≥44pt tap height).
- Tertiary: "New here? " + `ArrowLink` "Create account".

**States:**
- *Error — incorrect credentials (AC-5):* `Input` on the password field carries a generic error, not tied to a specific field's blame:
  > "Incorrect email or password."
  (Rendered via the password `Input`'s `error` prop so it's programmatically associated per WCAG 3.3.1; visually it can sit as one shared line under the form rather than duplicated per field — `frontend-engineer` discretion on exact DOM placement as long as `aria-describedby` links it to at least one of the two fields.)
- *Approaching lockout (1 attempt remaining):* **[NEW: Alert/banner, tone=warning]** replaces the generic error, escalated copy:
  > **One more incorrect attempt will temporarily lock this account.**
  > [Reset your password now] instead?
  (`ArrowLink` or inline `Button variant="tertiary"` for the reset link.)
- *Locked out:* full-width **[NEW: Alert/banner, tone=danger]** (or interim: styled block using `Input` error red tokens until Alert ships) below the form, form fields disabled:
  > **For your security, we've paused login attempts on this account.**
  > This is temporary and clears automatically. You can reset your password right now to get back in immediately.
  > [Reset password]
  Never: "Your account has been locked." (reads punitive — explicitly avoided per `ux-research.md` §3).
- *Success, no MFA:* session issued, routes to home — no interstitial screen.
- *Success, MFA enabled:* routes to Screen B.

### Screen B — MFA Code Entry (Customer, Optional)
- `SectionHeading` — "Enter your verification code", subtitle: "Open your authenticator app and enter the 6-digit code."
- **[NEW: OTP input]** — single grouped 6-digit numeric entry, numeric keypad on mobile, auto-submit on 6th digit (no explicit "Verify" `Button` needed once auto-submit fires, but render a `Button variant="primary" fullWidth loading` "Verify" as a fallback/explicit-submit affordance for users who paste a code or have auto-submit disabled by assistive tech).
- `ArrowLink tone="muted"` below — "Trouble with your code?" → (customer MFA has no mandatory recovery-code requirement since it's optional/self-enrolled; this can link to a lightweight help article, out of scope for this document's flow detail since `ux-research.md` doesn't specify customer-side recovery mechanics — flag: if customer MFA recovery needs its own flow, that's a gap for `ux-researcher`/`authentication-engineer`, not resolved here).

**States:**
- *Error — wrong/expired code:* inline error under the OTP input (own attempt counter, explicitly not conflated with the password-attempt counter per `ux-research.md` §1.2 step 5):
  > "That code didn't work. Try again."
- *Success:* session issued, routes to home.

**Responsive:** mobile-only, single column, OTP input sized for large touch targets (≥44pt per digit segment per §6).

---

## 4.3 Customer Forgot-Password Flow (Mobile App)

### Screen A — Request Reset
- `SectionHeading` — "Reset your password", subtitle: "Enter the email on your account and we'll send you a link."
- `Input type="email" label="Email"`.
- `Button variant="primary" fullWidth loading` — "Send reset link".
- `ArrowLink reverse tone="muted"` — "Back to log in".

### Screen B — Confirmation (anti-enumeration, FR-15)
- Same-appearance regardless of whether the email exists:
  > **Check your email.**
  > If an account exists for this email, we've sent a link to reset your password.
- `Button variant="secondary" fullWidth` — "Resend" (same cooldown pattern as §4.1 Screen C).
- `ArrowLink reverse` — "Back to log in".

### Screen C — New Password Form (from reset link)
- `SectionHeading` — "Set a new password".
- `Input type="password" label="New password"` with the same real-time strength feedback as signup.
- `Input type="password" label="Confirm new password"`.
- `Button variant="primary" fullWidth loading` — "Reset password".

**States:**
- *Error — expired/used link:* no dead end. Heading: "This link has expired", body: "For your security, password reset links only work once and expire quickly. Request a new one." `Button variant="primary" fullWidth` — "Request a new link" (returns to Screen A pre-filled if email is known from the expired token, else blank).
- *Success — Screen D:*

### Screen D — Reset Success
- **[NEW: Alert/banner, tone=success]** or a plain success panel using `success`/`success-light` tokens:
  > **Password updated.**
  > You've been logged out of all other devices for your security. Log in again with your new password wherever you use this account.
- `Button variant="primary" fullWidth` — "Log in" — routes to §4.2 Screen A.

This explicit "logged out of all other devices" line is required per `ux-research.md` §1.3 step 7 / §3 — placed as the *first* line after the headline confirmation, not buried, so a user checking a second device isn't alarmed by an unexplained logout.

---

## 4.4 Privileged First Login: Invitation → Forced Password → Mandatory MFA Enrollment (Web — Admin / Security Company Dashboard)

Web dashboard layout throughout this flow: centered `Card` (`interactive={false}`, `padding="lg"`, `max-w-md`) on a `surface-navy-deep` full-bleed background — this establishes the "operational, institutional" register distinct from the customer app per §1, and gives Sipho (external, on a phone browser per persona) a layout that still centers and reads correctly at narrow widths (`Card` collapses to near-full-width with side gutters below `sm` breakpoint).

### Screen A — Invitation Acceptance
- `CardHeader title="You're invited"` (no icon needed).
- `CardBody`:
  - Read-only display of invited email — rendered as static text, not an `Input` (cannot be changed here): "Invited email: **naledi@tdit.co.za**".
  - For security-company operators only: an org-confirmation line building the anti-phishing trust `ux-research.md` §3 calls out: "You're joining as an operator for **[Partner Org Name]**." Rendered as a `Badge tone="neutral"` chip next to or below the org name for visual emphasis, or plainly as bold text if a `Badge` reads as odd for a proper-noun org name — `frontend-engineer` discretion; the requirement is *visibility*, not a specific component.
  - `Input type="password" label="Create a password"` + strength feedback (same pattern as customer signup).
  - `Input type="password" label="Confirm password"`.
- `CardFooter`: `Button variant="primary" fullWidth loading` — "Continue" — no "skip" or "later" option present anywhere on this screen (BR-4, AC-7 — no path to defer).

**States:**
- *Error — expired/used invitation link:* Screen replaced entirely (not a form error) with a dead-end-avoidant message, since there is deliberately no self-service resend for privileged roles (BR-3):
  > **This invitation link is no longer valid.**
  > Invitation links expire for security. Contact [the admin/team who invited you] to request a new one.
  (Copy must be filled with the actual inviting admin's name/contact if the system has it — if not available, fall back to a named support channel: "Contact your organization's TD IT Solutions administrator, or [support@tditsolutions.co.za / support line] if you're unsure who that is." — flagged: exact contact-resolution logic is a `business-analyst`/`authentication-engineer` question, not decided here; this document specifies the *messaging pattern*, not the data source.)
  - No form, no dismiss into the app — this is a genuine one-way dead-end screen (there is nowhere else the invitee can go, correctly, since self-service resend is intentionally excluded per BR-3).

### Screen B — MFA Enrollment (QR + Manual Key)
- `CardHeader title="Set up your authenticator app"` — subtitle rendered in `CardBody` above the QR, calibrated to the **lower-digital-literacy audience** (Sipho) since this is the *same screen* for both Naledi and Sipho per `ux-research.md` §2.3's flag that copy tone needs to work for both without a second screen variant:
  > "This adds a second layer of security to your account. You'll need an authenticator app — a free app on your phone (like Google Authenticator, Microsoft Authenticator, or Authy) that generates a new code every 30 seconds. If you don't have one yet, install one from your phone's app store before continuing."
- **[NEW: MFA QR display]** — QR code image, with the manual entry key rendered as selectable/copyable plain text directly beneath it (never QR-only, per `ux-research.md` §4 accessibility requirement):
  > "Can't scan? Enter this key manually: `XXXX XXXX XXXX XXXX`" [Copy]
- Below: **[NEW: OTP input]** — "Enter the 6-digit code from your app to confirm."
- `Button variant="primary" fullWidth loading` — "Verify and continue".

**States:**
- *Error — wrong code at enrollment:* inline retry, explicitly **no attempt-count lockout at this step** (`ux-research.md` §1.4 step 8 — this is setup, not a login attempt):
  > "That code didn't match. Double-check the time on your phone is correct, and try the latest code shown in your app."
- *Success:* proceeds to Screen C.

### Screen C — Recovery Codes: **removed, resolved**

~~Originally specified as a recovery-code display screen, pending confirmation.~~ **Resolved by `design-system-manager` (`design-system-additions.md` §0):** the recovery-code display component is rejected outright, not merely rescoped — the platform owner's support-assisted-manual-reset ruling covers *both* the compound-lockout case (§4.9) *and* the single-factor case (MFA device lost, password still known). There is no self-service backup-code mechanism anywhere in this feature. Screen C is **skipped entirely** — enrollment success (Screen B) routes directly to Screen D (dashboard home).

The moment this screen would have occupied — telling the user what to do if they later lose the device — moves to a one-line `Alert` (tone `info`) appended to the end of Screen D instead of a dedicated screen:
> "If you ever lose access to your authenticator, contact your administrator or [support] to regain access — there's no recovery code to save."

### Screen D — Enrollment Complete → Dashboard Home
- Brief success confirmation (reuse the `success`/`success-light` pattern from §4.3 Screen D) before landing on dashboard home: "You're all set. Your account is ready to use."
- Append the `Alert` (tone `info`) described above, once, on first landing after enrollment — not shown again on subsequent dashboard visits.

**Responsive:** Web-first (Admin Dashboard is desktop-primary), but must degrade gracefully to a single-column narrow layout for Sipho's phone-browser use case per persona — `Card` at `max-w-md` centers correctly at both breakpoints without a separate mobile-specific layout; QR display component must remain legible/scannable at narrow width (min rendered size to be specified by `design-system-manager` alongside the component itself).

---

## 4.5 Privileged Login With Mandatory MFA Challenge (Web — Admin / Security Company Dashboard)

### Screen A — Log In
- Same `Card`-on-`surface-navy-deep` layout as §4.4.
- `CardHeader title="Log in"` — **no signup link anywhere on this screen** (AC-12 — this is a hard omission, not an oversight; `manual-qa-engineer` should test for its explicit *absence*).
- `Input type="email" label="Work email"`, `Input type="password" label="Password"`.
- `Button variant="primary" fullWidth loading` — "Log in".
- `ArrowLink` — "Forgot password?"

**States:** identical error/lockout pattern to §4.2 Screen A (generic incorrect-credentials message, escalating pre-lockout warning, non-punitive lockout message) — reuse copy verbatim, adjusted only for the lockout message's privileged-role addendum:
> "For your security, we've paused login attempts on this account. This is temporary and clears automatically. You can reset your password right now to get back in immediately. If that doesn't resolve it, contact your administrator or [support]."

### Screen B — MFA Challenge (Mandatory, Every Login)
- Identical composition to §4.2 Screen B ([NEW: OTP input], auto-submit), with one addition: a persistently visible secondary link beneath the OTP input:
  > `ArrowLink tone="muted"` — "Can't access your authenticator?"
- This link is **always present on this screen**, not conditionally revealed after a failed attempt — per `ux-research.md` §1.5 step 7's "hard flag, not a nice-to-have," a locked-out privileged user must never have to fail first to discover an escape path.
- Destination: the same support-escalation screen pattern as §4.9 (`Alert` tone `warning`, "contact your administrator" action) — resolved per `design-system-manager`'s §0 ruling, no recovery-code entry path exists.

**States:**
- *Error — wrong MFA code:* inline retry; this **is** a login attempt (unlike enrollment), so standard rate-limiting applies (`ux-research.md` §1.5 step 6):
  > "That code didn't work. Try again."
  Approaching-lockout and locked-out escalation copy mirrors §4.2 Screen A's pattern, applied to the MFA-attempt counter specifically (kept separate from the password-attempt counter, consistent with the customer flow's separation).
- *Success:* dashboard home loads.

**Responsive:** same as §4.4.

---

## 4.6 Privileged Password Reset With MFA Re-Verification (Web)

### Screens A–C — Request → Confirmation → New Password
- Identical composition and copy to §4.3 Screens A–C, on the `Card`-on-`surface-navy-deep` web layout instead of the mobile full-bleed layout.

### Screen D — MFA Re-Verification (the meaningful divergence from customer flow)
- This screen must be **visually and copy-distinguished** from the customer reset flow so it does not read as a bug (`ux-research.md` §1.6 step 4's explicit concern: "wait, I already reset my password, why is it asking for a code now?").
- `CardHeader title="One more step — verify it's you"` — subtitle directly answers the "why now" confusion pre-emptively, before the user has a chance to be confused:
  > "For privileged accounts, we always confirm your identity with your authenticator app — even right after a password reset. This keeps your account secure if someone else gained access to your email."
- [NEW: OTP input], `Button variant="primary" fullWidth loading` — "Verify and finish reset".
- Below: same "Can't access your authenticator?" `ArrowLink` as §4.5 Screen B — this is the entry point into §4.9 for the compound-lockout case (§1.6 step 6).

**States:**
- *Error — wrong code:* standard retry pattern, rate-limited (this is functionally a login-adjacent security check).
- *Success — Screen E:*

### Screen E — Reset Complete
- Same pattern as §4.3 Screen D (success tokens, explicit "logged out of all other devices" line first), with the finalization framed as complete only after MFA: "Your password has been reset and your identity verified. You've been logged out of all other devices for your security."
- `Button variant="primary" fullWidth` — "Log in".

**Responsive:** same as §4.4/§4.5.

---

## 4.7 Logout (All Surfaces)

### Web (Admin / Security Company Dashboard)
- Trigger: account/profile menu — `Avatar size="sm"` in the top nav, opens a small dropdown with "Log out" as the last item (visually separated from other menu items by a hairline divider, per `border`/`hairline` tokens).
- Optional lightweight confirmation (per `ux-research.md` §1.7 step 2, explicitly `ui-designer` discretion, not a hard requirement): **recommendation — include it on web only**, as a small inline confirm-in-place (menu item becomes "Confirm log out?" on first click, executes on second click) rather than a modal — avoids modal-fatigue on a persistent nav item while still guarding against accidental clicks. No confirmation on mobile (nested deeper, less likely to be an accidental tap, per the same guidance).
- On confirm: immediate redirect to the surface's login screen — no flash of stale dashboard data (frontend implementation requirement, not a visual spec item, but called out here since it's explicitly required by AC-8/FR-13).

### Mobile App
- Trigger: profile/account screen, "Log out" as a `Button variant="tertiary"` or plain list row — no confirmation step.
- Immediate redirect to welcome/login screen.

### Idle-Timeout Logout (Web dashboards, FR-21 — not user-initiated)
- On the user's next action after an idle timeout, the login screen (§4.5 Screen A) renders with a **[NEW: Alert/banner, tone=info]** docked above the form:
  > "You were logged out due to inactivity. Log in again to continue."
- This must appear identically whether idle-timeout or manual logout triggered the redirect is visually distinct — i.e., manual logout routes to the *plain* login screen (no banner), idle-timeout routes to the *same* login screen *with* this banner. The distinction itself is the point (`ux-research.md` §1.7 step 4 / §3): an unexplained logout must always self-explain.

---

## 4.8 BR-2 Verification-Gate Block (Mobile App)

Triggered when a `pending_verification` customer taps into a policy-purchase or asset-registration entry point (those entry points are out of scope; only the block screen/modal itself is specified).

- Rendered as a bottom-sheet-style panel or full-screen interstitial (mobile pattern, `frontend-engineer`/`mobile-engineer` choice of presentation mechanism; content spec is fixed regardless):
  - Heading (deliberately **not** "Access Denied" or "Unavailable"): **"One more step before you can do that"**
  - Body: "Verify your email to unlock policy purchases and asset registration. We sent a link to **thabo@example.com** — check your inbox, or resend it below."
  - Primary: `Button variant="primary" fullWidth` — "Resend verification email".
  - Secondary: `Button variant="tertiary" fullWidth` — "Back" — returns the user to what they were doing; this screen never traps the user (`ux-research.md` §1.8 step 3).
- Tone check: no red/danger coloring on this screen at all — this is a routine, expected state for a brand-new account, not an error. Use `primary`/neutral tokens only, matching the same visual register as §4.1 Screen C ("Check your email"), reinforcing that this is a continuation of the same expected step, not a new problem.

**States:**
- *Default* (as above).
- *Resend loading/success:* identical pattern to §4.1 Screen C.
- Once verified (via the email link elsewhere), the next time this entry point is tapped, the block simply does not render — no manual "refresh my status" affordance needed on this screen itself (automatic on next navigation, per AC-3/§1.8 step 4).

**Responsive:** mobile-only.

---

## 4.9 Compound Lockout — Support-Assisted Manual Reset (Web — Admin / Security Company Dashboard)

**Design ruling applied here (per this task's explicit brief):** the platform owner has ruled that the compound-lockout case (privileged user has lost both password and MFA device) resolves via **support-assisted manual reset**. This screen is therefore designed as a clear, dead-end-avoidant **contact-support screen**, not a self-service recovery-code flow. This directly satisfies `ux-research.md` §3's non-negotiable requirement that this scenario never be a silent dead end, while resolving the flow definitively rather than leaving it as an open placeholder.

**Entry points:** the "Can't access your authenticator?" link on §4.5 Screen B and §4.6 Screen D, specifically for a user who indicates (via a single first-step choice, see below) that they *also* don't have password access — as well as directly, if a user's password reset link itself has expired and they no longer have MFA either.

### Screen — "We need to verify you a different way"
- `CardHeader title="Let's get you back in"` — deliberately warm, not alarmed; this is the single highest-anxiety moment in the feature per `ux-research.md` §3, and the copy must not amplify that anxiety with clinical/security-jargon framing.
- `CardBody`:
  > "It looks like you don't have access to your password or your authenticator app right now. For your account's security, we can't reset both at once automatically — but our team can verify your identity and help you back in."
  - For **admin** accounts: "Contact [named internal process / IT security contact — placeholder pending `cybersecurity-architect`'s defined internal process] to begin identity verification."
  - For **security-company operator** and **support agent** accounts: "Contact your organization's TD IT Solutions administrator, or reach our support team directly: [support@tditsolutions.co.za] / [support phone number, if one exists]."
  - A single, unmissable, always-visible support-channel block — not buried in a help center link, consistent with `ux-research.md`'s Best Practice of "an always-visible support escalation" for high-stress flows.
- No form fields on this screen — nothing to submit, since self-service is explicitly not the resolution path here. `frontend-engineer` note: resist the urge to add a "describe your issue" textarea "since we're already here" — that would silently reintroduce a self-service-shaped flow the platform owner explicitly ruled out; if a ticket-creation step is wanted, it belongs to a future Support Portal feature, not bolted on here.
- Single action: `Button variant="secondary" fullWidth` — "Back to log in" (does not resolve anything, just lets the user leave the screen rather than being trapped — mirrors §4.8's "never trap the user" principle even on a screen with no self-service resolution).

**Exact contact-channel copy is a placeholder pending `authentication-engineer`/`cybersecurity-architect`'s defined internal process** (flagged verbatim from `ux-research.md` §1.6 step 6) — the *layout and tone* are final; the specific contact method/routing logic is not decided by this document.

**States:** static screen, no loading/error states (no network action originates here beyond the "Back to log in" navigation).

**Responsive:** same `Card`-on-`surface-navy-deep` web layout as §4.4–4.6; must remain legible on Sipho's phone-browser use case — this is arguably the single moment Sipho is most likely to be using a phone in a stressful context, so the support contact info (email/phone) should render as tappable `tel:`/`mailto:` links on narrow viewports, not plain unstyled text.

---

## 5. Status/State Coverage Matrix (cross-flow reference)

Per this role's Pre-Approval Checklist requirement to document default/hover/focus/error/loading/empty states per component used:

| Component | Default | Loading | Error | Success | Empty | Focus |
|---|---|---|---|---|---|---|
| `Input` | label + hint | n/a (field itself doesn't load) | red-500/600 border + `aria-invalid` + linked message | n/a (no built-in success state — rely on screen-level success, not per-field) | placeholder text | existing blue-600 border + soft ring (component default — reused, not redefined) |
| `Button` (primary submit) | enabled, `primary` gradient | `loading` prop — spinner + `aria-busy`, disabled | n/a (errors render as `Input`/`Alert` content, not on the button itself) | n/a (button unmounts/reroutes on success) | n/a | existing focus ring (component default) |
| `[NEW] OTP input` | 6 empty digit segments, cursor in first | n/a (auto-submits, then parent screen's loading state takes over) | per-digit or grouped error state — **spec owned by design-system-manager**; this doc's requirement is that it not read as "6 unlabeled inputs" to a screen reader (grouped announcement) | auto-clears/routes away on success | n/a | needs visible per-segment focus indicator — flagged to design-system-manager |
| `[NEW] Alert/banner` | tone-appropriate (info/warning/success/danger) static block | n/a | n/a (error *is* a tone of this component) | tone=success | n/a | if dismissible, close control needs its own visible focus state |
| `Badge` (existing, + pending danger/warning tone) | tone-appropriate pill | n/a | tone=danger/warning (pending) | tone=`emerald` (existing) | n/a | non-interactive, no focus state (per existing component notes) |
| `Card` | `interactive={false}` static surface | n/a | n/a (errors render inside via Input/Alert) | n/a | n/a | n/a (non-interactive) |
| `[NEW] MFA QR display` | QR image + manual key text | image-loading placeholder — spec owned by design-system-manager | QR failed to render → manual key must still be usable (this is the accessibility-critical fallback, not optional) | n/a | n/a | manual key text and "Copy" action need visible focus states |
| `[NEW] Recovery-code display` | list of codes + unchecked "I've saved these" gate | n/a | n/a | checked gate enables "Done" | n/a (pending scope confirmation, §4.4) | each code should be individually selectable; copy/download actions need focus states |

---

## 6. Accessibility Redline Summary (applies across all screens)

- Every `Input` error uses the component's existing `aria-invalid`/`aria-describedby` wiring — no new pattern introduced (per `ux-research.md` §4).
- Every screen reached via redirect (email deep link, forced first-login routing, post-MFA routing, idle-timeout redirect) must move keyboard/screen-reader focus to that screen's `h1`/`SectionHeading`/`CardHeader` on mount — flagged per-screen implicitly throughout §4, stated once here to avoid repeating it 20 times.
- OTP entry: numeric keypad (`inputmode="numeric"` equivalent) on mobile, paste support (a copied 6-digit code from an SMS/authenticator should populate all segments), and grouped screen-reader announcement (not six independently-labeled fields) — requirements for `design-system-manager`'s OTP component spec, restated here as this document's accessibility sign-off requirement on that component once built.
- QR enrollment (§4.4 Screen B) always ships with the manual-entry-key text fallback in the same screen state, never as a secondary/hidden step.
- ~~Recovery codes render as selectable/copyable text, never an image~~ — moot; no recovery-code mechanism exists in this feature (§4.4 Screen C removed, see `design-system-additions.md` §0). The underlying "never an image" principle still applies to the QR manual-entry-key fallback above.
- Tap targets ≥44×44pt on mobile screens throughout (signup, login, OTP entry, gate screen).
- Color is never the sole carrier of state — every `Badge`/`Alert` danger/warning/success instance in this document pairs the tone with an explicit text label (e.g., "One more incorrect attempt will temporarily lock this account," not a bare red dot) — consistent with the existing `Badge` component's own documented guidance.
- Generic anti-enumeration copy (signup duplicate-email, password-reset confirmation) is written to state the outcome and offer a concrete next action, never a bare "something went wrong" (WCAG 3.3.1) — verified against the exact copy blocks in §4.1 and §4.3 above.

---

## 7. Open Flags to Other Roles (carried forward, not resolved here)

- **`design-system-manager`:** five new components (§0) — this document references them by name and plain-language behavior only; visual/prop spec is theirs to own. Please confirm Badge's 4th tone naming (`danger` vs `error` vs `critical`) so copy/dev references in this doc and theirs stay aligned.
- ~~`authentication-engineer` / `cybersecurity-architect`: §4.4 Screen C (recovery codes) scope decision~~ — **resolved.** `design-system-manager`'s §0 ruling (design-system-additions.md) confirmed no recovery-code mechanism exists for either the compound-lockout case or single-factor MFA-device loss; both route to the same `Alert`-based support-escalation pattern. `cybersecurity-architect` still owns defining the actual support-assisted-reset *process* (what an admin/support agent does to verify identity and re-enroll MFA), which this document deliberately does not design — that's an operational runbook, not a UI screen.
- **`authentication-engineer` / `cybersecurity-architect`:** §4.9's exact support-contact routing (who admins contact internally) is a placeholder pending their defined process.
- **`technical-writer`:** flagged per `ux-research.md` §1.1 step 4 — the duplicate-email rejection copy in §4.1 Screen B and the compound-lockout copy in §4.9 are both trust-critical enough to warrant a dedicated copy pass beyond this draft.
- **`compliance-specialist`:** please confirm the ToS/Privacy Notice consent checkbox copy in §4.1 Screen B satisfies POPIA's unbundled-consent requirement as worded (business-requirements.md §9.2) — this document assumes it does but has not been formally reviewed by that role.
- **`product-manager`:** MFA re-prompt cadence (FR-9, `ux-research.md` §2.2/§3) affects how often Naledi hits §4.5 Screen B — this document designs for "every login" as the safe baseline per FR-9's literal text, per `ux-research.md`'s own instruction, and does not resolve the cadence tradeoff.

---

## 8. Pre-Approval Checklist (ui-designer self-review)

- [x] **Screen composed primarily from existing component library; any new component request routed to design-system-manager.** Every screen in §4.1–4.9 is built from `Input`, `Button`, `Card`/`CardHeader`/`CardBody`/`CardFooter`, `SectionHeading`, `Badge`, `ArrowLink`, `Avatar`. Five gaps (OTP input, Alert/banner, Badge danger/warning tone, Recovery-code display, MFA QR display) are named explicitly wherever used, per `ux-research.md` §5.2, and are not locally invented — `design-system-manager` owns their spec in a parallel document.
- [x] **Status/state indicators (AssetBadge, Badge) use accessible, redundant (not color-only) cues.** §6 confirms every tone-carrying element in this document pairs color with explicit text; no bare-color status indicator appears anywhere in §4.
- [x] **High-stress flows validated for minimal steps and visible support escalation.** §4.9 (compound lockout) is designed as a single-screen, always-visible support-contact dead-end per the platform-owner ruling — no self-service form reintroduced. §4.5/§4.6's "Can't access your authenticator?" link is present unconditionally, not revealed only after failure. §4.2/§4.5 lockout screens always carry a forward action (reset link), never a bare "try again later."
- [x] **Contrast ratios and tap target sizes meet WCAG 2.1 AA.** §6 specifies ≥44×44pt mobile tap targets and defers exact contrast-ratio verification to `frontend-engineer`'s implementation against existing tokens (which are presumed already AA-compliant as the shipped marketing-site system, not re-verified from scratch in this document — flag: if any *new* token is introduced by `design-system-manager` for the danger/warning tone, that token's contrast must be independently verified before ship, called out explicitly since it's new, not inherited).
- [x] **Design reviewed against brand tone: premium, trustworthy, calm.** §1 sets the direction (reused tokens only, no new palette, `surface-navy` distinguishing privileged surfaces); every high-anxiety copy block in §4 was checked against `ux-research.md` §3's "state what happened, why, next action" pattern and avoids punitive/alarmist headline language throughout (verified line-by-line in §4.2, §4.3, §4.8, §4.9).
- [ ] **Mockup reviewed against ux-researcher's journey map/persona findings.** Self-checked against `ux-research.md` §1/§2/§3/§4/§5 throughout this document's drafting, but not yet reviewed *by* `ux-researcher` directly — recommend a short validation pass before this moves to Stage 5 intake, per that role's own Stage 3 checklist recommendation of moderated usability testing on the signup, MFA-enrollment, and compound-lockout screens specifically.
- [ ] **Redline/handoff spec includes states (default, hover, focus, error, loading, empty) for each component used.** §5's matrix covers default/loading/error/success/empty/focus at the component level; **hover states are not separately itemized** in this document — existing components (`Button`, `Card`, `ArrowLink`) already define their own hover treatments in their respective Context.md files and are reused as-is, not redefined here, so this is a partial-not-full check: hover is inherited, not newly specified, which is intentional but should be confirmed acceptable to `frontend-engineer` rather than assumed.
- [ ] **Sign-off obtained from product-manager (or delegate) before Development handoff.** Not yet obtained — this document is the artifact submitted for that sign-off.

**Net status:** Eight (nine, counting the compound-lockout flow called out separately in the task brief) screens/flows specified end-to-end using existing components wherever possible. One checklist item is intentionally left unchecked and disclosed above (product-manager sign-off) rather than self-certified, consistent with this role's charter that final sign-off is not unilateral. Both the compound-lockout screen (§4.9) and the narrower single-factor-MFA-loss path (§4.4/§4.5) are now fully resolved per `design-system-manager`'s §0 ruling — no recovery-code mechanism exists anywhere in this feature, and neither is an open placeholder anymore. The remaining open item is the support-assisted-reset *process* itself, owned by `cybersecurity-architect`, which is an operational runbook outside this document's scope.
