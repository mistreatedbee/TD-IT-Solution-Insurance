import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
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
