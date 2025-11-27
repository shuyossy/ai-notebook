import type { Plugin } from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

/**
 * パッケージルートディレクトリを探索する
 * 与えられたファイルパスからpackage.jsonを含むディレクトリを探す
 */
function findPackageRoot(filePath: string): string | null {
  let currentDir = path.dirname(filePath);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * ネイティブモジュールかどうかを判定する
 * 複数の指標を用いて包括的に検知
 */
function isNativeModule(packageRoot: string): boolean {
  try {
    // 1. package.json確認
    const pkgPath = path.join(packageRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);

      // gypfileフィールドまたはbinaryフィールドがあればネイティブモジュール
      if (pkg.gypfile || pkg.binary) {
        return true;
      }
    }

    // 2. binding.gypファイルの存在確認
    if (fs.existsSync(path.join(packageRoot, 'binding.gyp'))) {
      return true;
    }

    // 3. build/Release/*.nodeパターンの存在確認
    const buildRelease = path.join(packageRoot, 'build', 'Release');
    if (fs.existsSync(buildRelease)) {
      const files = fs.readdirSync(buildRelease);
      if (files.some((f) => f.endsWith('.node'))) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // エラーが発生した場合は安全側に倒してネイティブモジュールではないと判定
    // （ファイルシステムエラーなどで判定できない場合）
    return false;
  }
}

/**
 * ネイティブモジュール検知用のesbuildプラグイン
 *
 * 以下の方法でネイティブモジュールを検知します：
 * 1. .nodeファイル拡張子の直接import
 * 2. package.jsonのgypfile/binaryフィールド
 * 3. binding.gypファイルの存在
 * 4. build/Release/*.nodeパターン
 */
export const nativeModuleDetectorPlugin = (): Plugin => ({
  name: 'native-module-detector',
  setup(build) {
    // .nodeファイル直接import検知
    build.onResolve({ filter: /\.node$/ }, (args) => {
      return {
        errors: [
          {
            text: `Native module (.node file) is not allowed: ${args.path}`,
            detail:
              'Plugins cannot use .node binary modules for security and portability reasons.',
            location: args.importer
              ? {
                  file: args.importer,
                  namespace: args.namespace,
                }
              : undefined,
          },
        ],
      };
    });

    // パッケージ解決時にネイティブモジュールチェック
    build.onResolve({ filter: /.*/ }, (args) => {
      // 相対パスや絶対パスはスキップ（プロジェクト内ファイル）
      if (args.path.startsWith('.') || args.path.startsWith('/')) {
        return undefined;
      }

      // Node.js組み込みモジュールはスキップ
      if (
        args.path === 'fs' ||
        args.path === 'path' ||
        args.path === 'crypto' ||
        args.path === 'http' ||
        args.path === 'https' ||
        args.path === 'url' ||
        args.path === 'util' ||
        args.path === 'stream' ||
        args.path === 'events' ||
        args.path === 'buffer' ||
        args.path === 'process' ||
        args.path === 'os'
      ) {
        return undefined;
      }

      try {
        // node_modules内のパッケージパスを取得
        const resolved = require.resolve(args.path, {
          paths: [args.resolveDir || process.cwd()],
        });

        // パッケージルートを探索
        const packageRoot = findPackageRoot(resolved);
        if (!packageRoot) {
          return undefined;
        }

        // ネイティブモジュールの指標をチェック
        if (isNativeModule(packageRoot)) {
          return {
            errors: [
              {
                text: `Native module detected: ${args.path}`,
                detail: `The package "${args.path}" contains native bindings and cannot be used in plugins for security and portability reasons.`,
                location: args.importer
                  ? {
                      file: args.importer,
                      namespace: args.namespace,
                    }
                  : undefined,
              },
            ],
          };
        }

        return undefined;
      } catch (error) {
        // require.resolveが失敗した場合はesbuildに解決を任せる
        return undefined;
      }
    });
  },
});
