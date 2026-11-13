# Design System Rollout R3 (step 4) — design-system-manager sign-off

Date: 2026-11-13. Branch `design/03-shared-components` (86bad95). Author: `design-system-manager`.
Scope: `src/components/td/*` and `mobile/src/design/*` against `design-system/reference/components/*/README.md` and `design-system/tokens.json` (authoritative).

## 1. Conformance (pass/fail per rule)

Checked on both platforms: hard-coded colour, white on orange, focus ring, glass four parts, reduced-transparency fallback, badge vocabulary, serial masking, 48px target.

| Component | Rules | Result |
|---|---|---|
| Button | No hex/rgba in either file (grep clean). Primary uses `on-action-primary` (web TdButton.tsx:16, mobile Button.tsx:38); no white on orange. Min height 48 (TdButton.tsx:32, Button.tsx:61). Focus ring web `TD_FOCUS` (cx.ts:2-3), mobile outline 2/2 (Button.tsx:68-74). Web glass variant has the reduced-transparency fallback (TdButton.tsx:19). | PASS web. Mobile: glass variant had no fallback (was Button.tsx:40) — FIXED. Danger differs by platform (web tinted outline TdButton.tsx:20, mobile solid fill Button.tsx:41); spec silent, see condition C4. |
| GlassCard | Fill, border, shadow, blur all present (web TdGlassCard.tsx:19; mobile GlassCard.tsx:33,39,48,53). Radius lg/xl. Fallback to `bg-raised`, no blur, border kept (web :20; mobile :27). Selected = 2px focus-ring. | PASS both. Note: web `solid` carries shadow, mobile `solid` does not (GlassCard.tsx:33), cosmetic, C5. |
| TextField | Border `border-control`, focus to `focus-ring`, error to `danger`; error has icon plus sentence (web TdTextField.tsx:58; mobile TextField.tsx:102). Height 56. Label inside. | PASS both. Web fill is `bg-sunken` (TdTextField.tsx:33), mobile `bg-raised` (TextField.tsx:56): align, C5. |
| StatusBadge | Always icon plus word; 14px; not tappable; vocabulary fixed and typed. | PASS web. FAIL mobile: LOST was `warning` tone (StatusBadge.tsx:21) but `tokens.json` defines danger as "Lost, stolen, error" and web used danger. FIXED to `danger`. Icons diverged by platform, FIXED (see §2). |
| AssetCard | Only last four characters of identifier (web `lastFour` TdAssetCard.tsx:11; mobile `maskIdentifier` AssetCard.tsx:14-19; a11y label also last four). Whole card is one target with ring on the card (web :50, mobile :53). No map thumbnail. Footer `body-sm` `ink-muted`. | PASS both. |
| TabBar / TdNavBar | Exactly four tabs, current = `action-primary`/`on-action-primary`, danger dot plus count in label, floating with `space-4` side margins, tabs min 56. Web nav: items min 48, `aria-current`, strong-glass blur plus fallback (TdNavBar.tsx:32). | PASS both. |

Hard-coded values: none in either folder, except the token reference `t.colors.onNavy` (Button.tsx:41), which is a token.

## 2. Judgement calls

1. **CLAIM OPEN tone = info: APPROVED.** The spec offers success/danger/warning/info; a claim open is neither a good nor a bad state. Info uses `link` on `info-bg`. Both platforms already agree.
2. **Status icons: approved with a single canonical map, now applied on both platforms.** The spec's list has only five icons for seven statuses, so some extension is unavoidable. Rule: spec icons first, otherwise another Lucide line icon of the same family, identical on web and mobile.
   - PROTECTED `shield-check`; TRACKING `map-pin` (spec; web Radar replaced); PENDING VERIFICATION `clock`; LOST `map-pin-off` (map-pin family; mobile Search replaced); STOLEN `triangle-alert`; RECOVERED `circle-check` (spec; web BadgeCheck and mobile RotateCcw replaced); CLAIM OPEN `file-text` (not in the spec list, approved extension).
   - Tones: PROTECTED/RECOVERED success; TRACKING/CLAIM OPEN info; PENDING warning; LOST/STOLEN danger.
   - Add `map-pin-off` and `file-text` to the Icon README list (ui-designer follow-up).
