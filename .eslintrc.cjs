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
      // §10 item 10 / §4). The shared Home screen must not import any role's API client,
      // directly or transitively, so AC-6 (no cross-role fetches) is a build error, not a
      // code-review catch, if ever regressed — same enforcement pattern precedent as
      // SR-011-1c.
      files: ['src/dashboard/components/HomeScreen.tsx'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/admin/**', '**/security/**', '**/call-centre/**'],
                message:
                  'HomeScreen is shared across all three staff roles and must not import ' +
                  'any role-specific module (API client or otherwise) — inject role data ' +
                  'as props from that role\'s own route/page file instead (C-012-A1 / SR-012-4).',
              },
            ],
          },
        ],
      },
    },
  ],
}
