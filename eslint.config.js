const { antfu } = require('@antfu/eslint-config')

module.exports = antfu({
  ignores: ['dist', 'ui/.angular', 'ui/src/assets/monaco-0.21.3'],
  rules: {
    'jsdoc/check-alignment': 'error',
    'jsdoc/check-line-alignment': 'error',
    'no-undef': 'error',
    'perfectionist/sort-exports': 'error',
    'perfectionist/sort-imports': [
      'error',
      {
        groups: [
          'type',
          'internal-type',
          ['parent-type', 'sibling-type', 'index-type'],
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling', 'index'],
          'side-effect',
          'object',
          'unknown',
        ],
        internalPattern: ['^@/.*'],
        order: 'asc',
        type: 'natural',
        newlinesBetween: 'always',
      },
    ],
    'perfectionist/sort-named-exports': 'error',
    'perfectionist/sort-named-imports': 'error',
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
    svg: true,
  },
})
