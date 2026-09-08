# Mobile surface system — architecture note

**Status:** Active (Feature 009 customer redesign)  
**Author:** `mobile-architect`  
**Date:** 2026-09-03 (updated by `design-system-manager`)  
**Consumers:** `mobile-engineer`, `design-system-manager`, `ui-designer`

This note defines how the customer app layers **canvas**, **grouped surfaces**, and **legacy cards** during the Material 3 / Flutter-style UI migration. It does not replace `architecture.md` §1.5 (temporary primitives bridge).

**Redesign palette (2026-09):** white canvas (`#FFFFFF`), blue brand accent (`accentGold*` tokens — blue-500/600/50 despite legacy names), black floating tab bar (`colors.slate[900]`).

---

## 1. Layer model

```
┌─────────────────────────────────────────┐
│  Canvas (#FFFFFF, colors.canvas)        │  ← full-bleed screen / tab scene
│  ┌───────────────────────────────────┐  │
│  │  SurfaceGroup (white, elevated)    │  │  ← grouped list / stat bar
│  │  ├─ inset row (Pressable)         │  │
│  │  ├─ InsetDivider                  │  │
│  │  └─ inset row                     │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  Card (standalone elevated)        │  │  ← hero / empty / one-off blocks
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

| Layer | Token / module | Role |
|-------|----------------|------|
| Canvas | `colors.canvas` → `canvasColor` / `surfaceStyles.canvas` / `tabScreenStyle` | White full-bleed background behind all tab content |
| Group | `SurfaceGroup`, `surfaceStyles.group` | Single elevated white container for 2+ related rows |
| Inset row | `surfaceStyles.insetRow` + `InsetDivider` | 44pt min-height row inside a group; dividers inset after leading icon |
| Standalone card | `Card` (`bordered={false}` default) | One-off elevated block; shares `elevation` with groups |
| Legacy bordered | `Card bordered` | Pre-redesign bordered surface — migrate away on tab screens |
| Tab bar | `FloatingTabBar` → `colors.slate[900]` | Black pill overlay; active tab label/icon uses `accentGold` (blue) |

**Source of truth:** `mobile/src/theme/surfaces.ts` (elevation, group styles, section headers) + `mobile/src/components/SurfaceGroup.tsx` (React wrappers).

---

## 2. When to use what

### Canvas (not a component)

- Applied by `Screen` (`SafeAreaView` background) and tab `sceneStyle` (`TAB_SCENE_STYLE` in `tabBarMetrics.ts`).
- Do **not** wrap tab screens in an extra `View` with canvas color unless `Screen` is not used.
- Stack screens (asset detail, profile edit) should also use canvas unless the screen is intentionally full-bleed (e.g. map).

### `SurfaceGroup`

Use when **two or more** related rows share one visual unit:

- Home “Current protection” asset list (`ProtectionHomeScreen` + `AssetPreviewRow inset`)
- Home alerts preview, profile completion, recovery CTA
- Account quick stats (`InlineStatBar`)
- Plan usage compact (`PlanUsageSummary`)

Props:

- `padded` — block content (copy, CTA) without per-row inset layout
- Default — flush edges; rows supply their own `surfaceStyles.insetRow` padding

Between rows, prefer `<InsetDivider />` over ad-hoc `borderBottomWidth` so icon inset stays consistent (`defaultDividerInset` = 16 + 44 + 12).

### `Card`

Use for **standalone** content that is not part of a grouped list:

- Empty states (“All clear” on alerts)
- Hero profile card on account (until migrated to a single `SurfaceGroup`)
- Auth / form screens (unchanged — `ui-design.md` §1)

`Card` default is **elevated** (no border), same radius/elevation family as `SurfaceGroup`. Pass `bordered` only for legacy surfaces or explicit design call.

### `AppScreenSection`

Uppercase section title + optional trailing action **above** a `SurfaceGroup`. Replaces per-screen `sectionTitle` duplication where the surface system applies.

---

## 3. Inset row pattern (inside `SurfaceGroup`)

Row components (`AssetPreviewRow`, `AssetVaultCard`, `AccountMenuRow`, alert rows) should support:

```tsx
<SurfaceGroup>
  {items.map((item, index) => (
    <RowComponent key={item.id} inset isLast={index === items.length - 1} />
  ))}
