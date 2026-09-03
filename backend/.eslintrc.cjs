// Mirrors the root project's .eslintrc.cjs style (same plugin set for TS),
// adapted for a Node backend (no browser/react-specific rules).
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2022,
  },
  rules: {},
  overrides: [
    {
      // SR-011-1c (docs/features/011-saps-case-reporting/security-review.md): the
      // customer-only police-report serializers must never be importable from any
      // security-company- or support-agent-facing route. A wrong import here is a
      // build/lint error, not a code-review catch.
      files: ['src/routes/security-cases.ts', 'src/routes/support-lookup.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: '../lib/police-report-serializers.js',
                message:
                  'Police-report fields (sapsCaseNumber/reportingStation/reportedToPoliceAt/policeReportHistory) are customer-only per C-011-9 / SR-011-1. Do not import police-report-serializers.ts into a security-company or support-agent-facing route.',
              },
              {
                name: '../lib/police-report-serializers',
                message:
                  'Police-report fields (sapsCaseNumber/reportingStation/reportedToPoliceAt/policeReportHistory) are customer-only per C-011-9 / SR-011-1. Do not import police-report-serializers.ts into a security-company or support-agent-facing route.',
              },
            ],
          },
        ],
      },
    },
  ],
}
