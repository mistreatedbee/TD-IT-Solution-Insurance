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
