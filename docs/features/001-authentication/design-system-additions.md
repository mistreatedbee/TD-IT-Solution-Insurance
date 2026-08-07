# Design System Additions — Feature 001 (Authentication)

**Lifecycle stage:** 4 — UI Design (design-system sign-off, informing `ui-designer`'s mockups)
**Stage owner (A) for this document:** `design-system-manager`
**Consulted:** `cybersecurity-architect` (recovery/reset scoping — see §0), `ux-researcher` (source flows/accessibility)
**Input artifacts:** [`ux-research.md`](./ux-research.md) §5.2 (component flags), §1, §4 (flows/accessibility), [ADR-0002](../../organization/adr/0002-polyglot-persistence-identity-vs-domain-data.md) (Accepted), `src/components/Badge`, `src/components/Card`, `src/components/Input` (house style reference)
**Status:** Draft — spec/sign-off only. **No component code is implemented by this document.** Feeds `ui-designer`'s mockups now; implementation happens at Stage 9 by `frontend-engineer` against this spec, reviewed by `design-system-manager`.

---

## 0. Re-scoping decision: recovery-code display component — REJECTED (not needed)

`ux-research.md` §5.2 item 4 flagged a "recovery-code display component" for §1.4 step 9 (backup codes issued at MFA enrollment as the self-service path back in if a privileged user later loses their authenticator device), explicitly co-flagged for `cybersecurity-architect` review.

**The platform owner has since ruled that the compound-lockout case (privileged user loses both password and MFA device) resolves via support-assisted manual reset, not self-service backup codes.** This directly answers the open dependency `ux-research.md` §5.3 and §1.4 step 9 flagged as unconfirmed ("UX assumes [recovery codes] exist; if it doesn't, step 9 must be redesigned").

Re-scoping this component against that ruling:

- **Backup/recovery codes as a recovery *mechanism* are explicitly rejected**, not merely deferred. There is no self-service path back into a privileged account that has lost both factors — recovery in that case is a human-mediated support/admin action outside this UI (an operational process, not a component).
- The narrower question — does §1.4 step 9's *enrollment-completion* moment still need something? — is **no**. Backup codes were the only reason a copy-once-secret display component existed in scope. With backup codes off the table as a mechanism, there is nothing left for this component to display. It is not being rescoped into a smaller version; it is dropped entirely.
- **Consequence for `ux-research.md` §1.4:** step 9 as written ("present a set of one-time backup/recovery codes... download/copy action") is now stale and must be redesigned by `ui-designer`, not implemented as drafted. The enrollment success screen (step 7) still needs a moment that tells the user what to do if they later lose the device — but that content is a **copy/informational message**, not a secret-display component: it should state that device loss is resolved via an administrator/support-initiated reset, and point Sipho-type users (§2.3, lower-digital-literacy, no easy internal support contact) at *who* to contact. This is a job for the **Alert/status component (§2 below)**, tone `info`, not a new component.
- **Consequence for `ux-research.md` §1.5 step 7 and §1.6 step 6** ("Can't access your authenticator?" / compound lockout): these screens no longer route to recovery-code entry. They route to a support-escalation message — again, the **Alert component**, tone `warning` or `danger` as appropriate, with a concrete next action (contact admin/support), not a code-entry form. `ui-designer` should design this as static informational content, not a functional recovery flow, since there is no self-service mechanism behind it.
- **Why this is a rejection, not a deferral:** `design-system-manager`'s Pre-Approval Checklist requires "documented reasoning" whenever a flagged UI need does *not* become a component. The reasoning here is that the underlying mechanism the component would have displayed (self-service backup codes) was authoritatively rejected by the platform owner in favor of a process (support-assisted reset) that has no UI surface of its own beyond a status message. Building a recovery-code display component now would be building UI for a mechanism the platform has decided not to offer — exactly the "component built for a flow that doesn't exist" anti-pattern this role exists to prevent.
- **Flag for `cybersecurity-architect`:** confirm the support-assisted manual reset *process* (identity verification steps an admin/support agent must perform before resetting a privileged account with both factors lost) — that process design is outside this document's scope (it's operational/backend, not a UI component), but the UI's copy on the escalation message (§1.5 step 7, §1.6 step 6) should not promise a specific SLA or process detail until that process is defined, to avoid the UI over-committing on behalf of a process not yet specified.

