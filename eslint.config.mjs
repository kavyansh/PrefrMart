import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

/**
 * ESLint flat config. `next lint` was removed in Next 16, so ESLint runs directly and
 * eslint-config-next is consumed through its native flat-config export (no FlatCompat
 * bridge — that path fails on this version).
 *
 * The a11y rules are not decoration here: they are part of how the accessibility
 * requirement is enforced, catching unlabelled controls and handlers on
 * non-interactive elements at author time rather than in review.
 */
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      // Generated Prisma client: not ours to lint.
      'src/generated/**',
      'public/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  // Includes @next/next, react, react-hooks and jsx-a11y rule sets.
  ...nextCoreWebVitals,

  ...tseslint.configs.recommended,

  {
    rules: {
      // Unused vars are a real signal, but an `_`-prefixed one is a deliberate
      // placeholder (destructuring to drop a field, unused catch binding).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // Explicit `any` erases the type safety this project relies on. A warning
      // rather than an error, so a legitimate escape hatch is still possible.
      '@typescript-eslint/no-explicit-any': 'warn',

      // The single most important rule for the XSS requirement: no raw HTML
      // injection anywhere in the tree.
      'react/no-danger': 'error',
    },
  },

  // Scripts and the seed run under tsx, outside the app's module graph.
  {
    files: ['scripts/**/*.ts', 'prisma/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: {
      'no-console': 'off',
    },
  },

  /*
   * Component tests stand in for `next/image` with a plain `<img>`.
   *
   * The rule is about shipped pages — LCP and bandwidth — and neither exists in jsdom, which
   * cannot evaluate the layout `next/image` needs anyway. Scoped to test files so the rule keeps
   * doing its job everywhere it means something.
   */
  {
    files: ['**/*.test.tsx'],
    rules: {
      '@next/next/no-img-element': 'off',
    },
  },
);
