# Mobile UI/UX Review — Grouped Surfaces Redesign (Feature 009)

**Lifecycle stage:** 3 — UX Research (design-review pass, not moderated usability study)  
**Owner:** `ux-researcher`  
**Date:** 2026-09-03  
**Audience:** `mobile-engineer`, `ui-designer`, `design-system-manager`, `product-manager`  
**Scope:** Customer mobile tab surfaces — Home (protection centre), Assets vault, Alerts, Account hub, `FloatingTabBar`

**Method:** Heuristic review against Feature 009 specs (`03-customer-ux-architecture.md`, `04-customer-ui-system.md`, `05-customer-home-dashboard.md`), WCAG 2.1 AA touch-target guidance, and stressed-user journey principles. Code reviewed at `mobile/src/screens/{home,account,assets}/`, `AlertsScreen.tsx`, `FloatingTabBar.tsx`, `SurfaceGroup.tsx`, `surfaces.ts`.

**Not in scope:** Moderated usability testing (recommended before Release Gate A build #2 ships to customers), security-ops dashboard, report-theft flow internals.

---

## Executive summary

The grouped-surface direction (`canvasColor` canvas + elevated `SurfaceGroup` rows) is **appropriate for this domain**. Insurance and asset-protection apps benefit from calm, scannable lists over heavy bordered cards — especially when users are anxious. The refactor is **partially landed**: Home and Account already use `SurfaceGroup` / `AppScreenSection`; Alerts and Assets vault still mix bordered `Card` primitives with separate stat chips.

**Top risks for stressed users:**

| Severity | Finding | Impact |
|----------|---------|--------|
| **High** | Report theft is below the fold on Home, competing with status cards | Panicked users may scroll past the primary emergency action |
| **High** | Alerts tab has no badge on `FloatingTabBar` (bell on Home header only) | Users who land on Assets/Account may miss urgent items |
| **Medium** | Home information order does not match anxiety-state priority | Status/metrics before action in theft/recovery moments |
| **Medium** | Alerts list still uses standalone bordered cards | Visual noise; inconsistent with Account grouped menus |
| **Medium** | Assets vault list not yet grouped (`listSurface` token exists, unused) | Scanability suffers with many assets |
| **Low** | Duplicate alert entry points (Home preview, tab, Account menu) | Acceptable if hierarchy is clear; currently slightly redundant |
| **Low** | `DraggableAssistFab` overlaps content and has no theft shortcut | May obscure CTAs; “coming soon” does not help stressed users |

**Recommendation:** Complete surface migration on Alerts + Assets, reorder Home for emergency-first visibility, add alert badge to tab bar, then run a 5-participant moderated task test (theft-report initiation + alert triage) before calling IA final.

---

## Personas & anxiety states

| Persona | State | Primary need on these screens |
|---------|-------|------------------------------|
| **Policyholder (routine)** | Calm | Glance protection health, register asset, check plan |
| **Policyholder (alerted)** | Elevated concern | Find what needs attention, understand severity, act in one tap |
| **Policyholder (theft/recovery)** | High stress, reduced cognition | Report theft or open recovery case **immediately**; no hunting |
| **New registrant** | Uncertain | Clear empty states, single next step, no dead ends |

Design and copy must optimise for the **worst day** (theft/recovery), not only the calm dashboard case.

---

## Scanability audit — critical tasks

### Can users find alerts quickly?

| Path | Current state | Task success (heuristic) |
|------|---------------|--------------------------|
| Home header bell + badge | ✅ Visible; `minTouchTarget` (44dp); count capped at 9+ | **Good** |
| Alerts tab | ✅ Dedicated tab when `FEATURE_ALERTS_ENABLED` | **Good** — but **no tab badge** |
| Home “Needs attention” section | ✅ Preview of up to 2 alerts in `SurfaceGroup` | **Good** when alerts exist |
| Account → Alerts row | ✅ Subtitle shows count | **Fair** — buried in long scroll |
| Featured protection card stat | Shows alert count inside navy hero | **Fair** — not tappable |

**Gap:** A user on the Assets tab with 3 urgent alerts has **no persistent indicator** on the tab bar. Home bell is not visible off-Home.

**Recommendation (P1):** Add numeric/dot badge to Alerts tab in `FloatingTabBar` when `alertCount > 0`; prefer gold dot for any open alert, red accent when `urgentCount > 0`. Mirror `HomeHeader` badge logic.

### Can users report theft quickly?

| Path | Current state | Task success (heuristic) |
|------|---------------|--------------------------|
| Home `HomeHeroActions` → Report theft | ✅ Prominent dual-card row; cool primary fill when entitled | **Good** when visible without scroll |
| Account → Report theft | ✅ In “Your protection” group | **Fair** — requires tab switch + scroll |
| Tab bar | ❌ No direct entry | Expected per UX architecture (stack route, not tab) |
| Assist FAB | ❌ “Coming soon” only | **Not helpful** under stress |

**Gap:** On a typical phone, order is: Header → (optional map) → `FeaturedProtectionCard` → `FeaturedAssetCard` → **then** hero actions. A user opening the app after a push notification may need to scroll to reach Report theft.

**Recommendation (P1):** When `openRecoveryCount > 0` or any critical/high alert exists, **pin a compact emergency strip** below the header: “Report theft” + “View recovery” (or promote recovery `SurfaceGroup` above stats). Do not remove hero cards in calm state — use conditional elevation only.

**Copy note:** “Start recovery immediately” sets high expectation; recovery backend is partial. Prefer **“Start a theft report”** / **“We'll guide you step by step”** until end-to-end recovery is verified live.

### Can users register an asset quickly?

| Path | Current state | Task success (heuristic) |
|------|---------------|--------------------------|
| Home → Add asset hero card | ✅ | **Good** |
| Home → Featured empty state | ✅ Clear CTA | **Good** for new users |
| Assets tab → `+` FAB | ✅ `minTouchTarget`, top-right | **Excellent** |
| Assets empty state | ✅ Category showcase + CTA | **Good** |
| Account → Register asset | ✅ | **Fair** |

**Gap:** None critical. Plan-limit gating message is clear.

---

## Grouped lists vs bordered cards — domain tradeoffs

### Why grouped surfaces fit TD IT Solution Insurance

| Factor | Bordered card (old) | Grouped surface (new) |
|--------|---------------------|------------------------|
| **Visual noise** | Each row = border + shadow; “card fatigue” on long lists | One elevation per section; hairline dividers |
| **Scan speed** | Eyes reset at every card edge | Continuous vertical scan down one surface |
| **Hierarchy** | Sections compete at same visual weight | Section title (uppercase, secondary) + one white group |
| **Stressed-user cognition** | More boxes to parse | Fewer boundaries; aligns with iOS Settings / Material lists |
| **Insurance trust** | Can feel “marketing heavy” | Feels operational, calm, bank-app familiar |

### When to **keep** a standalone card

Use a **distinct elevated card** (not inset row) only when the block is:

1. **Singleton hero content** — e.g. `FeaturedProtectionCard` (navy status hero), featured asset spotlight.
2. **Primary dual CTAs** — `HomeHeroActions` pair (Add asset / Report theft); these are actions, not list items.
3. **Empty states** — centred icon + reassurance copy; padding inside one `SurfaceGroup` or soft card is fine.
4. **Destructive / session** — logout rows can stay grouped but last row in section; no need for separate cards.

### When to **never** use per-row cards

- Account menu sections (already migrated ✅)
- Alert lists (should migrate ⏳)
- Asset vault list rows (should use `variant="inset"` inside `vaultStyles.listSurface` ⏳)
- Home “Current protection” asset preview list (migrated ✅)

### Divider & inset rules (from `surfaces.ts`)

- Leading icon rows: divider inset = `16 + 44 + 12` dp — keeps continuity with `AccountMenuRow`.
- Asset rows without leading icon column: use full-bleed divider or align image to inset grid.
- **Do not** mix bordered standalone cards inside a `SurfaceGroup` — breaks the grouped aesthetic.

---

## Section hierarchy & touch targets

### Section title pattern (standardise)

All tab screens should use `AppScreenSection` + `surfaceStyles.sectionTitle`:

- Uppercase, 13px, secondary colour, letter-spacing 0.3
- Optional trailing action (`View all`, `Register`) in primary colour
- **8dp** gap between title and group (already in `SurfaceGroup`)

**Inconsistency:** `homeStyles.sectionHeader` duplicates `surfaceStyles.sectionHeader` — consolidate during refactor (`mobile-engineer` + `design-system-manager`).

### Touch targets (WCAG 2.5.5)

| Element | Spec | Current |
|---------|------|---------|
| Minimum tap area | 44×44 dp | `minTouchTarget = 44` in tokens ✅ |
| Tab bar items | 44dp min height | `FloatingTabBar` `minHeight: 64`, tab `minHeight: 44` ✅ |
| Filter chips (Assets) | Should meet 44dp height | ~32dp — **borderline**; add vertical padding |
| Alert dismiss button | Full-width secondary | OK |
| Home bell | 44×44 | ✅ |

**Recommendation:** Increase Assets filter chip `paddingVertical` to meet 44dp total height; add `hitSlop` on section “View all” links.

### Home scroll order — recommended priority tiers

**Tier 0 — Emergency (conditional):** Recovery cases strip, critical alert banner  
**Tier 1 — Orientation:** Header greeting + subtitle  
**Tier 2 — Status at a glance:** `FeaturedProtectionCard` (keep as hero)  
**Tier 3 — Primary actions:** `HomeHeroActions` (move **up** to immediately follow Tier 2, before featured asset)  
**Tier 4 — Attention queue:** Needs attention alerts preview  
**Tier 5 — Portfolio:** Featured asset + current protection list  
**Tier 6 — Account hygiene:** Profile completion  
**Tier 7 — Support:** Contact support footer  

Rationale: Users answering “what do I do now?” should see actions before deep portfolio detail.

---

## Stressed-user flows

### Flow A — Push notification → “Device left geofence”

1. User opens app (may land on Home or deep link)
2. Must see: what happened, which asset, severity, next step
3. Current: alert may appear in Home preview **below fold**; Alerts tab unbadged

**Requirements:**

- Deep link to Alerts or asset detail when notification payload supports it
- Urgent items sorted first in Alerts list (verify sort)
- Severity badge visible without opening row (already on `AlertRow`)

### Flow B — “My laptop was stolen”

1. User needs Report theft within **3 taps from app open** (target from role success metrics)
2. Current: Home tab → scroll → Report theft = **2 taps if visible**, 3+ if scroll required
3. Locked plan: card shows upgrade path — good; ensure copy does not blame user

**Requirements:**

- Consider persistent **Emergency** affordance: long-press tab bar Home or FAB menu with Report theft + Call support (future)
- Support link on Home footer — add same to Alerts empty state (copy fix applied)

### Flow C — Post-report recovery tracking

1. `openRecoveryCount > 0` → recovery block on Home
2. Copy should state **what happens next** (security partner contact, what to expect)
3. Currently: “tap to track progress and last known locations” — OK if live-tracking route is honest about data freshness

---

## Per-screen recommendations

### Home (`ProtectionHomeScreen`)

**Strengths**

- Protection status hero communicates operational vs needs-attention clearly
- Alerts preview migrated to `SurfaceGroup` with “Needs attention” label
- Asset preview list uses inset rows correctly
- Pull-to-refresh on dashboard data

**Issues & actions**

| Priority | Issue | Recommendation |
|----------|-------|----------------|
| P1 | Hero actions below featured asset card | Move `HomeHeroActions` directly under `FeaturedProtectionCard` |
| P1 | No emergency strip for active recovery | Show compact recovery banner above stats when `openRecoveryCount > 0` |
| P2 | `FeaturedProtectionCard` stats not tappable | Make Alerts stat chip navigate to Alerts; Assets → vault |
| P2 | Map preview hidden when location kill-switched | OK per INC-001; ensure no “empty map” dead end |
| P3 | Profile card in `SurfaceGroup` without section title | Wrap in `AppScreenSection title="Profile"` when &lt; 100% |
| P3 | Support footer easy to miss | Acceptable; duplicate path in Account |

**Grouped-surface completion**

- ✅ Alerts preview, asset list, profile inset, recovery block
- ⏳ Keep `FeaturedProtectionCard`, `FeaturedAssetCard`, `HomeHeroActions` as hero cards (intentional)

### Account (`AccountHubScreen`)

**Strengths**

- Clear sectioning: profile, protection, plan, preferences, security, help, session
- Hero profile + `InlineStatBar` in one `SurfaceGroup` — strong pattern
- Menu rows meet touch target; chevrons indicate navigation

**Issues & actions**

| Priority | Issue | Recommendation |
|----------|-------|----------------|
| P2 | Long scroll to Report theft | Acceptable secondary path; rely on Home emergency ordering |
| P2 | Duplicate Bell icons (Alerts + Notification preferences) | Differentiate: use `Settings2Icon` for preferences (match Alerts screen) |
| P3 | `accountState` badge shows raw enum (`active`) | Title-case for display: “Active” |
| P3 | Test push row in Preferences | Dev-facing; hide behind `__DEV__` or feature flag before customer build |

**Grouped-surface completion**

- ✅ Fully migrated to `SurfaceGroup` + `AppScreenSection`

### Assets vault (`AssetListScreen`)

**Strengths**

- Strong header with title, subtitle, and register `+` button
- Filter chips: All / Trackable / Needs attention
- Empty state with category tiles reduces “what can I register?” uncertainty
- Plan usage summary when policy exists

**Issues & actions**

| Priority | Issue | Recommendation |
|----------|-------|----------------|
| P1 | `FlatList` renders standalone `AssetVaultCard` with border each row | Wrap list in `vaultStyles.listSurface`; use `variant="inset"` (component already supports) |
| P2 | Stat bar | ✅ Uses `InlineStatBar`; label aligned to filter: **“Needs attention”** |
| P2 | Filter chip touch height | Increase to 44dp min |
| P3 | Empty filter view copy | Good; add “Clear filter” when `filter !== 'all'` |

**Grouped-surface completion**

- ⏳ Header stats + list body still card-heavy

### Alerts (`AlertsScreen`)

**Strengths**

- Header with open/urgent counts
- Severity badges on rows
- Empty state reassuring (“All clear”)
- Notification preferences entry at bottom
- Client/server fallback banner honest about data source

**Issues & actions**

| Priority | Issue | Recommendation |
|----------|-------|----------------|
| P1 | Each alert is a separate `Card` | Migrate to `SurfaceGroup` + inset rows; dismiss button inline or swipe (future) |
| P1 | Stat chips use bordered cards (`alertsStyles.statChip`) | Replace with `InlineStatBar` for parity with Account |
| P2 | Urgent count not reflected in header subtitle | When `urgentCount > 0`, lead with urgency in subtitle (copy fix applied) |
| P2 | Empty state lacks support escalation | Add support mailto hint (copy fix applied) |
| P3 | `prefsRow` is standalone bordered row | Move into `SurfaceGroup` “Settings” section |
| P3 | Dismiss only on server source | Document in UI when dismiss unavailable (client-derived alerts) |

**Grouped-surface completion**

- ⏳ List rows and stats still on old card pattern

### Floating tab bar (`FloatingTabBar`)

**Strengths**

- Floating bar with safe-area padding; does not obscure content when `FLOATING_TAB_BAR_CLEARANCE` used
- Feature flags hide Map/Alerts when disabled
- 44dp tab targets; clear labels

**Issues & actions**

| Priority | Issue | Recommendation |
|----------|-------|----------------|
| P1 | No alert badge on Alerts tab | Pass `alertCount` / `urgentCount` from dashboard hook; render badge on tab icon |
| P2 | Tab labels 10px — legible but small | Acceptable; ensure max 5 tabs (current) |
| P3 | “Assets” vs “Protection vault” naming | Tab: keep **Assets** (short); screen title **Protection vault** is OK |
| P3 | Map tab hidden when location disabled | Users may not discover map from Home; OK while INC-001 contained |

---

## Accessibility notes (WCAG 2.1 AA heuristic)

| Criterion | Status | Notes |
|-----------|--------|-------|
| 1.4.3 Contrast | Pass (assumed) | Navy hero white text; verify gold on cream for small text |
| 2.5.5 Target size | Mostly pass | Filter chips need padding fix |
| 2.4.4 Link purpose | Pass | “View all”, “View details” have context |
| 4.1.2 Name, role, value | Pass | `accessibilityRole` on pressables; bell has `accessibilityLabel` with count |
| Cognitive load | Review | Reduce duplicate sections; emergency ordering |

**Stressed users:** Prefer plain language over insurance jargon; severity labels (“Critical”, “High”) are OK if paired with **what to do** in `body` text.

---

## Success metrics (baseline before launch)

| Metric | Target | How to measure |
|--------|--------|----------------|
| Theft report initiation task success | ≥ 95% | Moderated test: “Your laptop was stolen — start a report” |
| Time to tap Report theft from Home | &lt; 10 s | Unmoderated prototype / production analytics |
| Alert triage task success | ≥ 90% | “You have a verification alert — find and open it” |
| SUS (mobile tab surfaces) | ≥ 68 | Post-refactor survey |
| Alerts tab discovery without Home visit | Track tab badge tap rate | Analytics event on badge impression/tap |

---

## Implementation handoff checklist

For `mobile-engineer` / `ui-designer`:

- [ ] Reorder Home: `HomeHeroActions` immediately after `FeaturedProtectionCard`
- [ ] Add Alerts tab badge to `FloatingTabBar`
- [ ] Migrate `AlertsScreen` rows to `SurfaceGroup` + `InlineStatBar`
- [ ] Migrate `AssetListScreen` list to `listSurface` + inset `AssetVaultCard`
- [ ] Unify section headers on `AppScreenSection` / `surfaceStyles`
- [ ] Filter chip 44dp touch targets
- [ ] Conditional emergency strip when recovery/critical alerts active
- [ ] Hide or flag dev-only “Send test notification” in Account
- [ ] Run 5-user moderated test on theft + alert flows before IA sign-off

---

## Copy changes applied in this pass (low-risk)

| Location | Change |
|----------|--------|
| `AlertsScreen` header subtitle | Surfaces urgent count when &gt; 0 |
| `AlertsScreen` empty state | Adds support contact reassurance |
| `AssetListScreen` stat label | “Attention” → “Needs attention” (aligns with filter) |

Further copy changes (e.g. theft CTA “Start recovery immediately”) deferred to `product-manager` / `technical-writer` until recovery SLA is confirmed in production.

---

## Sign-off status

| Gate | Status |
|------|--------|
| UX Research pre-approval checklist | **Partial** — heuristic complete; moderated test pending |
| IA final approval | **Not granted** — tab bar scaffold per `app/(app)/_layout.tsx` comment still applies |
| Ready for UI Design iteration | **Yes** — recommendations above are actionable |

**Signed:** `ux-researcher`, 2026-09-03.
