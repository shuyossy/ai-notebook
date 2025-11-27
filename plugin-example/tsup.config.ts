import { defineConfig } from 'tsup';
import { nativeModuleDetectorPlugin } from './scripts/nativeModuleDetectorPlugin';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  sourcemap: false,
  clean: true,
  bundle: true,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
  // ネイティブモジュールの検出（禁止）
  noExternal: [/.*/],
  esbuildPlugins: [nativeModuleDetectorPlugin()],
  esbuildOptions(options: { banner?: { js?: string } }) {
    options.banner = {
      js: '// AIKATA Review Plugin\n// This plugin must not use native modules or dynamic imports\n',
    };
  },
});
