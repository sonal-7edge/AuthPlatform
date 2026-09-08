import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output — the library's and each example app's.
  globalIgnores(['**/dist/**', '**/node_modules/**']),
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [js.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // A leading underscore marks a binding that exists only to be destructured
      // away (stripping `password` from a user object, for instance).
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },
  {
    // The CLI and build tooling run under Node, not the browser.
    files: ['*.config.js', 'scripts/**/*.mjs', 'bin/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
])