</SurfaceGroup>
```

Inset mode: strip outer border/shadow/radius, apply `surfaceStyles.insetRow`, use `InsetDivider` or `isLast` to omit bottom divider.

**Do not** nest a `Card` per row inside a list that should read as one group.

---

## 4. FlatList patterns

Tab screens with long lists (`AssetListScreen`, future alerts list) should follow:

| Concern | Pattern |
|---------|---------|
| Scroll owner | `Screen scroll={false}` + `FlatList` as flex child — avoids `ScrollView` > `FlatList` nesting |
| Canvas | `Screen` default canvas; optional `style={tabScreenStyle}` if merging styles |
| Horizontal inset | `contentContainerStyle.paddingHorizontal: spacing.xl` on the list |
| Tab bar clearance | **`TAB_SCENE_STYLE.paddingBottom` on the tab layout** — do not also add `FLOATING_TAB_BAR_CLEARANCE` to list content unless the screen is **not** under `(app)` tabs |
| Grouped rows | Prefer one `SurfaceGroup` per section in `ListHeaderComponent` / `renderItem` wrapping inset rows — not one bordered `Card` per item |
| Refresh | `refreshControl` on `FlatList`, not on `Screen` when `scroll={false}` |

`AssetListScreen` still renders standalone `AssetVaultCard` per row — **migration target** is `SurfaceGroup` + `variant="inset"` (already supported on the card component).

---

## 5. Tab bar + safe area

| Constant | Location | Purpose |
|----------|----------|---------|
| `TAB_SCENE_STYLE` | `navigation/tabBarMetrics.ts` | Canvas background + bottom padding for overlay `FloatingTabBar` |
| `FLOATING_TAB_BAR_CLEARANCE` | same | 96dp — tune with tab bar height if design changes |
| `TAB_SCREEN_SAFE_AREA_EDGES` | same | `['top']` — bottom safe area handled by scene padding + floating bar |

**Tab-root screens** (`index`, `assets`, `alerts`, `account`):

- Use `safeAreaEdges={TAB_SCREEN_SAFE_AREA_EDGES}` on `Screen` (or `['top']`).
- Avoid `safeAreaEdges` default `['top','bottom']` — it double-insets above the floating tab bar.
- Avoid duplicating `FLOATING_TAB_BAR_CLEARANCE` in `contentContainerStyle` when `TAB_SCENE_STYLE` already applies — causes ~192dp dead space at scroll end. Pick **one** clearance layer (prefer scene-level).

`FloatingTabBar` uses `elevationSoft` and `useSafeAreaInsets().bottom` for home-indicator padding on the bar itself.

---

## 6. Theme layering (import paths)

```
tokens.ts          colors, spacing, radius, typography
    ↓
surfaces.ts        canvasColor, elevation, surfaceStyles, tabScreenStyle
    ↓
SurfaceGroup.tsx   SurfaceGroup, InsetDivider, AppScreenSection, InlineStatBar
    ↓
primitives/        Screen (canvas), Card (elevation), barrel re-exports
    ↓
components/index.ts   same surface exports (optional shorter path)
    ↓
*Styles.ts         screen-specific typography, shadows (homeShadow, etc.)
```

**Preferred imports:**

- Layout primitives: `import { Screen, Card } from '../../theme/primitives'`
- Surface building blocks: `import { SurfaceGroup, AppScreenSection } from '../../components/SurfaceGroup'` or from `theme/primitives` barrel
- Canvas / metrics: `canvasColor`, `tabScreenStyle` from `theme/surfaces`; `TAB_SCENE_STYLE` from `navigation/tabBarMetrics`

Per-screen `*Styles.ts` files may keep local `screenBg` during migration; new code should use `tabScreenStyle` or rely on `Screen` default (`canvasColor`).

**Accent tokens:** `colors.accentGold`, `accentGoldDeep`, `accentGoldTint` are blue (not gold/orange). `Badge` tone `gold` is a legacy alias — prefer `accent` in new code. Do not hardcode orange/gold hex for brand emphasis.

---

## 7. Migration checklist (for `mobile-engineer`)

| Screen / area | Current | Target |
|---------------|---------|--------|
| `AlertsScreen` | ✅ `SurfaceGroup` + inset rows | Done |
| `AccountHubScreen` | ✅ `SurfaceGroup` hero + menu rows | Done — remove dead `heroCard`/`menuCard` styles in `accountStyles.ts` |
| `AssetListScreen` | Standalone `AssetVaultCard` in `FlatList` | `SurfaceGroup` wrapping inset cards, or sectioned list |
| `AssetDetailScreen` | ✅ `canvasColor` screen bg | Done |
| Tab screens | Mixed `safeAreaEdges`, double tab clearance | `TAB_SCREEN_SAFE_AREA_EDGES`, scene-only clearance |
| Row dividers | Mix of `borderBottom` and `InsetDivider` | Standardize on `InsetDivider` inside groups |
| `ProtectionHealthCard` | Standalone `Card` | OK for one-off block; or migrate to `SurfaceGroup padded` |
| Accent call sites | `accentGold*` token names | Optional rename pass to `accent*` when touching files |

**Shadow duplication:** `homeShadow`, `accountShadow`, `vaultShadow` re-export `elevation` from `surfaces.ts`. New grouped surfaces should import `elevation` / `elevationSoft` directly; retire per-file shadow aliases when touching a screen.

---

## 8. Out of scope

- Auth screens — remain full-bleed `Screen`, no `SurfaceGroup` (per `ui-design.md` §1).
- Security-operator app (`(security-app)/`) — separate tab chrome; not part of this migration.
- Map tab — may keep distinct `sceneStyle` when location feature is enabled.
