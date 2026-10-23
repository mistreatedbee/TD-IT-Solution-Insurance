import { defineConfig } from 'vitest/config';

// Dedicated config for the ADR-0014 A-11 capability guard only. The main
// vitest.config.ts excludes this file from the default `npm test` run per
// ADR-0014 §20 (cto ruling, 2026-10-23), so it needs its own config to still
// be collected at all — `vitest run <path>` filters the files the main
// config's `include`/`exclude` already produced, it does not add an excluded
// file back in. Used only by the non-blocking `adr-0014-a11-guard` CI job.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/lib/adr-0014-a11-capability-guard.test.ts'],
    testTimeout: 15_000,
  },
});