**Net: of the 5 flagged needs, 4 proceed (specified below); 1 (recovery-code display) is rejected and removed from scope.**

---

## 1. OTP / MFA Code Input

**New standalone component.** No existing component covers numeric, segmented, auto-advancing code entry — `Input`'s current variant list (`text | email | tel | url | password | textarea`) has no fit (per `ux-research.md` §5.1). This is not a variant of `Input`: the interaction model (segmented digit boxes, auto-advance, auto-submit, paste-splitting) is fundamentally different from a single-field text input, and forcing it into `Input`'s API would bloat that component's props with OTP-only concerns unrelated to its other seven consumers.

### Flows requiring it
- `ux-research.md` §1.2 step 5 — customer optional-MFA login challenge.
- §1.4 step 6 — MFA enrollment confirmation code (invitation-driven admin/operator/support first login).
- §1.5 step 4 — privileged mandatory MFA challenge at every login.
- §1.6 step 4 — MFA re-verification during privileged password reset.

### Proposed name
`OtpInput` (`src/components/OtpInput`).

### Prop interface

```ts
export type OtpInputStatus = 'idle' | 'error' | 'success';

export interface OtpInputProps {
  /** Visible label text. Required for accessibility — announced once for the whole group, not per digit. */
  label: string;
  /** Number of digits/segments. */
  length?: number; // default 6, per §1.2/§1.4/§1.5/§1.6's "6-digit code"
  /** Controlled value (string of digits entered so far, may be shorter than `length`). */
  value: string;
  /** Called on every change with the accumulated value. */
  onChange: (value: string) => void;
  /** Called automatically once `value.length === length` — the auto-submit behavior §1.2 step 5 requires. */
  onComplete?: (value: string) => void;
  /** Validation/result state. `error` renders red per-digit outline + error text below; `success` is optional (e.g. brief confirm flash before redirect). */
  status?: OtpInputStatus;
  /** Message shown below the group — required when `status === 'error'` (mirrors Input's error/hint pattern; wired via aria-describedby, not a floating unassociated caption). */
  message?: string;
  /** Disables all segments (e.g. while a verify request is in flight). */
  disabled?: boolean;
  /** Shows a busy/aria-busy state distinct from disabled, for the moment between auto-submit and server response. */
  loading?: boolean;
  /** Autofocus the first empty segment on mount. */
  autoFocus?: boolean;
  className?: string;
}
```

### Variants/states
- **Idle** — empty/partially filled, default border, numeric keypad triggered on mobile (`inputMode="numeric"`, `pattern="[0-9]*"`).
- **Filled/auto-submit** — on reaching `length` digits, fires `onComplete` without requiring a separate submit tap (§1.2 step 5: "auto-submit on 6 digits").
- **Error** — per-digit red outline + associated message text below the group (not a separate, disconnected error), matching `Input`'s `error` treatment. Per `ux-research.md` §1.2 step 5's explicit instruction: MFA-code errors must use their **own** retry/error state, never share a counter or visual treatment implying the same lockout mechanism as password attempts — this must be a distinguishable message copy responsibility for `ui-designer`, not something the component enforces, but the component must support independent, non-conflated error state per use.
- **Loading/verifying** — segments disabled, `aria-busy="true"` on the group container, brief pending affordance (spinner or dimmed state) between auto-submit and server response — mirrors the `Button` `loading` convention `ux-research.md` §5.1 calls out for submit actions.
- **Disabled** — all segments non-interactic (e.g., after max attempts, pending redirect).
- **Paste support** — pasting a 6-digit string into any segment must distribute across all segments and trigger `onComplete`, per §5.2 item 1's requirement ("paste support").

