# Web design-system rollout audit (2026-11-19)

Scope: every page under `src/pages`, `src/customer`, `src/admin`, `src/security`, `src/dashboard`, plus `src/call-centre`, `src/invitations`, `src/onboarding`. Baseline: web PR #9 (tokens in `design-system/tokens.json`, `src/styles/td-tokens.css`, `src/components/td/*`) and mobile PR #13.

Method: grep for hard-coded or legacy palette classes (`bg-white`, `slate-*`, `gray-*`, `emerald/amber/red-*`, `bg-surface-navy-deep`), hard-coded hex in `src/App.tsx`, and use of shared primitives. The legacy CSS variables (`--background`, `--text-primary`, `--border`, ...) were already aliased to `--td-*` in `src/index.css`, so only the Tailwind `slate/gray/white/emerald/amber/red` classes and hard-coded values were truly off-system. Browser checks: headless Chrome screenshots of `/`, `/login`, `/admin/login`, `/privacy` in Day and Night (html `data-theme`). Authenticated pages need a live API session and were checked through the shared primitives and unit tests, not screenshots.

## Root causes found (these explain most rows)

| Cause | Where | Effect |
|---|---|---|
| App shell hard-coded `#ffffff` / `#111827` | `src/App.tsx` | Night theme showed a white page with dark text on every non-customer route |
| `Card` used `bg-white`, `rounded-2xl`, `shadow-resting` | `src/components/Card` | Every admin/security/call-centre/customer sub-page had the legacy card look and no Night surface |
| `Badge`, `Input`, `SectionHeading`, `Accordion`, `FeatureCard`, `TestimonialCard`, `Carousel`, `LogoCloud`, `AssetBadge`, `IndustryCard` used slate/gray/emerald/amber/red | `src/components/*` | Dark text on dark ground in Night; off-palette status colours |
| `ui.tsx` (`InlineAlert`, `DetailGrid`, `DataTable`) used legacy aliases and `rounded-lg` | `src/dashboard/components/ui.tsx` | All admin/security/call-centre tables and alerts |
| `DashboardShell` plain bg; privileged login and invitation page on `bg-surface-navy-deep` | `PrivilegedLoginPage.tsx`, `InvitationAcceptPage.tsx` | Admin/security/call-centre shell and login did not use TdBackdrop or glass |
| Native `<select>`/`<input>` with `border-slate-300 text-slate-900` | admin, call-centre pages | Invisible text in Night |

## Per-page status

"Before" is origin/main; "After" is this branch.

| Surface / file | Before | After |
|---|---|---|
| `src/customer/layout/CustomerDashboardLayout.tsx` | Done in PR #9 (TdBackdrop, TdNavBar, glass) | Unchanged |
| `src/pages/customer/CustomerDashboardPage.tsx` | Done (Td components) | Unchanged |
| `CustomerAlertsPage`, `CustomerChangePlanPage`, `CustomerProfilePage`, `CustomerNotificationPreferencesPage`, `CustomerVerificationCentrePage`, `CustomerAccountSettingsPage` | Legacy Card/Badge/Input, `text-glass-text-*`, `bg-border` toggle track, `text-primary` (navy, unreadable in Night) | Shared primitives td-styled; text/border/toggle classes mapped to `td-*` tokens |
| `CustomerProtectionMapPage`, `src/customer/map/ProtectionMapCanvas.tsx`, `src/customer/api/asset-location.ts` | Legacy slate/primary classes | SKIPPED: owned by another agent |
| `src/customer/components/ProfilePictureControl`, `CustomerSurfaceGroup`, `MarketingAuthShell` | Mixed; shell already Td | Token classes mapped; shell unchanged |
| `src/admin/layout/AdminLayout.tsx` + `DashboardShell` | Flat `bg-background-alt` sidebar, no backdrop | TdBackdrop ground, glass/raised sidebar, td radius, mobile drawer behaviour kept |
| `AdminHomePage`, `AdminAnalyticsPage`, `AdminAuditLogPage`, `AdminVerificationPages`, `InviteStaffPage`, `PartnerOrganizationPages`, `AdminPlansPages`, `AdminClaimsPages`, `AdminCaseDispatchPages`, `AdminDataPages` | slate/amber/emerald/red classes, hard-coded status pill colours, legacy Card | Colours mapped to `td-*`; status pills use td success/warning tokens; Card/DataTable/InlineAlert/DetailGrid restyled via shared primitives |
| `src/admin/pages/AdminLocationsPage.tsx` | not on main | SKIPPED: owned by another agent |
| `src/admin/components/StepUpDialog.tsx` | Legacy aliases | Token classes mapped |
| `src/security/layout/SecurityLayout.tsx`, `pages/SecurityHomePage`, `pages/SecurityCasePages` | Shared shell/Card/table legacy | Inherit new shell, Card, DataTable, Badge; token classes mapped |
| `src/security/demo/DemoShell.tsx` | Amber-400 demo banner | Kept on purpose: demo-mode warning must stay high-visibility; build-guarded |
| `src/call-centre/*` (layout, home, `CustomerLookupPage`, `SupportCasesPages`, `RecoveryCaseDetailPage`) | slate form controls, legacy aliases | Token classes mapped; shared shell/primitives |
| `src/dashboard/components/PrivilegedLoginPage.tsx`, `HomeScreen.tsx`, `ui.tsx` | `bg-surface-navy-deep` login, legacy alert/table | TdBackdrop login, td alerts/tables |
| `src/invitations/InvitationAcceptPage.tsx`, `MfaEnrollmentStep.tsx` | `bg-surface-navy-deep`, legacy classes | TdBackdrop ground; classes mapped |
| `src/pages/Customer{Login,Signup,ForgotPassword,ResetPassword,AuthCallback,EmailVerified}Page`, `onboarding/*` | Done in PR #9 (MarketingAuthShell + Td components) | Unchanged |
| `LandingPage`, `LandingHeader`, `HeroFeatures`, `HeroVisual`, `PlansSection`, `WhatToExpectSection`, `MobileAppDownloadSection`, `WaitlistForm`, `PrivacyPolicyPage`, `TermsOfServicePage`, `DeleteAccountPage` | `bg-white`, `bg-white/90` header, slate form/text, `border-primary/10`; hero logo PNG white box on dark | Surfaces use `td-bg-raised` (or `color-mix` of it); text/border tokens; in Night the logo gets a white tile (the PNG is opaque) |
| Shared `src/components/*` (Card, Badge, Input, Section, SectionHeading, Accordion, FeatureCard, TestimonialCard, Carousel, LogoCloud, AssetBadge, IndustryCard, ArrowLink, Logo) | Legacy palette | Prop APIs unchanged; classes moved to `td-*`; Badge tones now td success/warning/neutral |
| `src/App.tsx` | Hard-coded white/ink | `var(--td-bg-page)` / `var(--td-ink)` |

## Known gaps (not fixed here)

- Night is not user-selectable on the web yet (`src/lib/td-theme.ts` sets it; no toggle UI), so Night was verified by forcing `data-theme="night"` on the built `index.html`.
- `public/logo.png` is opaque; a transparent or dual-theme logo asset is still needed for the marketing hero and header.
- Admin data tables still scroll horizontally inside `overflow-x-auto` at 375px rather than reflowing to cards.
- `src/security/demo/guards.test.ts` runs `vite build` via `node_modules/vite/bin/vite.js`; in an isolated worktree without a full `node_modules` it fails for environmental reasons, unrelated to this work.
- Stage 8: classes only, no new data access or routes. Existing waivers in `docs/organization/gates/stage8-manifest.json` are unchanged.
