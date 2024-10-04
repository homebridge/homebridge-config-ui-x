const { antfu } = require('@antfu/eslint-config')

module.exports = antfu({
  ignores: ['dist', 'ui/.angular', 'ui/src/assets/monaco'],
  rules: {
    'curly': ['error'],
    'import/extensions': 'off',
    'import/order': 'off',
    'jsdoc/check-alignment': 'error',
    'jsdoc/check-line-alignment': 'error',
    'new-cap': 'off',
    'no-undef': 'error',
    'perfectionist/sort-exports': 'error',
    'perfectionist/sort-named-exports': 'error',
    'perfectionist/sort-named-imports': 'error',
    'quotes': ['error', 'single'],
    'sort-imports': 'off',
    'style/brace-style': ['error', '1tbs'],
    'style/quote-props': ['error', 'consistent-as-needed'],
    'test/no-only-tests': 'error',
    'ts/consistent-type-imports': 'off',
    'unicorn/no-useless-spread': 'error',
    'unused-imports/no-unused-vars': ['error', { caughtErrors: 'none' }],
  },
  typescript: true,
  formatters: {
    css: true,
    html: true,
    markdown: true,
  },
})
