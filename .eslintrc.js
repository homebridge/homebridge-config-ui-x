module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  ignorePatterns: [
    "ui/",
    'ui/**/*',
    'dist/**/*',
    '.eslintrc.js'
  ],
  plugins: ['@typescript-eslint/eslint-plugin', 'import', 'import-newlines', 'sort-exports'],
  extends: [
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  rules: {
    '@typescript-eslint/lines-between-class-members': ['warn', 'always', { exceptAfterOverload: true, exceptAfterSingleLine: true }],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', vars: 'local', varsIgnorePattern: 'key' }],
    'eol-last': ['error', 'always'],
    'import-newlines/enforce': ['error', 3],
    'import/order': ['warn', { alphabetize: { order: 'asc' }, 'newlines-between': 'never' }],
    'indent': ['error', 2, { SwitchCase: 1 }],
    'no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],
    'quotes': ['error', 'single'],
    'sort-exports/sort-exports': ['warn', { sortDir: 'asc' }],
    'sort-imports': ['warn', { ignoreDeclarationSort: true }],
    'space-before-function-paren': ['error', { named: 'never' }],
  },
  overrides: [
    {
      files: [
        '**/test/**/*.spec.{j,t}s?(x)',
        '**/test/**/*.e2e-spec.{j,t}s?(x)',
      ],
      plugins: [
        'jest',
      ],
      extends: [
        'plugin:jest/recommended',
        'plugin:jest/style',
      ],
      rules: {
        '@typescript-eslint/no-explicit-any': ['off'],
        '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', vars: 'local', varsIgnorePattern: 'key|wrapper' }],
        'jest/no-conditional-expect': ['off']
      },
      env: {
        jest: true,
      },
    }
  ]
};
