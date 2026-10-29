# OB-17 — Frosted-Glass Redesign: 8 Screen Specs

Owner: `ui-designer` (R, this doc). Tokens/component list: `design-system-manager`
(`ob-17-glass-redesign-tokens.md`, ratified 2026-10-29 — read first, this doc builds on it and
does not repeat token values).

Status: Draft screen specs, feeding Stage 5 (Architecture Review) and Stage 9
(`frontend-engineer`/`mobile-engineer` build). Not yet Stage 8/10 signed off — see §9.

## 0. Scope, honesty check, and what this doc is not

- **Visuals only.** Every screen below reuses the existing route, existing data-fetch/state
  logic, and existing feature flags. Nowhere in this doc is a control added, removed, relocated
  in task order, or gated differently than today. Where current behavior struck me as awkward
  while composing a screen, it is logged in §8 as a **future UX finding**, not acted on here.
- **No reference image exists.** Per the tokens doc §7.1 and roadmap OB-17 entry, the owner's
  brief refers to an attached image that was never supplied. Every compositional and colour
  choice below is derived from the brief's text and the ratified tokens, not an image. Anywhere
  this doc makes a judgment call that an image would normally settle (gradient placement, accent
  usage density, hero imagery treatment), it is flagged **PROVISIONAL** inline, inheriting the
  tokens doc's own provisional flag on `--glass-accent*`/`--glass-bg-gradient*`. Do not let any of
  this read as final brand polish — re-open these specific calls once the image lands.
- **Component discipline.** Every component referenced is from the tokens doc's §6 list
  (extend-existing / reuse-existing) or the one approved net-new primitive, `Skeleton`. One
  compositional need surfaced that is not cleanly covered by that list — flagged in §7 for
  `design-system-manager` sign-off before any engineer builds it, per the brief's own escalation
  rule. Nothing else new is introduced.
- **Both surfaces.** Screens 1–4, 7, 8 exist on both mobile (Expo) and web
  (`src/customer/*`/`/dashboard`, `/get-started`). Screen 5 (Map) and 6 (Report theft/loss) are
  **mobile-only today** — there is no equivalent web route in `src/customer/` for a live map or a
  theft-report flow; "match the web app to it" for those two screens means the web customer
  dashboard's general glass treatment (shared chrome, cards, type, buttons) should read as the
  same system, but there is no existing web screen to redesign 1:1 against mobile's map/report-
  theft screens. This is called out per-screen below, not assumed silently.
- **Reduced-transparency / low-end-Android.** Per screen below, "Glass elements" lists which
  surfaces use `GlassSurface`/`GlassCard` and therefore need the opaque-fallback rung (tokens doc
  §2.5/§5.2) specified explicitly — not left to the engineer to guess which cards matter.

---

## 1. Onboarding and identity check

**Surfaces:** mobile `mobile/app/(auth)/{welcome,intro,get-started,signup,login,verify-pending,
verify-email,mfa-challenge}.tsx` and the customer-profile verification step
(`mobile/app/(app)/(tabs)/account/verification.tsx`) · web `src/customer/` auth/onboarding routes
(`/get-started`) and the equivalent verification screen.

This is the brief's highest-stakes "calm and trustworthy" moment — first impression plus the
identity-check step that already carries SA-ID-number entry (Feature 013 Tier 1, client-side
only, unaffected here).

### 1.1 Composition
```
Screen (gradient background: --glass-bg-gradient-start → -mid → -end,
        top-to-bottom on mobile, radial from top-center on web for more "hero" feel — PROVISIONAL
        placement choice, image would normally dictate exact angle)
 ┌─────────────────────────────────────────────┐
 │  Logo mark (existing, unchanged)              │
 │                                                │
 │  GlassCard / GlassSurface (radius-card-lg 28,  │
 │  padding --glass-card-padding 24)              │
 │    SectionHeading  text-2xl  "Welcome back" /  │
 │      "Verify it's you" (per existing copy)     │
 │    <p> text-secondary, text-sm, 1.5x line-ht>  │
 │                                                │
 │    FormField/Input — floating label mode:      │
 │      label sits inline at rest, animates to    │
 │      a small caption above the field on focus  │
 │      or once filled (200-300ms, --ease-standard)│
 │      inline validation renders below the field  │
 │      line (not a separate alert block) using    │
 │      --glass-text-secondary for hint, accent-   │
 │      deep-adjacent error red (existing error     │
 │      token, untouched by OB-17) for error text   │
 │                                                │
 │    [ one primary Button, full width, accent ]   │
 │    secondary action as text link, not a second  │
 │    button (brief's "one clear primary button")  │
 │                                                │
 │    OTP step (mfa-challenge / verify-pending):    │
 │      OtpInput keeps its existing segmented-box   │
 │      behavior; visual pass only — larger radius  │
 │      (--glass-radius-input 16) per box, boxes     │
 │      sit on a GlassSurface strip, not bare        │
 │      background                                  │
 └─────────────────────────────────────────────┘
```

