module.exports = {
  extends: 'erb',
  plugins: ['@typescript-eslint'],
  rules: {
    // A temporary hack related to IDE not resolving correct package.json
    'import/no-extraneous-dependencies': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-filename-extension': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-import-module-exports': 'off',
    'import/prefer-default-export': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-console': 'off',
    'react/require-default-props': 'off', // パラメータのデストラクチャリングでデフォルト値を設定する方式を許可
    'react/function-component-definition': [
      'error',
      {
        // 名前付きコンポーネント（export const Foo = ...）は arrow-function を許可
        namedComponents: ['arrow-function', 'function-declaration'],
        // 無名コンポーネント（props => …）も arrow-function を許可
        unnamedComponents: ['arrow-function', 'function-expression'],
      },
    ],
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ForAwaitStatement',
        message: 'async iterator は重いため使用非推奨です',
      },
    ],
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  settings: {
    'import/resolver': {
      // See https://github.com/benmosher/eslint-plugin-import/issues/1396#issuecomment-575727774 for line below
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        moduleDirectory: ['node_modules', 'src/'],
      },
      webpack: {
        config: require.resolve('./.erb/configs/webpack.config.eslint.ts'),
      },
      typescript: {},
    },
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts', '.tsx'],
    },
  },
};
