const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['src/api/generated/**', '.expo/**', 'dist/**'],
  },
  {
    files: ['**/*.test.{ts,tsx}', 'jest.setup.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
];