### 1.2 Components used
- `GlassCard` (web) / `GlassSurface` content-mode (mobile, new call site per tokens doc §6) as the
  single card holding the form.
- `FormField` (mobile) / `Input` (web) in floating-label mode — extend-existing per tokens doc.
- `Button` — one primary per screen/step, spring-press on mobile.
- `OtpInput` — unchanged behavior, restyled container only.
- `Skeleton` — session-restore/token-check loading state (replaces any spinner currently shown
  while `(auth)/_layout.tsx` resolves a stored session), shaped as a card-width bar + two input-
  height bars.

### 1.3 States
Default / focus (floating label raised, accent-coloured underline or border using
`--glass-accent`) / inline error (red helper text under field, field border tints to error, no
layout shift) / loading (primary button shows existing inline spinner treatment per tokens doc
§6 Button note — button loading spinner stays, only Skeleton is new, for page-level loads) /
disabled (dimmed, no accent) / empty n/a (always has fields).

### 1.4 Glass elements / fallback
Only the one outer card is glass. On reduced-transparency or low-end Android it becomes the flat
`--glass-surface-opaque` fill (§2.5/§5.2) with the same border/shadow/radius — no visual
restructuring, just the fill swaps from translucent to opaque. Background gradient still renders
(it's not a blur, it's a flat gradient fill — unaffected by either fallback).

### 1.5 Accessibility
Text on card uses `--glass-text-primary`/`-secondary` (15.8:1 / 6.1:1 light, clears floor).
Floating labels must remain legible at their raised (caption) size — caption size is
`--glass-text-xs` 12px, below the 14px general safe-minimum some teams use for body text, so
confirm this is label-only (never the sole carrier of required information once risen) and keep
`--glass-text-secondary` (not a lower-contrast muted tone) for it. Tap targets: inputs/buttons
already meet 44pt per existing `FormField`/`Button` — unchanged, just re-skinned.

---

## 2. Home (protection centre)

**Surfaces:** mobile `mobile/app/(app)/(tabs)/index.tsx` (protection-centre home, per Feature 009)
· web `/dashboard` (`src/customer/`).

### 2.1 Composition
```
Screen (gradient bg)
  Header row: greeting text (text-xl) + account icon (unchanged nav target)
  Hero GlassCard (radius-card-lg 28, strong surface --glass-surface-strong for primary
    legibility since this card carries the most important status info):
    StatBlock-style protection status (existing StatBlock component) using the ONE accent
      colour for the "protected" state, replacing today's gold/blue mixed accent usage
      (tokens doc §7.4 — migrated here, screen-by-screen, as instructed)
    AssetBadge row (counts: assets protected / tracked) — AssetBadge variants unchanged in
      logic, restyled to sit on glass (ensure badge fill itself still passes 4.5:1 against
      whatever strong-surface sits behind it — this is the one spot a badge sits on top of a
      glass card rather than a solid background, re-check in Stage 10)
  Secondary row of smaller GlassCards (radius-card 24, --glass-surface default), one per
    quick-action (Report theft/loss, View map, View alerts) — Card/FeatureCard composition,
    unchanged tap targets/routes
  Skeleton (new): while policy/asset summary loads, replaces today's spinner — card-shaped
    shimmer blocks matching the StatBlock + quick-action card geometry exactly, so layout does
    not jump on resolve
```

### 2.2 Components used
`GlassCard`/`GlassSurface`, `StatBlock`, `AssetBadge`, `FeatureCard` (quick actions), `Skeleton`.

### 2.3 Glass elements / fallback
Hero card and all quick-action cards are glass; on fallback all become the same opaque fill —
no card is dropped or hidden, since this screen's whole value is the at-a-glance status read and
losing a card on fallback would be a behavior-adjacent regression, not just visual.

### 2.4 Accessibility
Hero card's StatBlock figure uses `--glass-text-3xl`(34px)/`--glass-text-primary` for the balance-
style headline number; status label pairs the accent colour with an icon + text label (never
colour alone), consistent with the house rule on status coding.

---

## 3. Asset list

**Surfaces:** mobile `mobile/app/(app)/(tabs)/assets/index.tsx` · web asset list within
`src/customer/`/`/dashboard`.

