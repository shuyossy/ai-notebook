@REM @echo off
REM ==========================================================
REM  GitLab Package Registry から最新 installer.exe を落として実行
REM  ※PowerShell は使いません
REM ==========================================================

REM ▼===== 固定値を書き換える =====
set "GITLAB_URL=https://gitlab.example.com"
set "PROJECT_ID=1234"
set "PACKAGE_NAME=my-electron-app"
REM ▲===========================

REM --- トークン読込 ---
@REM set "TOKEN_FILE=%USERPROFILE%\.gitlab_token"
@REM if not exist "%TOKEN_FILE%" (
@REM     echo ERROR: %TOKEN_FILE% が見つかりません。トークンを保存してください。
@REM     pause
@REM     exit /b 1
@REM )
@REM for /f "usebackq delims=" %%T in ("%TOKEN_FILE%") do set "GITLAB_TOKEN=%%T"
@REM if "%GITLAB_TOKEN%"=="" (
@REM     echo ERROR: トークンが空です。%TOKEN_FILE% の中身を確認してください。
@REM     pause
@REM     exit /b 1
@REM )

REM --- 1) 最新バージョンを API で取得 ---------------------
echo.
echo [1/3] 最新バージョンを問い合わせ中...
set "API_URL=%GITLAB_URL%/api/v4/projects/%PROJECT_ID%/packages?package_type=generic&package_name=%PACKAGE_NAME%&order_by=created_at&sort=desc&per_page=1"

curl --silent --header "PRIVATE-TOKEN: %GITLAB_TOKEN%" ^
     --location "%API_URL%" > "%TEMP%\pkg.json"
if errorlevel 1 (
    echo ERROR: API レスポンスの取得に失敗しました。
    del "%TEMP%\pkg.json" 2>nul
    pause
    exit /b 1
)

REM JSONから "version":"1.2.3" の 1.2.3 部分を抽出
for /f "tokens=2 delims=:," %%V in (
    'findstr /i /c:"\"version\"" "%TEMP%\pkg.json"'
) do (
    set "LATEST_VERSION=%%~V"
    goto :FOUND
)
:FOUND
if "%LATEST_VERSION%"=="" (
    echo ERROR: 最新バージョンの解析に失敗しました。
    del "%TEMP%\pkg.json" 2>nul
    pause
    exit /b 1
)
del "%TEMP%\pkg.json"
echo    -> 最新バージョン: %LATEST_VERSION%

REM --- 2) installer.exe をダウンロード -------------------
echo.
echo [2/3] インストーラをダウンロード中...
set "DL_URL=%GITLAB_URL%/api/v4/projects/%PROJECT_ID%/packages/generic/%PACKAGE_NAME%/%LATEST_VERSION%/installer.exe"
set "DEST=%TEMP%\installer-%LATEST_VERSION%.exe"

curl --header "PRIVATE-TOKEN: %GITLAB_TOKEN%" ^
     --silent --fail --location --output "%DEST%" "%DL_URL%"
if errorlevel 1 (
    echo ERROR: ダウンロードに失敗しました。
    pause
    exit /b 1
)

REM --- 3) インストーラを実行 ----------------------------
echo.
echo [3/3] インストーラを実行します...
start /wait "" "%DEST%"
echo.
echo 完了しました。
