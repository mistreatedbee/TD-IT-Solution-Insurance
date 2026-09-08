# Feature 009 — Mobile Tab Shell Manual QA Checklist

**Owner:** `manual-qa-engineer`  
**Scope:** Customer mobile app tab redesign — Home, Assets, Alerts, Account (floating tab bar, white canvas, blue accent, grouped Material-style surfaces)  
**Status:** Ready for on-device execution  
**Design baseline (2026-09-03):**

| Token | Value | Usage |
|-------|-------|--------|
| Canvas | `#FFFFFF` (`colors.canvas`) | Full-bleed screen background behind all tab content |
| Tab bar | Frosted glass pill (`GlassSurface` / `BlurView`) | Semi-transparent floating bar; dark tint in dark mode, light frost in light mode |
| Accent | `colors.accentBlue` (`#3B82F6`) | Selected tab label, FAB, alert badges, CTAs |
| Grouped surfaces | `SurfaceGroup` + `colors.background` | Elevated white rows on canvas; inset hairline dividers |

**Related:** [`04-customer-ui-system.md`](./04-customer-ui-system.md) · [`05-customer-home-dashboard.md`](./05-customer-home-dashboard.md) · [`08-qa-security-accessibility.md`](./08-qa-security-accessibility.md) · [`mobile-surface-system.md`](../003-mobile-app-foundation/mobile-surface-system.md)

---

## Prerequisites

- [ ] Mobile app running (`cd mobile && npm start`) against a live or staging backend (`EXPO_PUBLIC_API_BASE_URL`)
- [ ] **Active customer account** with at least one policy and 2+ registered assets (for list/scroll cases)
- [ ] Second account optional (RBAC spot-check only — tab shell is customer-scoped)
- [ ] Test on **at least one iOS device/simulator with home indicator** and **one Android device**
- [ ] Confirm build flags: `FEATURE_ALERTS_ENABLED`, `FEATURE_KYC_ENABLED`, `FEATURE_LOCATION_TRACKING_ENABLED` (note which are on for this pass)

---

## 1. Global tab bar & safe area

| # | Steps | Expected |
|---|--------|----------|
| G-01 | Open each tab (Home, Assets, Alerts*, Account) | Frosted glass floating tab bar visible; content blurs through bar when scrolling; white canvas behind content |
| G-02 | Scroll each tab to the bottom | Last row/card fully visible above tab bar — **no double gap** (~192px dead zone) |
| G-03 | On iPhone with home indicator | Tab bar sits above home indicator; content not clipped under indicator |
| G-04 | Tap each tab icon | Selected tab label uses blue accent (`#3B82F6`); icon + label area ≥44×44pt |
| G-05 | Rotate to landscape (if supported) | Tab bar remains usable; no overlap with system gestures |
| G-06 | With assist FAB visible | FAB does not cover tab bar or last scroll item on Home |

\* Skip Alerts tab if `FEATURE_ALERTS_ENABLED` is false.

---

## 2. Navigation & headers (no duplicate chrome)

| # | Steps | Expected |
|---|--------|----------|
| N-01 | Home tab | Single in-screen header (greeting + avatar); **no** stack navigation header |
| N-02 | Assets tab root | Single "Protection vault" title in screen; **no** duplicate stack header |
| N-03 | Alerts tab root | Single "Alerts" title in screen; **no** duplicate stack header |
| N-04 | Account tab root | Single "Account" title in screen; **no** duplicate stack header |
| N-05 | Assets → Register asset | Stack header appears ("Register asset"); tab bar still visible |
| N-06 | Account → Profile & identity | Stack header appears ("Edit profile"); back returns to Account hub |

---

## 3. Home tab

| # | Steps | Expected |
|---|--------|----------|
| H-01 | Load home with assets | Protection summary, featured asset, hero actions render on canvas |
| H-02 | Pull to refresh | All sections update; spinner clears |
| H-03 | Scroll to bottom | "Contact support" link fully above tab bar |
| H-04 | Tap "Needs attention" alert row (if shown) | Navigates to Alerts tab; row meets 44pt touch target |
| H-05 | Tap "View all" on asset section | Navigates to Assets tab |
| H-06 | Profile completion card (KYC on) | Grouped surface; divider between inset rows |
| H-07 | Pending verification banner | Dismiss works; resend link tappable |
| H-08 | Zero assets state | Empty featured asset CTA visible; no layout jump |

---

## 4. Assets tab (Protection vault)

| # | Steps | Expected |
|---|--------|----------|
| A-01 | Vault header | Title, subtitle, circular + register button (44×44pt) |
| A-02 | Stat chips (when assets exist) | Three chips in a row; readable labels |
| A-03 | Filter chips (All / Trackable / Needs attention) | Each chip ≥44pt tall; active state visible |
| A-04 | Scroll asset list to last card | Last card not hidden behind tab bar |
| A-05 | Pull to refresh on list | List reloads |
| A-06 | Empty state | Category showcase + "Register your first asset" CTA visible |
| A-07 | Tap asset card | Opens asset detail with stack header |
| A-08 | Plan usage summary (with policy) | Compact card above filters; upgrade prompt if at limit |