### 3.1 Composition
```
Screen (gradient bg)
  SectionHeading text-2xl "Your assets" + single primary Button "Add asset" (top-right on web,
    full-width bottom-anchored or header-right icon on mobile, matching existing placement —
    not relocated)
  SelectChipGroup (reuse-existing) for status filter (All / Active / Lost / Stolen / Recovery) —
    chip radius --glass-radius-chip 20, selected chip fill = --glass-accent-tint (light) /
    equivalent dark variant, selected text = --glass-accent-deep for contrast
  List of GlassCard rows (radius-card 24, default surface, NOT strong — list rows are
    secondary-density, strong surface reserved for hero/single-focus cards per §2), each row:
    icon (lucide, asset-type) + asset name (text-lg) + AssetBadge (status) + chevron
  Empty state: single centered GlassCard, friendly icon, one-line copy, one primary Button
    "Register your first asset" — no secondary button, per brief's one-primary rule
  Skeleton (new): 4-5 row-shaped shimmer blocks matching the GlassCard row height/radius while
    the list loads
```

### 3.2 Status badge matrix (AssetBadge/Badge — logic unchanged, restyle only)
| Status | Badge tone | Icon | Redundant text |
|---|---|---|---|
| Registered | neutral/secondary tone | `circle` | "Registered" |
| Active/protected | accent tone | `shield-check` | "Protected" |
| GPS-tracked | accent tone, filled | `map-pin` | "Tracked" |
| Lost | warning tone | `alert-triangle` | "Lost" |
| Stolen | danger tone | `alert-octagon` | "Stolen" |
| Recovery-in-progress | warning tone, animated-safe (no spin, static) | `loader` (static) | "Recovery in progress" |
| Recovered | success tone | `check-circle` | "Recovered" |
| Claim-filed | info tone | `file-text` | "Claim filed" |

All eight already have an existing `AssetBadge`/`Badge` tone+icon pairing in the current system
per the tokens doc's "no color-only" house rule — OB-17 only re-skins tone fills to sit correctly
on the new glass background (re-verify each tone's fill still hits 4.5:1 against
`--glass-surface`/`-strong` in Stage 10, since badge tones were tuned against the old
flat-card background, not glass).

### 3.3 Glass elements / fallback
List rows + filter-chip bar are glass; on fallback, rows become flat opaque cards — this is the
highest-row-count screen, so it's also the one place performance (many simultaneous blur
surfaces) matters most for the low-end-Android no-blur rung; flag to `mobile-engineer` to confirm
the flat-fill path, not per-row BlurView instances, is what actually renders under that trigger.

---

## 4. Asset detail

**Surfaces:** mobile `mobile/app/(app)/(tabs)/assets/[id]/index.tsx` (+ its sibling screens:
`activate-tracker`, `device-health`, `installation-guide` — same visual language, not separately
spec'd line-by-line here since they're variations of this one template) · web asset detail
within `src/customer/`.

### 4.1 Composition
```
Screen (gradient bg)
  Back nav (unchanged) + asset name as text-2xl title
  Hero GlassCard (radius-card-lg 28, strong surface):
    Large AssetBadge (status) + asset photo/icon placeholder (no photo upload exists — MP-5 open
      — so this stays an icon placeholder, not a photo well; do not imply upload capability)
    Key facts row: serial/IMEI (masked per existing rule, unchanged), registered date
  Secondary GlassCards (radius-card 24, default surface), one per section:
    "Tracking" card — device-health summary, "Install tracker" CTA if applicable (routes
      unchanged to activate-tracker/installation-guide)
    "Policy coverage" card — plan tier text (unchanged data)
  Report theft/loss entry point: single Button, danger-adjacent but NOT full alarm-red (brief
    wants calm even here) — use accent-deep or a muted warning tone rather than saturated red,
    with icon + label, routing unchanged to the existing report-theft flow
  Skeleton (new): hero + two secondary card shapes while detail loads
```

### 4.2 Glass elements / fallback
Hero + both secondary cards glass; fallback = opaque fill, identical layout.

### 4.3 Accessibility
Masked serial/IMEI display unchanged (security-sensitive, not a visual target for this pass —
no masking behavior change). Status badge again icon+text, no colour-only cue.

---

## 5. Map

**Surfaces:** mobile-only — `mobile/app/(app)/(tabs)/map/index.tsx` and
`mobile/app/(app)/live-tracking/[caseId].tsx`/`device-locations/index.tsx` share this visual
template. **No web equivalent exists** (`src/customer/` has no map route) — "match the web app to
it" does not apply to this screen directly; instead, the floating-card idiom this screen
introduces (§5.1) should be the same idiom any future web map build would reuse, per the tokens
doc's "Map glass overlay card" composition entry.

### 5.1 Composition
```
Full-bleed map (Leaflet/native map view, unchanged provider/behavior)
  Top: GlassSurface pill/bar (radius-chip 20, blur-ios/-android-capable per device), floating
    over the map — holds screen title + close/back control, matches existing nav-chrome glass
    usage (useLiquidGlassChrome) already established for map overlay pills per tokens doc §1
  Bottom-anchored: Map glass overlay card (GlassSurface strong + existing text/button
    primitives, per tokens doc §6) — shows selected asset's last-known-location summary,
    timestamp, AssetBadge status, and a single primary Button ("View details" / "Start
    recovery" depending on existing state logic, unchanged)
  Marker glass label (optional, small GlassSurface chip per marker on tap) reusing the same
    chip radius/blur as nav chrome — do not introduce a new marker-callout component; this is
    the chip reused at smaller scale
  Skeleton (new): a map-shaped placeholder (muted gradient block, no shimmer bars since there's
    no list/text geometry to mimic) while tiles/location resolve — PROVISIONAL treatment, this
    is the one Skeleton use-case that isn't a direct shimmer-bar stand-in for text/cards; confirm
    with design-system-manager whether a map-specific Skeleton variant needs its own sign-off
    (see §7)
```

