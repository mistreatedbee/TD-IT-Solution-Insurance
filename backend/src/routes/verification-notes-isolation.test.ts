/**
 * Feature 023 AC-A8 — internal verification notes must never reach a customer API.
 * Static guard: only the admin verification router may touch the notes repo.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const routesDir = dirname(fileURLToPath(import.meta.url));

describe('customer_verification_notes isolation (AC-A8)', () => {
  it('is referenced only by routes/admin-verification.ts', () => {
    const offenders = readdirSync(routesDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'admin-verification.ts')
      .filter((f) => /customerVerificationNotes|customer_verification_notes/.test(readFileSync(join(routesDir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