### Accessibility requirements (from `ux-research.md` §4)
- The group must be announced as a single, related unit to screen readers — "screen-reader-friendly grouping (not six unlabeled single-character inputs with no relationship announced)" (§5.2 item 1). Implementation approach: wrap segments in a `role="group"` with `aria-label` matching `label`, or use a single visually-segmented input with `aria-label` — visual segmentation is a CSS/rendering concern, not a requirement for six separate DOM inputs; `frontend-engineer` should choose whichever underlying DOM shape best satisfies this grouping requirement at implementation, but the *contract* (announced as one relationship, not six disconnected fields) is fixed by this spec.
- Error message programmatically associated via `aria-describedby`, consistent with `Input`'s pattern (§4: "every new auth-specific field... must follow the same association pattern").
- `inputMode="numeric"` for mobile numeric keypad (§5.2 item 1: "numeric keypad on mobile").
- Does not rely on color alone for error state — accompanies red outline with the associated text message (§4: "Lockout/error states must not rely on color alone").
- Focus management: on mount within a redirect-heavy flow (post-login MFA interstitial), focus must move to this component's heading/first segment, not be left stranded (§4, final bullet).

### Design tokens
- Border/ring colors reuse existing `Input` state tokens: default `border-slate-300`, focus `focus:border-blue-600 focus:ring-blue-500/30`, error `border-red-500 focus:ring-red-200` — no new color values introduced.
- Success flash (optional) reuses `Badge`'s existing `emerald` tone family (`emerald-600`/`emerald-50`) rather than inventing a new green.
- Typography: numeric digits at `text-lg font-semibold` (larger than standard `Input` text, since these are individually glanceable digits) — a new type-scale usage, not a new token; confirm against existing `text-lg` utility already used elsewhere in the library before treating as novel.

### Web vs. Expo RN parity note
Segmented OTP entry is a well-established native pattern (RN has multiple accessible OTP-input implementations); the *contract* above (props, states, grouping requirement) is written platform-agnostically so `mobile-engineer` can implement a native equivalent against the same `value`/`onChange`/`onComplete`/`status` contract rather than inventing a divergent API.

---

## 2. Alert / Status Message

**New standalone component.** No existing component expresses severity/tone for a persistent message block — `Card` can act as a container but has no concept of info/success/warning/danger tone (per `ux-research.md` §5.2 item 2). This is broader than Feature 001; per §5.2's own recommendation ("Recommend checking whether this is more broadly needed across other future features before building it just for auth — likely yes"), this is specified as a general-purpose system component, not an auth-only one.

### Flows requiring it
- §1.1 step 9 — persistent-but-dismissible unverified-account reminder.
- §1.8 — BR-2 commerce-gate block message (states why + how, non-punitive tone).
- §1.3 step 7 / §1.7 step 4 — "logged out of all other devices" / "logged out due to inactivity" confirmations.
- §1.2 step 6 — pre-lockout escalation warning ("one more incorrect attempt...").
- §1.2 step 7 / §1.5 step 8 — lockout messaging (non-punitive, temporary, with a next action).
- §1.5 step 7 / §1.6 step 6 (re-scoped per §0 above) — lost-authenticator / compound-lockout support-escalation message.
- §1.1 step 10 / §1.3 step 8 / §1.4 step 10 — expired/used-link messaging with a recovery action.

### Proposed name
`Alert` (`src/components/Alert`).

### Prop interface

```ts
export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  /** Severity/tone. Drives icon, color, and (via aria-live wiring) urgency of announcement. */
  tone: AlertTone;
  /** Short bolded lead-in, e.g. "Verify your email". Optional — some messages (logout confirmations) may be a single sentence with no separate title. */
  title?: string;
  /** Body content. Plain text or short inline markup (links, e.g. "Resend verification email"). */
  children: React.ReactNode;
  /** Renders a close (X) affordance; required for §1.1 step 9's "persistent-but-dismissible" reminder. */
  dismissible?: boolean;
  /** Called when the user dismisses. Only meaningful when dismissible. */
  onDismiss?: () => void;
  /** Optional inline action (e.g. a Button or ArrowLink) rendered at the end of the message — "Resend email", "Reset password", "Contact your administrator". */
  action?: React.ReactNode;
  /** Icon override; defaults to a tone-appropriate icon (info/check/triangle/octagon) if omitted. */
  icon?: React.ReactNode;
  className?: string;
}
```