### 5.2 Glass elements / fallback
Top bar and bottom overlay card are glass (already using `GlassSurface`'s existing chrome path
per tokens doc §1 — this screen is the one place the component is already deployed, just
needs token migration, not new call sites). On low-end-Android/reduced-transparency, both become
opaque flat fills — critical here since the map itself provides no backdrop guarantee (unlike a
gradient screen background, a map can be any colour at any point), so fallback opacity should be
pushed toward the higher end of `--glass-surface-strong` (0.72) rather than the base 0.55 to keep
text legible over arbitrary map imagery even in the fallback path.

### 5.3 Accessibility
Text-on-glass over a live map is the single highest-risk contrast case in this whole redesign
(map tiles are not a controlled background like the gradient) — flag explicitly for Stage 10's
"real rendered gradients" re-check (tokens doc §7.3) to include real map screenshots, not just
the gradient background other screens use.

---

## 6. Report theft or loss

**Surfaces:** mobile-only — `mobile/app/(app)/report-theft/{index,confirm,success}.tsx`. **No web
equivalent** — flag per screen 5's note; same caveat applies.

This is the brief's named "stressful moment" flow — keep to the existing step count/order
(index → confirm → success), restyle only, per the house rule on not over-designing high-stress
flows and the hard constraint against behavior change.

### 6.1 Composition
```
Step 1 (index) — Screen (gradient bg, calmer/lower-saturation variant — PROVISIONAL, no image to
  confirm whether this moment should use a visually distinct, calmer background; using the same
  gradient as the rest of the app is the safe default until the image says otherwise)
  SectionHeading text-xl "Report theft or loss" (not text-2xl — slightly smaller than normal
    screen titles, intentional, keeps this screen feeling procedural/calm rather than alarming)
  StepItem row (existing component, per house style for multi-step flows user actively steers) —
    3 steps, matches existing index→confirm→success structure, now visually present where it may
    not have been before (flag to `ux-researcher`/`mobile-engineer`: confirm whether StepItem
    already renders here today; if not, this is a visuals-only *addition* of an existing
    component, within scope, not a new flow)
  GlassCard form: asset picker (existing SelectChip or list selector, unchanged), reason toggle
    (Lost / Stolen — existing Toggle/SelectChip), notes field (FormField, floating label)
  One primary Button: "Continue"
  Always-visible support escalation: a small persistent link/row ("Need help now? Contact
    support") near the bottom, OUTSIDE the primary card, not inside a modal — per house rule
    that stressful flows keep an always-visible support escalation; flag if this does not exist
    today (visuals-only addition of a text link, not new functionality, acceptable under scope
    if support contact already exists elsewhere in the app; if no support contact mechanism
    exists at all, that's a gap for `product-manager`, not something this pass can invent)

Step 2 (confirm) — same shell, summary GlassCard (read-only key-value rows: asset, reason,
  SAPS case-number entry point per OB-11's existing PoliceReportSection — unchanged placement),
  one primary Button "Submit report"

Step 3 (success) — centered GlassCard, success icon + text, one primary Button forward
  (e.g. "View on map" / "Done", whichever the existing route already targets)
```

### 6.2 Glass elements / fallback
Form card glass, StepItem bar is not glass (text/icon row on the plain gradient background, no
surface needed). Fallback: form card → opaque fill.

### 6.3 Accessibility
Toggle for Lost/Stolen must carry text labels, not icon-only (both already read as short words,
keep it that way). Support-escalation link must meet the same 44pt tap target as any button even
though styled as a text link.

---

## 7. Alerts

**Surfaces:** mobile `mobile/app/(app)/(tabs)/alerts/index.tsx` · web — no dedicated alerts page
confirmed in `src/customer/` beyond what's folded into `/dashboard`; if a standalone web alerts
view doesn't exist, this spec still governs the alerts *section* wherever it currently renders on
web, same card/list treatment as §3's asset list.

