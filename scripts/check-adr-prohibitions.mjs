#!/usr/bin/env node
/**
 * CI-2 — ADR prohibition guard (INC-001 §6).
 *
 * Machine-checkable rules for ratified ADR prohibitions. Fails the build with
 * the ADR section quoted when a rule is violated.
 *
 * Usage: node scripts/check-adr-prohibitions.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const rules = [
  {
    id: 'ADR-0009-no-location-report-route-without-waiver',
    adr: 'ADR-0009 §14 / INC-001',
    check() {
      const assetsPath = join(repoRoot, 'backend/src/routes/assets.ts');
      const content = readFileSync(assetsPath, 'utf8');
      if (content.includes('location-report')) {
        const envPath = join(repoRoot, 'backend/src/config/env.ts');
        const envContent = readFileSync(envPath, 'utf8');
        if (!envContent.includes('LOCATION_INGESTION_ENABLED')) {
          return 'location-report route exists but LOCATION_INGESTION_ENABLED kill switch is missing (backend/src/config/env.ts).';
        }
      }
      return null;
    },
  },
  {
    id: 'ADR-0009-preview-build-location-flag-off',
    adr: 'ADR-0009 §18.7 / INC-001 A-12',
    check() {
      const easPath = join(repoRoot, 'mobile/eas.json');
      const eas = JSON.parse(readFileSync(easPath, 'utf8'));
      for (const profile of ['preview', 'production']) {
        const flag = eas.build?.[profile]?.env?.EXPO_PUBLIC_FEATURE_LOCATION_TRACKING;
        if (flag !== 'false') {
          return `mobile/eas.json ${profile} profile must set EXPO_PUBLIC_FEATURE_LOCATION_TRACKING to "false" (found: ${JSON.stringify(flag)}).`;
        }
      }
      return null;
    },
  },
  {
    id: 'gate-a-client-flags-off',
    adr: 'INC-001 A-12 / Release Gate A criterion 6',
    check() {
      const easPath = join(repoRoot, 'mobile/eas.json');
      const eas = JSON.parse(readFileSync(easPath, 'utf8'));
      const requiredFalse = [
        'EXPO_PUBLIC_FEATURE_CLAIMS',
        'EXPO_PUBLIC_FEATURE_LOCATION_TRACKING',
        'EXPO_PUBLIC_FEATURE_KYC',
        'EXPO_PUBLIC_FEATURE_ALERTS',
        'EXPO_PUBLIC_FEATURE_THEFT_REPORTING',
        'EXPO_PUBLIC_FEATURE_HARDWARE_TRACKING',
        'EXPO_PUBLIC_FEATURE_SECURITY_OPERATOR',
      ];
      for (const profile of ['preview', 'production']) {
        const env = eas.build?.[profile]?.env ?? {};
        for (const key of requiredFalse) {
          if (env[key] !== 'false') {
            return `mobile/eas.json ${profile} must set ${key} to "false" (found: ${JSON.stringify(env[key])}).`;
          }
        }
      }
      return null;
    },
  },
  {
    id: 'FR-18-21-no-support-case-escalation',
    adr: 'C-010-4 / api-design.md §7 / security-review.md SR-010-5 item 1',
    check() {
      // FR-18–21 (escalating a support_case to a recovery_case) is specified in
      // api-design.md §7 but explicitly NOT AUTHORIZED FOR IMPLEMENTATION (Stage 1
      // blocked on C-010-4). This rule is the mechanical guardrail security-review.md
      // §11.7/§12 (SR-010-5 item 1) required so that building the endpoint is a
      // reviewable, CI-failing act rather than something prose alone prevents.

      // 1) No registered route whose path mentions "escalate".
      const routesPath = join(repoRoot, 'backend/src/routes/support-cases.ts');
      const routesContent = readFileSync(routesPath, 'utf8');
      const routeCallPattern = /router\.(get|post|patch|put|delete)\(\s*[`'"]([^`'"]*)[`'"]/gi;
      let match;
      while ((match = routeCallPattern.exec(routesContent)) !== null) {
        const [, method, path] = match;
        if (path.toLowerCase().includes('escalate')) {
          return `backend/src/routes/support-cases.ts registers ${method.toUpperCase()} ${path} — FR-18–21 escalation route is NOT AUTHORIZED FOR IMPLEMENTATION (C-010-4).`;
        }
      }

      // 2) No repository method writes escalatedToRecoveryCaseId / escalatedAt to
      // anything other than the fixed `null` they're created with, and no method
      // writes status to 'escalated'.
      const repoPath = join(repoRoot, 'backend/src/repositories/support-cases.ts');
      const repoContent = readFileSync(repoPath, 'utf8');

      // Known-good lines: the DB row/document type declarations (`string | null` /
      // `Date | null`), the read-through passthroughs in the two serializers/toCase,
      // and the single `null` literal each field is created with in createForAccount.
      // Anything else assigning these keys is a write path this repository is
      // designed to never have.
      const allowedFieldLines = new Set([
        'escalatedToRecoveryCaseId: string | null;',
        'escalatedAt: Date | null;',
        'escalatedToRecoveryCaseId: row.escalatedToRecoveryCaseId ?? null,',
        'escalatedAt: row.escalatedAt ?? null,',
        'escalatedToRecoveryCaseId: doc.escalatedToRecoveryCaseId,',
        'escalatedAt: doc.escalatedAt?.toISOString() ?? null,',
        'escalatedToRecoveryCaseId: null,',
        'escalatedAt: null,',
      ]);
      const fieldKeyPattern = /^(escalatedToRecoveryCaseId|escalatedAt)\s*:/;
      for (const rawLine of repoContent.split('\n')) {
        const line = rawLine.trim();
        if (fieldKeyPattern.test(line) && !allowedFieldLines.has(line)) {
          return `backend/src/repositories/support-cases.ts has an unexpected write target for FR-18–21 escalation fields: "${line}". No method here may set escalatedToRecoveryCaseId/escalatedAt to anything but null.`;
        }
      }

      if (/status\s*:\s*['"`]escalated['"`]/.test(repoContent)) {
        return `backend/src/repositories/support-cases.ts sets status to 'escalated' — no repository method may transition a support_case to 'escalated' (FR-18–21 not authorized).`;
      }

      // 3) No exported repository method named/shaped like an escalation write.
      if (/\bescalate\w*\s*\(/i.test(repoContent)) {
        return `backend/src/repositories/support-cases.ts appears to define an escalate*() method — FR-18–21 escalation is NOT AUTHORIZED FOR IMPLEMENTATION (C-010-4).`;
      }

      return null;
    },
  },
];

function main() {
  const failures = [];

  for (const rule of rules) {
    const message = rule.check();
    if (message) {
      failures.push({ id: rule.id, adr: rule.adr, message });
    }
  }

  if (failures.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[check-adr-prohibitions] FAIL\n');
    for (const failure of failures) {
      // eslint-disable-next-line no-console
      console.error(`  [${failure.id}] (${failure.adr})\n    ${failure.message}\n`);
    }
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`[check-adr-prohibitions] PASS — ${rules.length} rules checked.`);
}

main();
