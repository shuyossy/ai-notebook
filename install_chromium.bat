@echo off
SETLOCAL

REM ————————————————
REM 1. 変数定義
REM ————————————————
set HOST=https://your.playwright_download_host
set REV=901522   REM ← 実際の Chromium リビジョン番号を指定
set CACHE_DIR=%USERPROFILE%\.cache\ms-playwright\chromium-%REV%
set ZIP_TEMP=%TEMP%\playwright-chromium-%REV%.zip

REM ————————————————
REM 2. キャッシュディレクトリ作成
REM ————————————————
if not exist "%CACHE_DIR%" (
  mkdir "%CACHE_DIR%"
)

REM ————————————————
REM 3. ZIP をダウンロード
REM ————————————————
powershell -Command ^
  "Invoke-WebRequest -Uri '%HOST%/chromium/%REV%/chrome-win.zip' -OutFile '%ZIP_TEMP%'"

IF NOT EXIST "%ZIP_TEMP%" (
  echo [ERROR] ZIP のダウンロードに失敗しました。
  exit /b 1
)

REM ————————————————
REM 4. ZIP 展開
REM ————————————————
powershell -Command ^
  "Expand-Archive -Path '%ZIP_TEMP%' -DestinationPath '%CACHE_DIR%' -Force"

REM ————————————————
REM 5. インストール完了マーカーを作成
REM ————————————————
echo. > "%CACHE_DIR%\.complete"

REM ————————————————
REM 6. 一時ファイルクリーンアップ
REM ————————————————
del /Q "%ZIP_TEMP%"

echo [OK] Chromium のダウンロードが完了しました: %CACHE_DIR%
ENDLOCAL
