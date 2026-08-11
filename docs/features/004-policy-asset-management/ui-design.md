# Feature 004 — Mobile UI Design (Phase 1)

**Lifecycle stage:** 4 — UI Design (minimum viable, M-03 + asset registration)  
**Owner:** `ui-designer` (with `ux-researcher` input on M-03)  
**Status:** Phase 1 scaffold — not a full Stage 3/4 research pass  
**Implements:** [`business-requirements.md`](./business-requirements.md) AC-1–AC-8, MP-3/MP-5

---

## 1. Information architecture (M-03)

**Tab order (unchanged from architecture scaffold):** Home → Policy → Assets → Profile

### Home (`app/(app)/index.tsx`)

- Welcome + account email (cached `GET /account/me`)
- Pending verification banner (ui-design.md §4.1 Screen E pattern from Feature 001)
- **Summary cards** (live counts, not fake data):
  - Policy: count or "No policy yet" + link to Policy tab
  - Assets: count or "No assets yet" + link to Assets tab

### Policy stack

| Screen | Route | Primary action |
|---|---|---|
| List | `policy/index` | Create policy (FAB or button) → gate → `policy/create` |
| Create | `policy/create` | Single `planTier` text field + submit |
| Detail | `policy/[id]` | Read-only fields |

### Assets stack

| Screen | Route | Primary action |
|---|---|---|
| List | `assets/index` | FAB register → gate → `assets/register` |
| Register | `assets/register` | Type chip grid + dynamic fields |
| Detail | `assets/[id]` | Read-only |

---

## 2. Asset registration — one generic form, per-type fields

**Decision:** One screen with **type chip selector** + dynamic `details` fields (not eight separate routes). Matches `api-design.md` §6 `oneOf` and reduces navigation depth.

### Type selector

- Horizontal wrap grid of chips (8 types from `ASSET_TYPE_OPTIONS`)
- Selected chip: primary border/fill; switching type clears `details` (not display name)

### Fields per type

| Type | Required | Optional |
|---|---|---|
| Vehicle | make, model, year, VIN | license plate, color |
| Smartphone | brand, model, IMEI | serial number |
| Laptop | brand, model, serial | OS |
| Tablet / TV / Desktop | brand, model, serial | components |
| Business / Other electronics | category, brand, model, serial | description |

### Explicitly excluded (MP-5)

- No photo upload, camera button, or "coming soon" camera affordance
- No GPS device pairing fields (always null in Phase 1)

---

## 3. Copy rules (MP-3 / AC-8)

- **Never** "Your plan is active" or premium/paid language when `billing.billingStatus === not_configured`
- Policy create helper: *"Enter the plan label your advisor gave you — tier catalog not finalized yet."*
- Empty policy: *"You don't have a policy yet…"*
- Empty assets: *"No assets registered yet…"*

---

## 4. Components used

From `mobile/src/theme/primitives/` (temporary bridge):

- `Screen`, `Button`, `Input`, `Card`, `Badge`, `Alert`
- Type chips: inline `Pressable` styles in `RegisterAssetScreen` (extract to `SelectChip` when design-system-manager ratifies)

---

## 5. Open for full Stage 3/4 later

- Brand typography (`expo-font`) — design-system-manager
- Per-type illustration/iconography on list rows
- Accessibility audit (WCAG) on eight-type form error paths

**Signed:** `ui-designer`, 2026-08-12 (Phase 1 minimum).
