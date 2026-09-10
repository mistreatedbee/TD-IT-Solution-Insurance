module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    '.eslintrc.cjs',
    'backend/**',
    'mobile/**',
    'supabase/**',
    'scripts/**',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      // Feature 012 — SR-012-4 (docs/features/012-employee-dashboard/security-review.md
      // §10 item 10 / §4). The shared Home module must not import any role's API client,
      // directly or transitively, so AC-6 (no cross-role fetches) is a build error, not a
      // code-review catch, if ever regressed — same enforcement pattern precedent as
      // SR-011-1c.
      //
      // CTO-2 (docs/features/012-employee-dashboard/cto-review.md §1.2(b)/§2.1): this was
      // previously scoped to only `src/dashboard/components/HomeScreen.tsx`, which caught
      // a direct import in that one file but not in the two other shared modules
      // `HomeScreen.tsx` itself consumes — `src/dashboard/hooks/useHomeCount.ts` and
      // `src/dashboard/content/homeAnnouncements.ts` — either of which could acquire a
      // role-specific import with CI green. Widened to the whole `src/dashboard/**` shared
      // area rather than an enumerated file list, since everything under it today
      // (auth/, api/, components/, content/, hooks/) is genuinely role-agnostic — there is
      // no legitimately role-aware file in this directory to false-positive on. This still
      // catches only **direct** imports in each covered file — ESLint cannot see
      // transitive import graphs, so the "or transitively" half of SR-012-4's requirement
      // is not enforced by this rule (state this honestly; do not re-claim full
      // transitive coverage).
      //
      // Exception: `HomeScreen.crossRole.test.tsx` is the SR-012-4 adversarial negative
      // test itself — it legitimately imports all three roles' Home pages and API
      // clients specifically to assert each Home page calls exactly its own role's
      // client and none of the others' (AC-6). That is the one file in this directory
      // that is deliberately role-aware; excluding it here is the "targeted exception
      // list" CTO-2 asked for, not a loophole in the fence itself.
      files: ['src/dashboard/**'],
      excludedFiles: ['src/dashboard/components/HomeScreen.crossRole.test.tsx'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/admin/**', '**/security/**', '**/call-centre/**'],
                message:
                  'src/dashboard/** is shared across all three staff roles and must not ' +
                  'import any role-specific module (API client or otherwise) — inject ' +
                  'role data as props from that role\'s own route/page file instead ' +
                  '(C-012-A1 / SR-012-4).',
              },
            ],
          },
        ],
      },
    },
  ],
}
