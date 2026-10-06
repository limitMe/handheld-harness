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
            {
              group: ['@opencode-ai/*', '@opencode-ai/**'],
              message:
                'The renderer must not import engine SDKs; go through window.handheld.engine.',
            },
            {
              group: ['**/main/engine/**', '**/main/**'],
              message: 'The renderer must not import main-process code.',
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
        {
          selector:
            'BinaryExpression[operator=/^(===|!==|==|!=)$/]:has(> Literal[value=/^(opencode|fake)$/]):has(> MemberExpression[property.name="kind"])',
          message: 'Do not branch on engine kind; use EngineCapabilities instead.',
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['electron', 'electron/*'],
              message: 'src/shared must stay free of electron.',
            },
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'src/shared must stay free of react.',
            },
            {
              group: ['@opencode-ai/*', '@opencode-ai/**'],
              message: 'src/shared must not depend on a specific engine SDK.',
            },
            {
              group: ['**/main/engine/**', '**/main/**'],
              message: 'src/shared must not import main-process code.',
            },
          ],
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