### 7.1 Composition
```
Screen (gradient bg)
  SectionHeading text-2xl "Alerts"
  List of GlassCard rows (radius-card 24, default surface) — each: icon (type-specific, lucide),
    title (text-base, semibold), timestamp (text-xs, secondary), unread indicator (small accent
    dot + bold weight, not colour-only — bold text is the redundant cue alongside the dot)
  Swipe/tap-to-dismiss interaction unchanged (behavior), restyled row only
  Empty state: single centered GlassCard, "No alerts yet" — calm copy, no empty-state illustration
    invented (reuse existing empty-state icon pattern if one exists elsewhere in the app; do not
    commission new illustration work under this pass)
  Skeleton (new): 4-5 row shimmer blocks, same treatment as asset list
```

### 7.2 Glass elements / fallback
Rows glass, same fallback behavior and same high-row-count performance flag as §3.

---

## 8. Account

**Surfaces:** mobile `mobile/app/(app)/(tabs)/account/{index,profile}.tsx` (+ `verification.tsx`,
already covered under identity-check look in §1's pattern where it overlaps) · web account
section within `/dashboard`.

### 8.1 Composition
```
Screen (gradient bg)
  Profile header GlassCard (radius-card-lg 28, strong surface): avatar/initial, name, email,
    verification-status Badge (icon+text, existing verification states unchanged)
  List of GlassCard rows (radius-card 24) for settings sections: Personal details, Notification
    preferences, Security (MFA), Legal/Privacy, Delete account, Log out — each row: icon + label
    + chevron (navigation unchanged), existing destructive styling kept for Delete/Log out (muted
    warning tone rather than full-alarm red, consistent with §4's calmer danger treatment)
  Skeleton (new): header + 4-5 row shapes while profile loads
```

### 8.2 Glass elements / fallback
Header + rows glass; fallback opaque fill, identical layout/order (no reordering of settings
rows — visuals only).

### 8.3 Accessibility
Verification-status badge again icon+text. Destructive rows (Delete account, Log out) keep
sufficient contrast even in their muted-warning tone — re-check in Stage 10 alongside §3's badge
matrix, since this is the other place a non-accent, non-neutral colour sits on glass.

---

## 9. Cross-screen rules recap (not repeated per screen above)

- **One accent colour, one primary button per screen** — enforced across all 8: every screen
  above has exactly one `Button variant="primary"` in its default state; any additional action is
  a text link or a secondary/ghost affordance, never a second filled button.
- **Lucide only** — every icon reference above is a `lucide-react`/`lucide-react-native` name;
  no emoji, no other icon set, across all 8 screens.
- **Accent migration** — every screen above moves its relevant controls onto `--glass-accent*`
  from the old gold/blue split, per tokens doc §7.4's instruction that migration happens
  screen-by-screen as these specs are built, not as a repo-wide sweep.
- **Skeleton, not spinners** — every "while X loads" state above specifies a `Skeleton` shape
  matching the content it replaces, per the brief's explicit requirement. The one exception
  flagged for further sign-off is the map's non-shimmer treatment (§5.1, §7 below).
- **Reduced-transparency / low-end-Android** — every glass surface named above has its fallback
  called out explicitly; none is left to be "whatever the component defaults to."
- **Nothing here changes a route, a flag, or a data flow.** Every component swap above is a
  visual re-skin of an existing screen at its existing route under its existing flags
  (`CLAIMS_API_ENABLED`/`EXPO_PUBLIC_FEATURE_CLAIMS`, `LOCATION_INGESTION_ENABLED`, etc. are
  untouched — none of these 8 screens is the claims flow, but the general rule holds for any
  flag any of them do touch, e.g. the location flag gating map/device-locations).

## 10. Open items for other roles

1. **`design-system-manager` sign-off needed:** a map-specific non-shimmer `Skeleton` variant
   (§5.1) — the ratified component list approves one `Skeleton` primitive built around text/card
   shimmer bars; a solid-colour placeholder block for the map screen may or may not be "the same
   component with a prop" vs. a second thing. Routing back per the brief's own escalation rule
   rather than deciding it here.
2. **`product-manager`/`cto`: the owner's reference image is still outstanding.** Every
   PROVISIONAL note above (background-gradient placement in §1, accent density, the calmer
   report-theft background in §6) is a placeholder pending that image, consistent with the tokens
   doc's own flag. Request it before any of these 8 specs are treated as final for build.
3. **Confirm with `mobile-engineer`/`frontend-engineer` whether an always-visible support
   escalation already exists** on the report-theft flow (§6.1) — if it does not exist in any
   form today, that's a product gap for `product-manager`, separate from this visual pass.
4. **Confirm with `ux-researcher` whether `StepItem` already renders on the report-theft flow**
   (§6.1) — if today's flow has no step indicator at all, adding one here is still visuals-only
   (an existing component, no new logic) but should be named as a deliberate addition, not
   assumed already present.
5. **Stage 10 (`qa-architect`, hard gate) must include**, per the tokens doc §7.3 and this doc's
   §5.3/§3.2/§8.3 flags: contrast re-check over real rendered gradients AND real map screenshots
   (not just computed values), the badge-tone-on-glass re-check (§3.2), the destructive-row
   contrast re-check (§8.3), a low-end-Android performance pass specifically on the asset-list
   and alerts screens (highest glass-row-count, §3.3/§7.2), and confirmation that no route/flag/
   behavior changed anywhere across all 8 screens.
6. **Future UX findings logged, not acted on here** (visuals-only constraint): none surfaced as
   clear-cut defects during this pass beyond the two confirm-with-engineering items above (#3,
   #4) — if `mobile-engineer`/`frontend-engineer` surfaces others while building, route them to
   `ux-researcher`/`product-manager` as a separate backlog item, not back into this doc.

---

## 11. Attempted Figma-sourced detail pass (PAAQ file) — 2026-10-29, not completed, no content added

`cto` asked this role to pull concrete visual/layout detail from the owner-supplied PAAQ Figma
file (`https://www.figma.com/design/Crcdvg7h55ihIcy6clT3Nq/PAAQ-App?node-id=68525-72714&m=dev`)
into §§1-8 above — specifically the home-screen search/tab-pill header, the account/profile
pattern, list-card spacing on PAAQ's browse screens, the onboarding carousel idiom, and
confirmation/contradiction of the tokens doc §7 item 6 black-CTA question — citing a Figma node
ID per pattern ported, visuals-only, no PAAQ content/copy/functionality carried over.

**Honesty note, logged rather than acted around:** no Figma MCP tool
(`mcp__claude_ai_Figma__create_session`/`get_metadata`/`get_design_context`/`get_screenshot`) was
present in this run's available tool set, despite the task brief and the session's MCP-server
instructions describing one as already authenticated and loaded. Without that tool this role has
no way to open the file, enumerate its ~25+ child screens/node IDs, or read any pixel value,
spacing, or component structure off it. Rather than fabricate node IDs or visual descriptions of
screens never actually seen — which would be a direct violation of the "never claim a system or
detail exists if it hasn't been verified" house rule, and worse here because it would masquerade
as a cited primary source — **no new Figma-sourced content has been added to §§1-8 of this
doc.** All eight screen specs above stand exactly as previously written (2026-10-29, informed by
the ratified tokens doc only), with their existing PROVISIONAL flags unchanged.

This also means the tokens doc §7 item 6 open question (black secondary accent for primary
CTA/bottom-nav active state vs. teal for identity/category elements) is **neither confirmed nor
contradicted** by this pass — it remains exactly as `design-system-manager` left it, pending
either a working Figma session or a direct screenshot export the owner can hand over another way.

**Recommendation back to `cto`/`product-manager`:** either (a) re-run this task in a session where
the Figma MCP tool is actually present and confirmed callable before work starts, or (b) have the
owner export flat PNG screenshots of the specific PAAQ frames named in the brief (home top bar,
profile screen, "Frame 2147261332" list-card family, onboarding carousel) so this role can read
them via the image-reading path instead of the Figma API. Either path is preferable to a second
attempt that might again reach for tools not actually available and risk a fabricated citation.

No screen in §§1-8 required a PAAQ analog that doesn't exist (map, report-theft) — that honesty
note from the original brief was already correctly placed in §0/§5/§6 before this task began and
is unchanged.

## 12. Figma-sourced detail — PAAQ home/onboarding node, 2026-10-29 (supersedes §11's blocked state)

§11's blocker was specific to the subagent role invoked for that task — it did not have the
Figma MCP tool in its own tool set. `cto`, who does have it in this session, pulled real data
directly from Figma node `68525:62934` (fileKey `Crcdvg7h55ihIcy6clT3Nq`, PAAQ Figma file,
"Frame 2147261332" — the home/explore screen plus its "Why install PAAQ" onboarding overlay) via
`get_design_context` and a rendered screenshot. This is a genuine primary-source read, with node
IDs cited below — not a reconstruction from memory. Still PAAQ content (an experts-booking app),
used strictly as visual/layout reference per §0's visuals-only rule — no PAAQ copy, categories,
or functionality carries over into our screens.

### 12.1 Accent colour — contradicts the tokens doc's exact hex, confirms the hue family

PAAQ's actual accent as rendered in this node is **`#00b5b4`** (teal), used on: the active
"Experts" tab pill (`68525:62962`), the search-adjacent "PAAQ AI" sparkle button fill/border
(`68525:62958`, `bg-[#d9fafa] border-[#00b5b4]`), card "View all" pill borders/text
(`68525:62997`), and the primary CTA button in the onboarding overlay (`68525:63132`,
`bg-[#00b5b4]`, "Explore PAAQ").

This **confirms the hue family** `design-system-manager` picked in the tokens doc's §2.1
(`--glass-accent`) but the **exact hex differs**: tokens doc has `#2DBDB6`, PAAQ's real value is
`#00b5b4`. Flag back to `design-system-manager`: recommend updating `--glass-accent` to `#00b5b4`
now that a verified source value exists, superseding the earlier estimate (which was itself
reading off a lower-fidelity screenshot, not a live Figma value) — this role is not making that
token-doc edit directly per the ownership split in CLAUDE.md (design-system-manager owns tokens,
this role owns screens); flagging only.

### 12.2 Primary CTA colour — CONTRADICTS the open "black secondary accent" question (tokens §7 item 6)

Both onboarding-overlay CTA buttons in this node are **brand-coloured, not black**: "Explore PAAQ"
is `#00b5b4` (teal, `68525:63132`) and "Scan to Join an Event" is `#cd6312` (orange, matching that
card's own warm accent, `68525:63165`/`68525:63198`). No black button appears anywhere in this
node. This contradicts the hypothesis raised in the tokens doc that PAAQ uses black as a universal
secondary CTA accent — in this screen, CTA colour instead matches each card's own semantic accent
(teal for the "experts" card, orange for the "events" card). The black button/pill seen in the
earlier owner screenshots (the "Book Olusegun" button, bottom-nav active state) may be a
system-level/profile-specific treatment distinct from this in-content CTA pattern, or may belong
to a different screen not captured in this node. **Recommendation to `product-manager`/`cto`:
treat tokens §7 item 6 as still open**, not resolved by this pass either way — the two sources
(this node vs. the earlier screenshots) show different CTA-colour conventions in different
contexts, which itself is worth a direct answer from the owner rather than inferring one.

### 12.3 Card, radius, and shadow pattern — confirms flat-white-card hypothesis from tokens §7 item 5

Every content card in this node (`68525:62985`, `68525:63000`, `68525:63019`, etc.) is: solid
white (`bg-white`), `rounded-[24px]`, with a very subtle shadow
(`drop-shadow-[0px_4px_5px_rgba(0,0,0,0.02)]`) — effectively flat, not frosted glass. The *only*
blur/translucency in this entire node is the onboarding overlay's full-screen scrim
(`68525:63083`, `backdrop-blur-[20px] bg-[rgba(0,0,0,0.5)]`) and the modal sheet sitting on top of
it (`68525:63091`, `backdrop-blur-[10px] bg-[rgba(255,255,255,0.74)]`) — i.e. glass is used for a
modal/overlay moment, not for ordinary content cards. **This directly confirms** the
recommendation `design-system-manager` already flagged as open item 5 in the tokens doc: reserve
heavy `GlassCard`/`GlassSurface` blur for hero/header/modal moments, keep ordinary content cards
(home feed, asset list, etc.) flat-white-with-shadow. Recommend `product-manager`/`cto` treat
item 5 as resolved in favour of that recommendation based on this primary-source confirmation.

The `24px` card radius also exactly matches `--glass-radius-card: 24` already set in the tokens
doc §5.1 — no change needed there.

### 12.4 Other concrete patterns observed (for `ui-designer`'s future screen-build pass, not yet applied to §§1-8)

- **Search bar**: full pill (`rounded-[100px]`), white fill, thin `#e7e7e7` border, 18px search
  icon + placeholder text, paired with a separate small square "AI" action button
  (`rounded-[12px]`, accent-tinted fill) to its right — relevant to our home screen's header.
- **Segmented tab row**: three equal-width pill buttons in a row (`rounded-[50px]`, 40px tall),
  active = solid accent fill + white text, inactive = white fill + grey text — a pattern our
  asset-list screen's category/status filter could reuse instead of `SelectChipGroup` if a
  tab-style filter reads better than a chip row (`ui-designer`'s call, not decided here).
- **Avatar stack + "View all" pill**: overlapping circular avatars (60px, -7px overlap) ending in
  a "View all" chip styled as a miniature card (`73×60px`, `rounded-[20px]` outer /
  `rounded-[14px]` inner) — not directly applicable to our screens (no analogous avatar-stack
  need identified in §§1-8) but noted in case `ui-designer` finds a use on the account screen's
  "linked family members" or similar.
- **Fonts used in this node**: `Sofia Pro` (the "9:41" status-bar time only) and `Circular Std`
  (everything else — headings, body, buttons). **Neither matches** `design-system-manager`'s
  Inter recommendation in tokens doc §3. Flag back to `design-system-manager`: Circular Std is a
  commercial font (Lineto/Circular Std requires a license, unlike Inter's open license) — this
  role does **not** recommend switching the already-ratified Inter decision over a PAAQ-sourced
  observation alone, since font *licensing*, not just visual match, was tokens doc §3's stated
  reason for picking Inter, and that reasoning still holds regardless of what PAAQ itself uses.
  Noting the mismatch for the record, not proposing a change.

### 12.5 Net effect on §§1-8 screen specs

No edits made to §§1-8 in this pass — the confirmations above (§12.3 in particular) support
`ui-designer`'s *existing* flat-card-with-hero-blur approach already implied in those sections
rather than requiring a rewrite of them. §12.4's segmented-tab-row pattern is logged as a
candidate detail for the home/asset-list sections' next revision, not applied here, to keep this
pass to confirmed findings plus flagged recommendations rather than mixing in a silent spec
change.

## 13. Figma-sourced detail — PAAQ "Upgrade Tier Level" form screen, 2026-10-29

Second owner-supplied Figma node, same PAAQ file (`68525:62934`'s sibling), node `61299:92646`,
fileKey `Crcdvg7h55ihIcy6clT3Nq`, pulled directly via `get_design_context` the same way as §12.
This is a form screen (an expert-tier upgrade application), used strictly as layout/visual
reference per §0 — the actual field content (Instagram handle, article links, tier selection) is
PAAQ-specific and does not carry over to our screens.

### 13.1 Black as a real, recurring secondary-action colour — resolves tokens §7 item 6 further

This screen settles §12.2's open question with a third data point. Two black (`#181f1f`) pill
buttons appear here: "How it works" (an inline info-expand button on the hero card,
`61299:92669`) and "Select" (a compact action button embedded inside the tier-level dropdown
field, `61299:92729`-`61299:92732`). Both are small, secondary/tertiary actions — not the
screen's primary CTA. The primary CTA ("Apply for upgrade", `61299:92733`-`61299:92736`) is
rendered in a disabled/greyed state (`bg-[#e8eded]`, text `#b5c4c4]`) in this particular screen
state, so its *active*-state colour isn't visible in this node — inconclusive on whether an
active primary CTA here would be teal (per §12's "Explore PAAQ" button) or something else.

**Updated recommendation to `product-manager`/`cto`**: across both nodes pulled so far, black
consistently appears on *secondary/inline* actions (info toggles, compact dropdown-embedded
buttons), never confirmed yet on an active *primary* CTA. The pattern looks more like "black =
secondary action colour, brand accent (teal/orange/etc.) = primary CTA colour" than "black
replaces teal as the universal CTA colour." This is still a recommendation from two data points,
not a ratified rule — a `product-manager`/`cto` sign-off call, not decided here. If adopted, it
would mean OB-17 may want a `--glass-action-secondary` (near-black) token distinct from
`--glass-accent`, for secondary/inline buttons specifically, not as a CTA replacement.

### 13.2 A third, distinct accent colour: status green

`#4ead66` appears on "1 - 20 working days" (`61299:92668`) as a semantic/status-style text colour
(processing-time estimate), separate from both the teal brand accent (§12.1) and the black
secondary-action colour (§13.1). Recommend treating this as a cue that OB-17 may want a semantic
status-colour token (success/positive, distinct from the brand accent) for things like "in
progress," "recovered," "approved" states on our screens (asset-detail status, claim-status
badges on account/alerts) — not a literal colour match requirement, since `#4ead66` is PAAQ's own
and we're not obligated to reuse their exact green, just the *pattern* of having a dedicated
status colour separate from the brand accent.

### 13.3 Form input pattern — contradicts the brief's "floating labels" instruction

Every input on this screen uses a **static label above the field**, not a floating label inside
it: e.g. "What is your Instagram username?" sits as its own text line above a plain bordered input
with a static (non-floating) placeholder ("@username") that disappears on focus/fill in the
conventional way, not a label that floats up. Inputs themselves: `rounded-[10px]` (notably
*smaller* than our already-set `--glass-radius-input: 16` token — this doesn't need to change,
just flagging the reference doesn't match our already-slightly-larger pick), thin
`rgba(157,172,172,0.5)` border, 51px height, grey placeholder text.

This is a direct **contradiction of the original written brief's "floating labels" requirement**
(carried in `ob-17-glass-redesign-tokens.md`'s source brief, not re-litigated here). Flagging
honestly rather than silently following whichever source is more convenient: the brief's text
says floating labels; this reference screen shows static labels-above-fields instead. Recommend
`product-manager`/`cto` give an explicit call on which wins — this role is not picking one
unilaterally. No change made to `FormField`/`Input` component specs pending that call.

### 13.4 Top app bar and dividers — minor, non-conflicting detail

Simple pattern, no conflicts with existing specs: white top bar, left-aligned back chevron, bold
centered title, hairline full-width divider lines (`opacity`-light grey) between form sections —
consistent with a plain, uncluttered form layout. No blur/glass anywhere on this screen at all
(further supporting §12.3's "glass reserved for hero/modal moments, not routine screens"
finding).

### 13.5 Net effect on §§1-8 screen specs

No edits made to §§1-8. Two items from this screen need `product-manager`/`cto` sign-off before
`ui-designer` would apply them to any screen: §13.1's black-as-secondary-action recommendation,
and §13.3's floating-label-vs-static-label conflict with the brief. Both logged as open items,
not resolved here.
