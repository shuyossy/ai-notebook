/**
 * Build config for electron renderer process
 */

import path, { join } from 'path';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer';
import CssMinimizerPlugin from 'css-minimizer-webpack-plugin';
import { merge } from 'webpack-merge';
import TerserPlugin from 'terser-webpack-plugin';
import baseConfig from './webpack.config.base';
import webpackPaths from './webpack.paths';
import checkNodeEnv from '../scripts/check-node-env';
import deleteSourceMaps from '../scripts/delete-source-maps';
import CopyPlugin from 'copy-webpack-plugin';

checkNodeEnv('production');
deleteSourceMaps();

const configuration: webpack.Configuration = {
  devtool: 'source-map',

  mode: 'production',

  target: ['web', 'electron-renderer'],

  entry: [path.join(webpackPaths.srcRendererPath, 'index.tsx')],

  output: {
    path: webpackPaths.distRendererPath,
    publicPath: './',
    filename: 'renderer.js',
    library: {
      type: 'umd',
    },
  },

  /**
   * ここで Node.js の内部モジュールを空（false）でフォールバックさせる
   */
  resolve: {
    fallback: {
      _http_common: false, // @ai-sdk/provider-utils/testで参照されるが、テスト用なので空にしても問題ない
      // 必要なら他の内部モジュールも同様に設定
      // http: false,
      // https: false,
    },
  },

  module: {
    rules: [
      {
        test: /\.s?(a|c)ss$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              modules: true,
              sourceMap: true,
              importLoaders: 1,
            },
          },
          'sass-loader',
        ],
        include: /\.module\.s?(c|a)ss$/,
      },
      {
        test: /\.s?(a|c)ss$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'sass-loader'],
        exclude: /\.module\.s?(c|a)ss$/,
      },
      // Fonts
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
      },
      // Images
      {
        test: /\.(png|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
      // SVG
      {
        test: /\.svg$/,
        use: [
          {
            loader: '@svgr/webpack',
            options: {
              prettier: false,
              svgo: false,
              svgoConfig: {
                plugins: [{ removeViewBox: false }],
              },
              titleProp: true,
              ref: true,
            },
          },
          'file-loader',
        ],
      },
    ],
  },

  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin(), new CssMinimizerPlugin()],
  },

  plugins: [
    /**
     * Create global constants which can be configured at compile time.
     *
     * Useful for allowing different behaviour between development builds and
     * release builds
     *
     * NODE_ENV should be production so that modules do not perform certain
     * development checks
     */
    new webpack.EnvironmentPlugin({
      NODE_ENV: 'production',
      DEBUG_PROD: false,
    }),

    new MiniCssExtractPlugin({
      filename: 'style.css',
    }),

    new BundleAnalyzerPlugin({
      analyzerMode: process.env.ANALYZE === 'true' ? 'server' : 'disabled',
      analyzerPort: 8889,
    }),

    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: path.join(webpackPaths.srcRendererPath, 'index.ejs'),
      minify: {
        collapseWhitespace: true,
        removeAttributeQuotes: true,
        removeComments: true,
      },
      isBrowser: false,
      isDevelopment: false,
    }),

    new webpack.DefinePlugin({
      'process.type': '"renderer"',
    }),

    new CopyPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, '../../drizzle'),
          to: path.resolve(__dirname, '../../release/app/drizzle'),
        },
        {
          from: join(
            path.dirname(require.resolve('pdfjs-dist/package.json')),
            'legacy/build/pdf.worker.mjs',
          ),
          to: 'pdf.worker.mjs', // 出力先 (resources に入る)
        },
      ],
    }),
  ],
};

export default merge(baseConfig, configuration);
