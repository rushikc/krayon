import tseslint from 'typescript-eslint';

export default tseslint.config({
  files: ['packages/*/src/**/*.ts', 'local-backend/src/**/*.ts', 'backend/src/**/*.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint.plugin,
  },
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: true, checksConditionals: true }],
  },
});
