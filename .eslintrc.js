module.exports = {
    root: true,
    env: {
      node: true,
      es6: true,
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: [ '.js', '.jsx', '.ts', '.tsx' ],
          moduleDirectory: [ 'node_modules', 'src/']
        }
      }
    },
    parserOptions: { ecmaVersion: 8, sourceType: 'module' },
    ignorePatterns: ['node_modules/*' ],
    extends: ['eslint:recommended'],
    overrides: [
      {
        files: ['**/*.ts', '**/*.tsx'],
        parser: '@typescript-eslint/parser',
        settings: {
          react: { version: 'detect' },
          'import/resolver': {
            typescript: {},
          },
        },
        env: {
          browser: true,
          node: true,
          es6: true,
        },
        extends: [
          'eslint:recommended',
          'plugin:import/errors',
          'plugin:import/warnings',
          'plugin:import/typescript',
          'plugin:@typescript-eslint/eslint-recommended',
          'plugin:react/recommended',
          'plugin:react-hooks/recommended',
          'plugin:jsx-a11y/recommended',
          'plugin:prettier/recommended',
          'plugin:testing-library/react',
          'plugin:jest-dom/recommended',
          'plugin:@typescript-eslint/recommended',
        ],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: ['src/features/*/*'],
            },
          ],
          'linebreak-style': ['off'],
          'react/prop-types': 'off',
  
          'import/order': [
            'error',
            {
              groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object'],
              'newlines-between': 'never',
              alphabetize: { caseInsensitive: true },
            },
          ],
          'import/default': 'off',
          'import/no-named-as-default-member': 'off',
          'import/no-named-as-default': 'off',
          'react/react-in-jsx-scope': 'off',
          'jsx-a11y/anchor-is-valid': 'off',
          '@typescript-eslint/no-unused-vars': ['off'],
          '@typescript-eslint/explicit-function-return-type': ['off'],
          '@typescript-eslint/explicit-module-boundary-types': ['off'],
          '@typescript-eslint/no-empty-function': ['off'],
          '@typescript-eslint/no-explicit-any': ['off'],
          'prettier/prettier': 0,
          'import/export': 0
        },
      },
    ],
    ignorePatterns: [
      'src/__deprecated/*'
    ]
  };