// プロジェクト直下に保存: jest.esm-smart-transformer.cjs
const fs = require('fs');
const path = require('path');
const babelJest = require('babel-jest');

function findNearestPackageJson(startFile) {
  let dir = path.dirname(startFile);
  while (true) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) return pkg;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isEsmPackage(filePath) {
  // node_modules配下だけ対象。自分のソースは ts-jest に任せる想定。
  if (!filePath.includes(`${path.sep}node_modules${path.sep}`)) return false;

  const pkgJsonPath = findNearestPackageJson(filePath);
  if (!pkgJsonPath) return false;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

    // 1) type: module
    if (pkg.type === 'module') return true;

    // 2) exports フィールドが ESM を示唆（超簡易判定）
    const exp = pkg.exports;
    if (
      typeof exp === 'string' &&
      (exp.endsWith('.mjs') || exp.includes('/esm'))
    )
      return true;
    if (typeof exp === 'object' && exp !== null) {
      const v = exp.import || exp.module;
      if (typeof v === 'string' && (v.endsWith('.mjs') || v.includes('/esm')))
        return true;
    }

    // 3) module フィールド
    if (typeof pkg.module === 'string') return true;

    // 4) main が .mjs
    if (typeof pkg.main === 'string' && pkg.main.endsWith('.mjs')) return true;

    return false;
  } catch {
    return false;
  }
}

// 内部で babel-jest を使う。preset-env は babel.config.js を参照させる。
const babelTransformer = babelJest.createTransformer({});

module.exports = {
  process(src, filename, jestOptions) {
    // ESMパッケージなら Babel で CJS へ変換
    if (isEsmPackage(filename)) {
      return babelTransformer.process(src, filename, jestOptions);
    }
    // それ以外（CJS or 自前JS）は “そのまま” 返す（Jestがそのまま実行）
    return { code: src };
  },

  // キャッシュキーに近傍 package.json の更新を織り込む（賢くキャッシュ）
  getCacheKey(fileData, filePath, transformOptions) {
    const pkgJsonPath = findNearestPackageJson(filePath);
    const pkgStat =
      pkgJsonPath && fs.existsSync(pkgJsonPath)
        ? fs.statSync(pkgJsonPath).mtimeMs.toString()
        : 'nopkg';
    return [
      'esm-smart-transformer-v1',
      pkgStat,
      filePath.includes(`${path.sep}node_modules${path.sep}`) ? 'nm' : 'app',
      transformOptions && transformOptions.instrument ? 'inst' : 'noinst',
    ].join(':');
  },
};
