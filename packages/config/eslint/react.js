// React/JSX rules for apps/web and packages/ui.
// - No hard-coded user-facing text in JSX (G-32, ADR-040): text comes from packages/i18n.
// - CSS logical properties only (RTL-ready, ADR-040): physical left/right keys are banned in
//   sx/style objects; use marginInlineStart, paddingInlineEnd, insetInlineStart …
// - Hooks and accessibility rules.
// @ts-expect-error -- eslint-plugin-jsx-a11y ships no type declarations
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

/** Physical-direction style keys and their logical replacements. */
export const PHYSICAL_STYLE_KEYS = {
  marginLeft: 'marginInlineStart',
  marginRight: 'marginInlineEnd',
  paddingLeft: 'paddingInlineStart',
  paddingRight: 'paddingInlineEnd',
  ml: 'marginInlineStart',
  mr: 'marginInlineEnd',
  pl: 'paddingInlineStart',
  pr: 'paddingInlineEnd',
  left: 'insetInlineStart',
  right: 'insetInlineEnd',
  borderLeft: 'borderInlineStart',
  borderRight: 'borderInlineEnd',
  borderLeftWidth: 'borderInlineStartWidth',
  borderRightWidth: 'borderInlineEndWidth',
  borderLeftColor: 'borderInlineStartColor',
  borderRightColor: 'borderInlineEndColor',
  borderTopLeftRadius: 'borderStartStartRadius',
  borderTopRightRadius: 'borderStartEndRadius',
  borderBottomLeftRadius: 'borderEndStartRadius',
  borderBottomRightRadius: 'borderEndEndRadius',
};

// Plugin typings disagree with ESLint's Plugin type; they are plain flat-config plugins.
/** @type {any} */ const jsxA11y = jsxA11yPlugin;
/** @type {any} */ const react = reactPlugin;
/** @type {any} */ const reactHooks = reactHooksPlugin;

const keyPattern = `^(${Object.keys(PHYSICAL_STYLE_KEYS).join('|')})$`;

/** @returns {import('eslint').Linter.Config[]} */
export function reactConfig() {
  return [
    {
      files: ['**/*.tsx', '**/*.jsx'],
      plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
      languageOptions: {
        globals: { ...globals.browser },
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      settings: { react: { version: '19.0' } },
      rules: {
        ...react.configs.flat.recommended.rules,
        ...react.configs.flat['jsx-runtime'].rules,
        ...reactHooks.configs.recommended.rules,
        ...jsxA11y.flatConfigs.recommended.rules,
        'react/prop-types': 'off',
        'react/jsx-no-literals': [
          'error',
          {
            noStrings: true,
            ignoreProps: true,
            noAttributeStrings: false,
            allowedStrings: ['·', '—', '–', '•', '/', '|', ':', '(', ')', '…', '×', '+', '-', '%'],
          },
        ],
      },
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: `Property > Identifier.key[name=/${keyPattern}/]`,
            message:
              'Use CSS logical properties (marginInlineStart, paddingInlineEnd, insetInlineStart, borderInlineStart …) — ADR-040, RTL-ready.',
          },
          {
            selector: `Property > Literal.key[value=/^(margin|padding|border)-(left|right)|^(left|right)$/]`,
            message: 'Use CSS logical properties (margin-inline-start …) — ADR-040.',
          },
          {
            selector: `Property[key.name=/^(textAlign|float|clear)$/] > Literal.value[value=/^(left|right)$/]`,
            message: "Use 'start' / 'end' instead of 'left' / 'right' — ADR-040.",
          },
        ],
      },
    },
    {
      // Tests and stories may use literal strings for fixtures.
      files: ['**/*.spec.tsx', '**/*.test.tsx'],
      rules: { 'react/jsx-no-literals': 'off' },
    },
  ];
}
