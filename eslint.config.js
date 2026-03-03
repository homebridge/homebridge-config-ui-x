import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: ['dist', 'info', 'ui/.angular', '.github/npm-version-script-esm.js'],
    typescript: true,
    angular: true,
    formatters: {
      css: true,
      html: true,
      markdown: true,
      svg: true,
    },
    rules: {
      'markdown/require-alt-text': 'off',
    },
  },
  {
    // JS/TS-specific rules (these crash on non-JS SourceCode objects like markdown)
    files: ['**/*.?([cm])[jt]s?(x)'],
    rules: {
      'curly': ['error', 'all'],
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-line-alignment': 'error',
      'jsdoc/no-bad-blocks': 'error',
      'jsdoc/no-blank-block-descriptions': 'error',
      'jsdoc/require-asterisk-prefix': 'error',
      'jsdoc/require-description-complete-sentence': 'off',
      'jsdoc/require-hyphen-before-param-description': 'error',
      'no-undef': 'error',
      'perfectionist/sort-exports': 'error',
      'perfectionist/sort-imports': [
        'error',
        {
          groups: [
            ['type-builtin', 'type-external', 'type-internal'],
            ['type-parent', 'type-sibling', 'type-index'],
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'side-effect',
            'unknown',
          ],
          internalPattern: ['^@/.*'],
          order: 'asc',
          type: 'natural',
          newlinesBetween: 1,
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
  },
)
  .override('antfu/formatter/html', config => ({
    ...config,
    files: config.files,
    ignores: ['ui/**/*.html'],
  }))
  .override('antfu/angular/rules/ts', config => ({
    ...config,
    files: ['ui/**/*.ts'],
    rules: {
      ...config.rules,
    },
  }))
  .override('antfu/angular/rules/template', config => ({
    ...config,
    files: ['ui/**/*.html'],
    rules: {
      ...config.rules,
    },
  }))
