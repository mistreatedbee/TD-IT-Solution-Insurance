const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['src/api/generated/**', '.expo/**', 'dist/**'],
  },
];