3. **TdNavBar plain `<a>`: APPROVED for now, with condition C3.** It is correct for static marketing pages; inside the React Router app an `<a>` forces a full reload. Before any in-SPA use, add an optional `renderLink`/`onNavigate` prop. The rest of the API stays.

## 3. Duplication and migration

| Existing | Replacement | Plan |
|---|---|---|
| web `Button` (`src/components/Button`) | `TdButton` | Deprecate. Marketing pages migrate in R4/R5. |
| web `GlassCard`, `Card` | `TdGlassCard` (`variant="solid"` for Card use cases) | Deprecate. `Card` stays until no importer remains. |
| web `Input` | `TdTextField` | Deprecate. Forms keep `Input` until each screen is re-validated (validate on blur). |
| web `Badge`, `AssetBadge` | `TdStatusBadge` | Deprecate. `Badge` stays only for non-status tags (not in the fixed vocabulary). `AssetBadge` mapping needs a per-state review. |
| mobile `theme/primitives` Button/FormField/SelectChipGroup | `design/Button`, `TextField` | `SelectChipGroup` has no replacement, stays. Others mark `@deprecated`. |
| mobile glass components/tokens | `design/GlassCard`, `AssetCard`, `TabBar` | Migrate screens in R5. |

**No deletions yet.** Mark `@deprecated` JSDoc plus a pointer, and add an ESLint `no-restricted-imports` warning for new imports of the old components. Delete after one release with zero importers.

**Interim `glass*` tokens** (`mobile/src/theme/colorSchemes.ts:40-61`, values at :107-123 and :189-207): superseded by `design-system/tokens.json`. Freeze (no new consumers), mark `@deprecated`, and remove in R5 once screens read `useDesignTokens()`.

**`#2DBDB6` vs `#00B5B5`:** moot. Neither is a brand token. The authoritative accent is `brand-orange` `#F5A022` for actions, `link` `#1A66A0`/`#7CC0F0` for info. The teal `glassAccent` (`#00B5B5`, colorSchemes.ts:108,192) is retired with the glass* namespace. `#2DBDB6` survives only in the OB-17 docs, historical and append-only: add a superseded note, do not edit them.

## 4. Verdict: APPROVED-WITH-CONDITIONS

Direct fixes by me:
- web `TdStatusBadge.tsx`: TRACKING Radar to MapPin, RECOVERED BadgeCheck to CircleCheck.
- mobile `StatusBadge.tsx`: LOST tone to danger and icon to MapPinOff, RECOVERED icon to CircleCheck.
- mobile `Button.tsx`: glass variant falls back to `bgRaised` when blur is disabled.

**Verification gap:** the Bash tool was unavailable to me, so `tsc --noEmit` (root and mobile), root `npm test` and `npx jest src/design` were NOT run. They must pass before merge. Existing tests grepped clean for the changed icon/tone names, but a snapshot or tone test could still exist.

Conditions:
- C1. Run the checks above and fix any failure.
- C2. Add or adjust a test asserting the §2 canonical status-to-icon-and-tone map on web and mobile.
- C3. Add `renderLink`/`onNavigate` to `TdNavBar` before in-SPA use.
- C4. `ui-designer` rules on danger button styling (filled vs tinted) and aligns the platforms.
- C5. Align the minor drifts: `solid` shadow and TextField fill on both platforms.
- C6. Add `@deprecated` markers and the lint warning per §3 before any screen migrates.
- C7. Adoption is limited to R4/R5 work; do not replace existing screens wholesale in this PR.
