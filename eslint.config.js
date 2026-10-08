// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const REACT_SOURCES = [
  'apps/desktop/src/**/*.{ts,tsx}',
  'apps/mobile/src/**/*.{ts,tsx}',
  'packages/ui/src/**/*.{ts,tsx}',
];

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/dist-electron/',
    '**/dev-dist/',
    '**/release/',
    'apps/desktop/staging/',
    '**/coverage/',
    '**/.turbo/',
    'apps/backend/src/generated/',
  ]),

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Los módulos de NestJS son clases vacías con decoradores.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },

  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['apps/backend/**/*.ts', 'apps/desktop/electron/**/*.ts', '**/*.config.ts'],
    languageOptions: { globals: globals.node },
  },

  {
    files: REACT_SOURCES,
    extends: [reactHooks.configs.flat['recommended-latest'], reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  {
    // Los DTO de class-validator se esparcen a propósito como datos planos hacia Prisma.
    files: ['apps/backend/src/modules/**/*.ts'],
    rules: { '@typescript-eslint/no-misused-spread': 'off' },
  },

  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      // Aserciones sobre cuerpos HTTP y mocks: el tipado estricto aporta poco en pruebas.
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  prettier,
);
