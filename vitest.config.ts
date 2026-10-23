import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // ADR-0014 A-11 guard is excluded from the default run (and so from the
    // blocking frontend `Test` CI step) per ADR-0014 §20 (cto ruling,
    // 2026-10-23): the guard's own assertion — that the browser Supabase SDK
    // is gone — isn't true until the Phase 1 cutover ships, so it is a Phase
    // 1 exit gate, not a required check on main today. It still runs, as
    // informational/non-blocking, in its own CI job. Remove this exclusion
    // in the Phase 1 cutover PR per §20 item 5.
    exclude: ['src/lib/adr-0014-a11-capability-guard.test.ts'],
    // 15s, up from the 5s default: several files (demo build guards,
    // ADR-0014 A-11 capability guard) spawn real `vite build` child
    // processes, and now that `npm test` runs in CI (ADR-0014 A-11) those
    // builds run concurrently with the rest of the suite. Under that CPU
    // contention, ordinary component tests can legitimately exceed 5s even
    // though they do no I/O of their own; this does not loosen any
    // assertion, only the budget to run it.
    testTimeout: 15_000,
  },
});
