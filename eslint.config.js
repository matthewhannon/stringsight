import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const layerPatterns = (...layers) =>
  layers.flatMap((layer) => [
    `../${layer}/**`,
    `../../${layer}/**`,
    `../../../${layer}/**`,
    `**/${layer}/**`,
  ]);

const restrictLayers = (...layers) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: layerPatterns(...layers),
          message: 'Import through an allowed subsystem contract instead of crossing this layer.',
        },
      ],
    },
  ],
});

export default defineConfig(
  globalIgnores([
    '.local',
    'coverage',
    'dist',
    'node_modules',
    'playwright-report',
    'test-results',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: restrictLayers('app', 'audio', 'fusion', 'music', 'vision', 'workers'),
  },
  {
    files: ['src/music/**/*.{ts,tsx}'],
    rules: restrictLayers('app', 'audio', 'fusion', 'vision', 'workers'),
  },
  {
    files: ['src/audio/**/*.{ts,tsx}'],
    rules: restrictLayers('app', 'fusion', 'vision'),
  },
  {
    files: ['src/vision/**/*.{ts,tsx}'],
    rules: restrictLayers('app', 'audio', 'fusion'),
  },
  {
    files: ['src/fusion/**/*.{ts,tsx}', 'src/workers/**/*.{ts,tsx}'],
    rules: restrictLayers('app'),
  },
  {
    files: ['**/*.config.{js,ts}', 'eslint.config.js', 'scripts/**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
);
