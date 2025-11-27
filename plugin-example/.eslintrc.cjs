module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // 動的require/importを禁止 - セキュリティ上の理由でビルド時にエラーとする
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="require"]',
        message:
          'Dynamic require() is not allowed in plugins for security reasons',
      },
      {
        selector: 'ImportExpression',
        message:
          'Dynamic import() is not allowed in plugins for security reasons',
      },
    ],
    // console使用はログに置き換わるため許可
    'no-console': 'off',
  },
};
