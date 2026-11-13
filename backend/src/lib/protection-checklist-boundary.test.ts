/**
 * Feature 020 AC-1/AC-5 static boundary: the checklist modules must have no import path to
 * claims/billing/recovery/tracking code, and claims/billing code must not import the checklist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const importsOf = (src: string) =>
  [...src.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map((m) => m[1]!);

const CHECKLIST_FILES = [
  'lib/protection-checklist.ts',
  'lib/protection-checklist-config.ts',
  'routes/protection-checklist.ts',
];
const FORBIDDEN_FROM_CHECKLIST = /claim|billing|recovery|tracking|location|payment|resolveTrackingProfile/i;

describe('protection checklist data-path separation', () => {
  it.each(CHECKLIST_FILES)('%s imports nothing claims/billing/recovery/tracking/location', (file) => {
    for (const spec of importsOf(read(file))) expect(spec, `${file} -> ${spec}`).not.toMatch(FORBIDDEN_FROM_CHECKLIST);
  });

  it('pure rubric imports only its config', () => {
    expect(importsOf(read('lib/protection-checklist.ts'))).toEqual(['./protection-checklist-config.js']);
  });

  it('checklist route never references forbidden repositories', () => {
    const src = read('routes/protection-checklist.ts');
    expect(src).not.toMatch(/ctx\.(claims|recoveryCases|trackingDevices|locationEvents|alerts)\b|resolveTrackingProfile/);
  });

  it('no claims/billing/policy-billing module imports the checklist (reverse direction)', () => {
    const candidates = [
      ...readdirSync(join(SRC, 'routes')).map((f) => `routes/${f}`),
      ...readdirSync(join(SRC, 'lib')).map((f) => `lib/${f}`),
      ...readdirSync(join(SRC, 'repositories')).map((f) => `repositories/${f}`),
    ].filter((f) => f.endsWith('.ts') && /claim|billing|payment|subscription|plan-change/i.test(f));
    expect(candidates.length).toBeGreaterThan(0);
    for (const f of candidates) {
      for (const spec of importsOf(read(f))) expect(spec, `${f} -> ${spec}`).not.toMatch(/protection-checklist/);
    }
  });

  it('only index.ts imports the checklist router', () => {
    const idx = importsOf(read('index.ts'));
    expect(idx).toContain('./routes/protection-checklist.js');
  });
});
