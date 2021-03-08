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
  ],
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
    'prettier/@typescript-eslint',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  rules: {
    'quotes': ['error', 'single'],
    'comma-dangle': ['error', 'only-multiline'],
    'no-multiple-empty-lines': ['warn', { max: 1, maxEOF: 0 }],
    'eol-last': ['error', 'always'],
    'space-before-function-paren': ['error', { named: 'never' }],
    '@typescript-eslint/lines-between-class-members': ['warn', 'always', { exceptAfterOverload: true, exceptAfterSingleLine: true }],
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/semi': ['warn'],
    '@typescript-eslint/member-delimiter-style': ['warn'],
    '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', vars: 'local', varsIgnorePattern: 'key' }],
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
