#!/usr/bin/env node
/**
 * Production build gate — business-requirements.md Section 12.5.2 /
 * Section 12.8 condition #8 (Feature 002, public landing page).
 *
 * Every compliance-mandated footer/legal placeholder in the codebase uses
 * the literal substring "— pending" (an em dash followed by "pending"),
 * e.g. `[FSP NUMBER — pending]`, `[COMPANY REG NO — pending]`,
 * `[SUPPORT EMAIL — pending]`. That convention exists specifically so a
 * single mechanical check can catch them all before a production deploy.
 *
 * This script scans a built output directory (default: `dist/`) for that
 * string and exits non-zero if any occurrence is found, so a real
 * production publish cannot ship with unresolved regulatory placeholders
 * (a fabricated-looking or missing FSP/insurer licence number is treated
 * by compliance-specialist as the single most serious failure mode on
 * this page — see business-requirements.md Section 12.5.2).
 *
 * Usage:
 *   node scripts/check-no-placeholders.mjs [dir]
 *
 * Typical wiring (not wired into CI by this change — see report to
 * devops-engineer): run after `npm run build`, before any deploy step,
 * e.g. `npm run build && npm run check:no-placeholders`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const PLACEHOLDER = '— pending';
const SCAN_EXTENSIONS = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.svg']);

const targetDir = process.argv[2] ?? 'dist';

function collectFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.error(`[check-no-placeholders] Could not read directory "${dir}": ${err.message}`);
    console.error('[check-no-placeholders] Did you run `npm run build` first?');
    process.exit(1);
  }

  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (SCAN_EXTENSIONS.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = collectFiles(targetDir);
const offenders = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  if (content.includes(PLACEHOLDER)) {
    const lines = content.split('\n');
    const matchingLines = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.includes(PLACEHOLDER));
    offenders.push({ file, count: matchingLines.length });
  }
}

if (offenders.length > 0) {
  console.error(
    `\n[check-no-placeholders] FAILED — found the literal string "${PLACEHOLDER}" in ${offenders.length} build file(s):\n`
  );
  for (const { file, count } of offenders) {
    console.error(`  ${file}  (${count} occurrence${count === 1 ? '' : 's'})`);
  }
  console.error(
    '\nThis build cannot go to production with unresolved regulatory/legal placeholders ' +
      '(FSP number, insurer licence, company reg no, support email, etc. — see ' +
      'business-requirements.md Section 12.5.2 and Section 12.8 condition #1/#2).\n'
  );
  process.exit(1);
}

console.log(
  `[check-no-placeholders] OK — no "${PLACEHOLDER}" strings found in ${files.length} scanned file(s) under "${targetDir}".`
);
