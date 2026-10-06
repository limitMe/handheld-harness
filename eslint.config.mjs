import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

const PALETTE_PATTERN =
  /(?:^|\s)(?:bg|text|border|ring|outline|fill|stroke|shadow|from|via|to|divide|accent|caret|decoration|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:[/\s-]|$)/

const HEX_PATTERN = /#[0-9a-fA-F]{3,8}\b/

export default tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**', 'tests/e2e/artifacts/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.mjs', '**/*.cjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/renderer/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@base-ui/react', '@base-ui/react/*'],
              message: 'Import Base UI only through src/renderer/src/ui.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/' + HEX_PATTERN.source + '/]',
          message: 'Use semantic color tokens instead of hard-coded hex colors.',
        },
        {
          selector: 'Literal[value=/' + PALETTE_PATTERN.source + '/]',
          message: 'Use semantic tokens instead of the Tailwind color palette.',
        },
      ],
    },
  },
  {
    files: ['src/renderer/src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
)