### Variants/states
- **`info`** — neutral/blue, e.g. §1.1 step 9's reminder, §1.8's gate message ("must not shame or alarm... this is a routine, expected state," per ux-research.md §1.8 step 2 — `info`, not `warning`, is the correct tone for BR-2's gate specifically, despite it being a functional block, precisely because the copy tone must not read as an error).
- **`success`** — emerald, e.g. successful verification, successful password reset confirmation.
- **`warning`** — amber, e.g. §1.2 step 6's pre-lockout escalation, §1.6 step 4's "you're being asked for MFA again after resetting your password, this is expected" divergence-callout.
- **`danger`** — red, e.g. §1.2 step 7 / §1.5 step 8 lockout state (still must read as "temporary, non-punitive" per copy — tone communicates severity, copy carries the reassurance; the component enforces neither on its own, per §4's "color alone should not convey meaning").
- **Dismissible vs. persistent** — §1.1 step 9 requires dismissible; §1.8's gate and lockout messages are not dismissible (they gate a real block, dismissing must not fake-resolve it).
- **With/without inline action** — most flows in §1 pair the message with a concrete next step (Resend, Reset password, Contact administrator) rather than a bare statement — the `action` slot is not optional in practice for any of the flagged flows except pure success confirmations.

### Accessibility requirements (from `ux-research.md` §4)
- **Color alone must not convey severity** (§4: "consistent with the existing Badge component's own guidance note... apply the same principle to new error/warning states") — every tone ships a distinct icon (not just a color swatch) and the message copy itself must state the severity/outcome in words, not rely on the container color; `ui-designer` is responsible for copy that doesn't just say "Notice" for every tone.
- **`role` and `aria-live` wiring**: `warning`/`danger` tones that appear without a page navigation (e.g., §1.2 step 6's escalation appearing inline after a failed attempt) must use `role="alert"`/`aria-live="assertive"` so screen-reader users are interrupted appropriately; `info`/`success` tones that accompany a full page/screen change can use `role="status"`/`aria-live="polite"` since the screen reader will already encounter them via normal reading order. This distinction is a component-level default keyed off `tone`, not something each consuming screen re-derives.
- **Actionable, specific copy** — per §4's WCAG 3.3.1 note ("something went wrong" fails error identification even while correctly avoiding enumeration): the component's `children`/`action` API is intentionally structured to make omitting a concrete next step awkward, but cannot force `ui-designer`/`technical-writer` to write good copy — this is a documented usage guidance item for Context.md, not an enforceable prop constraint.
- **Focus management** on a blocking gate variant (§1.8): when the Alert renders as the primary content of a redirect (not an inline banner on an existing screen), the screen's heading/Alert title must receive focus, per §4's final bullet — this is a page-level responsibility `ui-designer`/`frontend-engineer` must implement, noted here so it isn't silently missed because "the component looks the same either way."
- **Dismiss control** must be a real, keyboard-operable button (not a div with a click handler) with an `aria-label` (e.g. "Dismiss"), consistent with the `Button` component's existing keyboard/focus handling.

### Design tokens
New tone-to-color mapping, matching Tailwind palette usage conventions already established elsewhere in the library (`Badge`'s `emerald`, `Input`'s `red`, and the codebase's existing `amber` usage for gold/warning-adjacent treatments):

| Tone | Background | Text | Ring/border | Icon |
|---|---|---|---|---|
| `info` | `bg-blue-50` | `text-blue-800` | `ring-blue-200` | `text-blue-600` |
| `success` | `bg-emerald-50` | `text-emerald-800` | `ring-emerald-200` | `text-emerald-600` (reuses `Badge`'s existing `emerald` tone values exactly) |
| `warning` | `bg-amber-50` | `text-amber-800` | `ring-amber-200` | `text-amber-600` (reuses `Badge`'s existing `gold`/amber tone values exactly) |
| `danger` | `bg-red-50` | `text-red-800` | `ring-red-200` | `text-red-600` (new — matches `Input`'s existing `error` red, `border-red-500`/`text-red-600`, not a new red) |

No new hex values are introduced — every tone maps onto a Tailwind slate/blue/emerald/amber/red family already present in `Badge`, `Input`, or `Card`'s hover-accent usage. This satisfies the Pre-Approval Checklist's "all visual values trace to design tokens" requirement without requiring a new token file; it does mean `danger` red should be formally added to the shared token vocabulary alongside `Badge`'s tones (see §3 below — the two should share one red definition, not define it twice).

---

## 3. Badge — add `danger` and `warning` tones (extension, not new component)

**Extension of the existing `Badge` component**, not a new component. Confirmed against `src/components/Badge/index.tsx`: current `BadgeTone` is `'neutral' | 'gold' | 'emerald'` — no error/danger/warning tone exists, exactly as `ux-research.md` §5.2 item 3 flagged.

### Flows requiring it
`ux-research.md` §5.1 notes Badge's own auth-adjacent use is mostly forward-looking ("account-state indicator in a future admin-facing account list, out of scope for this feature's own UI") rather than a hard requirement inside Feature 001's own screens. However, this extension is approved now (rather than deferred) because:
1. The `Alert` component's `danger` tone (§2 above) should share a single red-token definition with `Badge`'s new `danger` tone rather than two independently-invented reds — sequencing them together avoids token drift.
2. `Badge` is very likely to be used for account-state chips (`pending_verification`, `suspended`, `locked`) the moment any admin-facing account list is built (RBAC/account-management features, adjacent to this one) — building the tone now, while the red/amber values are already being defined for `Alert`, is cheaper than a second pass later.

### Updated prop interface

```ts
export type BadgeTone = 'neutral' | 'gold' | 'emerald' | 'warning' | 'danger';
```

`gold` is retained as-is (existing semantic: plan/accent highlights) — it is not renamed to `warning`; `warning` is a new, distinct tone for caution/at-risk states (e.g., a future "MFA not enrolled" or "verification pending" chip), separate from `gold`'s promotional/accent use. This avoids a breaking rename of `gold`'s existing meaning across the marketing site.

### New tone classes (mirrors existing `toneClasses` shape in `src/components/Badge/index.tsx`)

```ts
warning: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
danger:  'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200'
```

Note `warning` here is functionally identical to `gold`'s current values — intentional (both trace to the same amber token family) but kept as separate named tones since their *semantic* use differs (accent/promotional vs. caution), and a future token pass may legitimately want to split their literal values apart without that being a breaking rename for either consumer.

### Accessibility requirements
Unchanged from `Badge`'s existing documented guidance (`Context.md`): "color alone should not convey meaning; keep the label descriptive." Applies identically to the two new tones — a `danger`-toned "Suspended" badge must say "Suspended," not rely on red alone.

### Versioning
Additive, non-breaking change — new enum members, no removed/renamed values, no change to existing tone rendering. Ships as a minor version bump per this role's versioning policy (no deprecation window needed since nothing existing is altered).

---

## 4. QR Code Display (MFA enrollment)

**New standalone component**, but intentionally thin — per `ux-research.md` §5.2 item 5's own framing ("likely a thin wrapper... given it's driven by whatever MFA library `authentication-engineer` selects at Stage 5/6").

### Flow requiring it
§1.4 step 5 only — MFA enrollment screen presenting the TOTP QR code plus manual entry-key text fallback (invitation-driven admin/security-company-operator/support-agent first login, per BR-4's non-skippable mandate).

### Proposed name
`QrCodeDisplay` (`src/components/QrCodeDisplay`).

### Prop interface

```ts
export interface QrCodeDisplayProps {
  /** The otpauth:// URI or raw secret payload to encode — supplied by whatever Supabase Auth returns at MFA-enrollment time (ADR-0002: TOTP baseline via Supabase Auth). */
  value: string;
  /** The same secret rendered as a manual entry key (grouped, monospaced text), required — never optional — per ux-research.md §4's accessibility mandate. */
  manualEntryKey: string;
  /** Accessible label for the QR image, e.g. "QR code to scan with your authenticator app". */
  label: string;
  /** Pixel size of the rendered QR code. */
  size?: number; // default 200
  className?: string;
}
```

### Variants/states
Single visual presentation — QR image (left/top) + manual entry key text block (right/bottom, always rendered, never hidden behind a toggle) + copy-to-clipboard affordance on the manual key. No error/loading state of its own; the *enrollment* screen around it (§1.4 steps 5–8) owns the retry/error states for a failed verification code, which live in the `OtpInput` component (§1 above), not here.

### Accessibility requirements (from `ux-research.md` §4)
- **Must never be QR-only.** §4, first bullet: "the QR-enrollment step... must always ship with the manual entry-key text fallback already implied in the flow — a screen-reader or low-vision user cannot use a QR code alone." This is enforced at the prop level: `manualEntryKey` is a **required** prop, not optional, specifically so a consuming screen cannot accidentally ship the QR image without the text fallback.
- QR image rendered with `alt` text via `label` describing purpose, not literally describing the QR pattern (a QR code has no meaningful alt-text content beyond "this is a QR code for X").
- Manual entry key rendered as **selectable, copyable text** (a `<code>`/`<pre>` block or a read-only `Input` with a copy button), not an image of text — mirrors the same "not an image" principle §4 states for recovery codes (now moot per §0, but the underlying accessibility principle still applies here).
- Plain-language framing around this component (what an authenticator app is, why both options exist) is a copy/`ui-designer`+`technical-writer` responsibility per §2.3 (Sipho persona) — not something the component itself can encode, noted here so it isn't dropped at implementation.

### Design tokens
No new color tokens — QR renders in standard black/white (functional requirement of the QR spec itself, not a themeable surface); the surrounding card/container uses existing `Card` tokens (`border-slate-200/80`, `rounded-2xl`). Manual-entry-key text block uses `Input`'s existing monospace/code text treatment conventions if one exists in the codebase, otherwise a new but token-consistent `font-mono text-slate-800 bg-slate-50` treatment — no novel palette introduced.

### Implementation note (not a design decision, flagged for sequencing)
The actual QR-rendering library/dependency choice is deferred — `value`'s exact shape depends on what Supabase Auth's TOTP enrollment endpoint returns (ADR-0002 confirms Supabase Auth as the TOTP mechanism; the precise payload contract is `authentication-engineer`'s Stage 5/6 concern, not this document's). This spec fixes the component's *props and accessibility contract*, not its rendering dependency.

---

## 5. Cross-cutting notes

- **Compound-lockout / lost-MFA-device screens** (§1.5 step 7, §1.6 step 6) no longer need any new *component* beyond `Alert` (§2), per the §0 re-scoping. `ui-designer` should treat these as `Alert`-based static informational screens, not functional recovery UI, pending `cybersecurity-architect`'s process definition for the support-assisted reset itself.
- **Recovery-code display is fully removed from the design-system backlog for this feature.** If a future feature reintroduces a self-service backup-code mechanism (a reversal of the current platform-owner ruling), this component would need to be re-specified from scratch at that time — this document's rejection is scoped to the current ruling, not a permanent architectural stance.
- **Web/RN parity**: all four proceeding components (`OtpInput`, `Alert`, `Badge` extension, `QrCodeDisplay`) are specified with platform-agnostic prop contracts (controlled value/onChange patterns, no DOM-specific props leaking into the public API) so `mobile-engineer` can build Expo RN equivalents against the same contracts rather than inventing divergent APIs, per this role's RN-port mandate.
- **Token consolidation flag**: this document introduces `danger` red and `warning`/reused-`gold` amber values in two places (`Alert` §2, `Badge` §3). These must resolve to one shared token definition, not two independently-hand-typed Tailwind class strings that could drift apart at implementation — `frontend-engineer` should define the red/amber values once (e.g., a shared constants module or Tailwind theme extension) and have both components consume it, rather than copy-pasting the class strings into each `index.tsx`. This is a housekeeping item for whoever implements both components at Stage 9, not a new decision.

---

## 6. Pre-Approval Checklist (design-system-manager self-review)

- [x] **Requested UI need cannot be satisfied by an existing component/variant (documented reasoning if new component approved).** `OtpInput` and `QrCodeDisplay`: no existing component covers segmented numeric entry or QR rendering — reasoning documented in §1/§4. `Alert`: no existing component expresses tone/severity — reasoning in §2. `Badge` tones: extension, not new component, reasoning in §3. Recovery-code component: **rejected**, reasoning in §0.
- [ ] **New/changed component has updated Context.md and preview stories.** Not yet done — this document is the pre-implementation spec (Stage 4 sign-off); Context.md and `.previews.tsx` files for `OtpInput`, `Alert`, `QrCodeDisplay`, and the `Badge` tone update are Stage 9 deliverables, produced alongside the actual component code, per this role's "every new component ships with Context.md, no exceptions" practice. Tracked here as an obligation for that stage, not silently dropped.
- [x] **All visual values trace to design tokens — no hardcoded colors, spacing, or typography.** Every tone/color specified in §1–§4 maps to an existing Tailwind palette family already used by `Badge`, `Input`, or `Card` (slate/blue/emerald/amber/red) — no novel hex values introduced. §5 flags the one housekeeping risk (duplicate hand-typed class strings for the shared red/amber across `Alert` and `Badge`) for implementation-time consolidation.
- [x] **Component behavior/API considered for both web and future Expo React Native parity.** Each spec's prop interface is controlled-value/callback-based with no DOM-leaking props; §5 states the RN-parity intent explicitly for all four proceeding components.
- [x] **Accessibility (contrast, focus states, keyboard/touch target sizing) verified at the component level.** Each component section includes a dedicated accessibility requirements subsection sourced directly from `ux-research.md` §4 (grouping/ARIA for OTP, color-independent severity + live-region behavior for Alert, descriptive labeling for Badge tones, mandatory manual-entry-key fallback for QR).
- [x] **Versioning/deprecation plan defined for any breaking change.** Only one change touches an existing component (`Badge`'s tone union) — confirmed additive/non-breaking in §3, minor version bump, no deprecation window required since nothing is removed or renamed.
- [ ] **Cross-surface consistency check run (web, Admin Dashboard, Security Company Dashboard).** Not yet run — these components don't exist in any surface yet (this is their origin spec, not a post-implementation audit). Flagged as a required follow-up once `frontend-engineer` implements against this spec and the components land in the Admin Dashboard, Security Company Dashboard, and Customer App (RN) surfaces per §1's flow list — a consistency audit should confirm all three/four surfaces consume the same `OtpInput`/`Alert`/`Badge`/`QrCodeDisplay` rather than each surface reimplementing its own.

**Net status:** 4 of 5 flagged component needs proceed to `ui-designer` for mockup integration (`OtpInput`, `Alert`, `Badge` `danger`/`warning` tones, `QrCodeDisplay`); 1 (recovery-code display) is rejected per §0, with `ux-research.md` §1.4 step 9 and the related escalation screens (§1.5 step 7, §1.6 step 6) redirected to the `Alert` component instead. Two checklist items are intentionally unchecked and explicitly deferred to Stage 9 (Context.md/previews authored alongside implementation; cross-surface audit run post-implementation) — neither blocks Stage 4 handoff, consistent with this document being a pre-implementation spec, not a completed build.