---

## 5. Alerts tab

| # | Steps | Expected |
|---|--------|----------|
| AL-01 | Header stat chips (Open / Urgent) | `InlineStatBar` inside elevated `SurfaceGroup` — two stats with vertical divider (not unstyled/broken layout) |
| AL-02 | Empty state | "All clear" card centered; icon + copy readable |
| AL-03 | With alerts | Severity badge + title + body; dismiss (server mode) works |
| AL-04 | Tap alert with deep link | Navigates to linked screen |
| AL-05 | Notification preferences row | Full-width row ≥44pt; opens preferences screen |
| AL-06 | Scroll to bottom | Preferences row clears tab bar |

---

## 6. Account tab

| # | Steps | Expected |
|---|--------|----------|
| AC-01 | Hero card | Avatar (editable), name/email, account state badge |
| AC-02 | Quick stats row | Assets / Plan / Alerts counts in grouped surface |
| AC-03 | Menu sections | Grouped cards with hairline dividers between rows (not between sections) |
| AC-04 | Each menu row | ≥44pt row height; chevron on navigable rows |
| AC-05 | Scroll to "Log out of all devices" | Last row fully tappable above tab bar |
| AC-06 | Profile picture tap | Picker opens; upload state shows on avatar |
| AC-07 | Session actions | Log out / log out everywhere complete without layout shift |

---

## 7. Grouped surfaces & dividers

| # | Steps | Expected |
|---|--------|----------|
| S-01 | Home alert preview group | Inset divider between rows; none after last row |
| S-02 | Home "Current protection" group | Asset rows use inset dividers inside `SurfaceGroup` |
| S-03 | Account menu cards | Dividers inset after icon column; last row has no bottom border |
| S-04 | Elevation | Groups show soft shadow on iOS / elevation on Android; canvas visible between groups |

---

## 8. Accessibility (spot check)

| # | Steps | Expected |
|---|--------|----------|
| X-01 | VoiceOver / TalkBack on tab bar | Each tab announced with label + selected state |
| X-02 | VoiceOver on account menu rows | Title + subtitle read together |
| X-03 | Dynamic Type (large text) | No clipped titles on Home header or vault title row |
| X-04 | Status badges | Tracking/status not conveyed by color alone (text label present) |

---

## 9. Regression smoke (non-tab flows reachable from tabs)

| # | Steps | Expected |
|---|--------|----------|
| R-01 | Home → Report theft (if enabled) | Opens report flow; back returns to Home |
| R-02 | Account → Notification preferences | Screen loads; tab bar hidden or clearance correct on return |
| R-03 | Assets → Register (verified user) | Form loads with stack header only |
| R-04 | `cd mobile && npm test` | All tests pass |

---

## Code-review findings (pre-device, fixed in branch)

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| L-01 | Medium | `FLOATING_TAB_BAR_CLEARANCE` applied in both `app/(app)/_layout.tsx` `sceneStyle` **and** Home/Alerts/Account `contentContainerStyle` (~2× bottom padding) | Removed per-screen duplicate; clearance owned by tab layout only |
| L-02 | Low | Account, Alerts, Assets used default `safeAreaEdges: ['top','bottom']` while floating tab bar already handles bottom inset | Set `safeAreaEdges={['top']}` on tab-root screens |
| L-03 | Medium | `alertsStyles.statChip` referenced in `AlertsScreen` but undefined — stat chips unstyled | Added `statChip` + `statRow` styles matching vault pattern |
| L-04 | Low | Vault filter chips below 44pt minimum height | Added `minHeight: minTouchTarget` to `filterChip` |
| L-05 | Low | Home alert preview rows lacked explicit min touch height | Added `minHeight: minTouchTarget + spacing.sm` on `alertRow` |
| L-06 | Medium | Account stack screens (`ProfileEdit`, `VerificationCentre`) duplicated `FLOATING_TAB_BAR_CLEARANCE` while tab `sceneStyle` already reserves clearance | Removed per-screen clearance; tab layout owns bottom inset |
| L-07 | Low | Account menu rows used full-bleed bottom borders instead of inset dividers | `AccountMenuRow` renders inset hairline divider after icon column |
| L-08 | Low | Alerts list rows below 44pt minimum when body copy is short | Added `minHeight: minTouchTarget + spacing.sm` on alert `row` |

---

## Sign-off

| Role | Name | Date | Pass / Fail |
|------|------|------|-------------|
| manual-qa-engineer | | | |
| qa-architect | | | |
| mobile-engineer | | | |

**Release gate:** No open **Critical** or **High** layout defects on tab-root screens; Medium items above verified fixed on device.
