# ブラウザ実行ファイルのインストール方法
```
PLAYWRIGHT_BROWSERS_PATH=0
npx playwright install
```
# 注意
webpackの設定でwindows固有のパスからchromium実行ファイルをコピーしてきているので、macでは動かない（コピーできなくてエラーになる）
