module.exports = {
  env: {
    node: true,
    commonjs: true,
    es2021: true,
    jest: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    // Errors
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'warn',
    'no-var': 'error',

    // Style
    'prefer-const': 'error',
    'eqeqeq': ['error', 'always'],
    'curly': ['error', 'all'],
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { avoidEscape: true }],

    // Async/await best practices
    'no-return-await': 'error',
    'require-await': 'warn',
  },
  ignorePatterns: ['node_modules/', 'coverage/'],
};
