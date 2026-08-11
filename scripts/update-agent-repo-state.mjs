/**
 * Injects a standardized "Current repo state" section into all .claude/agents/*.md files.
 * Run: node scripts/update-agent-repo-state.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.join(__dirname, '..', '.claude', 'agents');

const COMMON_BLOCK = `
## Current repo state (2026-08-12)

**Read \`HANDOFF.md\` at repo root before starting work** — it is the point-in-time status snapshot. Never claim a feature, integration, or endpoint exists without verifying in code.

### Built and verified
- **Web** (\`src/\`): design-system component library + marketing site only — no Admin or Security Company dashboards.
- **Backend** (\`backend/\`): Feature 001 auth (Supabase + sessions/MFA/\`GET /v1/admin/accounts\`) and Feature 004 **customer** policies/assets API (6 endpoints) — **85 tests green**. Polyglot per ADR-0002: identity → Supabase Postgres; domain → MongoDB Atlas.
- **Mobile** (\`mobile/\`): auth + Policy/Assets tabs on live API; Phase 2 recovery/claims **UI scaffold** (stub \`/recovery/*\` and \`/claims/*\` — backend returns 404 until Feature 005). **30 tests green.** EAS scaffold: \`mobile/docs/DEPLOY.md\`.
- **Auth email:** Supabase Edge Function \`auth-send-email\` (Send Email Hook) + \`backend/src/lib/transactional-email.ts\`.

### Not built — do not imply these exist
Claims/recovery **backend** · GPS ping ingestion · payments · Feature 004 admin policy/asset routes · asset photo upload (MP-5 — no object-storage vendor) · push notifications · Admin / Security Company dashboards · plan tier/pricing UI · staging environment · production email delivery (Brevo owner action pending) · app icon still Expo defaults (\`public/logo.png\` not wired).

### Open cross-cutting blockers
Supabase DPA (owner) · Brevo/SMTP for real verification email · FU-A14 (no case/recovery entity — blocks GPS Stage 1 / AUD-9) · FU-A11 investigative read credential · ADR-0008 Mongo provisioning (proposed, pending \`cto\` ratification).

### Non-negotiables
Check code before asserting. No secrets in source (\`.env.local\`, \`mobile/.env\` gitignored). Stage 8 + 10 are hard gates. POPIA compliance framework. Payment gateway and GPS hardware vendor are **open decisions** (\`integration-architect\`).
`.trim();

/** @type {Record<string, string>} */
const ROLE_TODAY = {
  'ai-solutions-architect':
    '**This role today:** No AI/ML systems in the repo — advisory and roadmap only until a business case clears architecture review.',
  'analytics-specialist':
    '**This role today:** No analytics pipelines or dashboards implemented — define metrics when transactional data surfaces exist.',
  'authentication-engineer':
    '**This role today:** Feature 001 shipped (MFA, device binding, refresh rotation, invitations, admin accounts list). Trail A AUD-3 implemented. Security-company operator scoping blocked until a case entity exists (FU-A14).',
  'automation-qa-engineer':
    '**This role today:** Backend 85 tests + mobile 30 tests green; Maestro E2E scaffold at `mobile/e2e/` — execution blocked on Brevo (email verification).',
  'backend-architect':
    '**This role today:** Feature 004 customer API authorized (MP-2); admin surface out of scope (MP-1). P-12 Mongo outage → `503 UPSTREAM_UNAVAILABLE` implemented.',
  'backend-engineer':
    '**This role today:** Feature 001 + Feature 004 customer routes shipped. Recovery/claims/payments/admin routes not built — implement only when scoped and designed.',
  'business-analyst':
    '**This role today:** Feature 004 Stage 1 `business-requirements.md` done; D-01–D-08 (tiers, pricing, claims rules) deferred.',
  'cloud-infrastructure-architect':
    '**This role today:** ADR-0003 Render hosting; no staging environment yet (MP-8). Co-own FU-A11 investigative credential with `database-architect`.',
  'compliance-specialist':
    '**This role today:** POPIA analysis in Feature 001 compliance docs; Supabase DPA not executed (owner blocker). Review any new third-party before live PII.',
  'cto':
    '**This role today:** Mobile production push Wave 0–2 substantially complete. Ratify ADR-0008. Critical path: Brevo → manual QA → Render deploy. FU-A14 blocks GPS Stage 1.',
  'cybersecurity-architect':
    '**This role today:** ADR-0006 ratified; Feature 004 Stage 8 sign-off granted. FU-A11 credential and 033 `NOT VALID` constraint promotion still open.',
  'database-architect':
    '**This role today:** Live Supabase + Mongo Feature 004 collections; migration 034 audit indexes applied. ADR-0008 proposed; purge scheduling (FU-A13) not scheduled.',
  'design-system-manager':
    '**This role today:** Web library in `src/components/*`; mobile bridge at `mobile/src/theme/primitives/` (`FormField`, `SelectChipGroup` for Feature 004).',
  'devops-engineer':
    '**This role today:** CI green; `render.yaml` + deploy docs filed. Live Render service and EAS owner steps (`eas init`) still pending.',
  'frontend-architect':
    '**This role today:** Product dashboards unbuilt. Mobile primitive bridge means web component changes can affect `mobile/src/theme/primitives/*`.',
  'frontend-engineer':
    '**This role today:** Only marketing site + component showcase in `src/` — Admin and Security Company dashboards do not exist yet.',
  'gps-integration-engineer':
    '**This role today:** **No GPS pipeline in production.** Mobile Phase 2 map/tracking UI uses stub APIs only. FU-A14 blocks Stage 1; hardware vendor open.',
  'integration-architect':
    '**This role today:** Payment gateway, GPS hardware, and object storage (MP-5) undecided. Supabase auth-email hook pattern deployed.',
  'manual-qa-engineer':
    '**This role today:** Feature 004 `manual-qa-checklist.md` filed — on-device execution pending Brevo + owner.',
  'mobile-architect':
    '**This role today:** Auth + Feature 004 customer flows shipped. Phase 2 offline/GPS/push still architectural targets, not production behavior.',
  'mobile-engineer':
    '**This role today:** Auth + Policy/Assets live; Phase 2 report-theft/live-tracking/claims UI scaffolded. Wire `public/logo.png` for store icon before release.',
  'notification-engineer':
    '**This role today:** Auth transactional email path exists; push notifications and preference center not built.',
  'payment-engineer':
    '**This role today:** **No billing/subscription system built** — gateway vendor not selected.',
  'performance-engineer':
    '**This role today:** No load tests at GPS scale; backend unit tests only. Run perf work when ingestion and staging exist.',
  'product-manager':
    '**This role today:** Feature 004 Stage 1 scope ratified; commercial rules (OQ-1–OQ-3) and D-01–D-08 still open.',
  'qa-architect':
    '**This role today:** Feature 004 `qa-test-strategy.md` filed; Stage 10 E2E blocked on real email verification (Brevo).',
  'recommendation-engine-specialist':
    '**This role today:** No recommendation system — roadmap/advisory only.',
  'reporting-engineer':
    '**This role today:** No reporting KPI dashboards or exports implemented.',
  'security-engineer':
    '**This role today:** Feature 001 + 004 security reviews with concurrence; remediate SR-004 open items. Run 033 constraint promotion verification.',
  'site-reliability-engineer':
    '**This role today:** No production SLOs/alerting/on-call — local dev and planned Render deploy only.',
  'solution-architect':
    '**This role today:** Chair Architecture Review; ADR-0008 pending ratification. Feature 004 Stage 7 disposition = MP-2 (`cto` fallback). ADR-0002 polyglot split is load-bearing.',
  'technical-project-manager':
    '**This role today:** Track mobile push completion — Brevo, Render provision, manual QA, MP-8 staging DB separation.',
  'technical-writer':
    '**This role today:** `HANDOFF.md` and READMEs synced 2026-08-12 — keep documentation honest per `docs/organization/07-documentation-standards.md`.',
  'ui-designer':
    '**This role today:** Feature 004 Phase 1 `ui-design.md` filed; Phase 2 recovery screens are engineering scaffolds without full Stage 3/4 sign-off.',
  'ux-researcher':
    '**This role today:** Feature 004 `ux-research-notes.md` (M-03 minimum); tab IA still architecture scaffold, not final researched IA.',
};

function stripExistingRepoState(content) {
  return content.replace(/\n## Current repo state[\s\S]*?(?=\n## [A-Z])/g, '');
}

function insertBeforeFirstSection(content, block) {
  const match = content.match(/\n## [A-Z]/);
  if (!match || match.index === undefined) {
    return `${content.trimEnd()}\n\n${block}\n`;
  }
  const idx = match.index;
  return `${content.slice(0, idx)}\n\n${block}${content.slice(idx)}`;
}

const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
let updated = 0;

for (const file of files.sort()) {
  const role = file.replace(/\.md$/, '');
  const filePath = path.join(agentsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = stripExistingRepoState(content);

  const roleLine = ROLE_TODAY[role];
  if (!roleLine) {
    console.warn(`No ROLE_TODAY entry for ${role}`);
  }

  const block = `${COMMON_BLOCK}${roleLine ? `\n\n${roleLine}` : ''}\n`;
  content = insertBeforeFirstSection(content, block);
  fs.writeFileSync(filePath, content, 'utf8');
  updated += 1;
}

console.log(`Updated ${updated} agent files in ${agentsDir}`);
