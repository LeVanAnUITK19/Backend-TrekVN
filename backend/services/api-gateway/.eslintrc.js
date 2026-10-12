module.exports = {
  env: { node: true, es2022: true, jest: true },
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 'latest' },
  globals: { fetch: 'readonly' },
  rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
};
