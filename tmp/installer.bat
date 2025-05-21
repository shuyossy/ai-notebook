@echo off
REM ==========================================================
REM  GitLab Package Registry から最新 installer.exe を落として実行
REM ----------------------------------------------------------
REM  必要環境:
REM   - Windows 10 以降（curl / PowerShell 同梱）
REM   - %USERPROFILE%\.gitlab_token にパッケージ取得用トークンを保存
REM ==========================================================

REM ▼===== 固定値を書き換える =====
set "GITLAB_URL=https://gitlab.example.com"
set "PROJECT_ID=1234"
set "PACKAGE_NAME=my-electron-app"
REM ▲===========================

REM --- トークン読込 ---
set "TOKEN_FILE=%USERPROFILE%\.gitlab_token"
if not exist "%TOKEN_FILE%" (
    echo ERROR: %TOKEN_FILE% が見つかりません。トークンを保存してください。
    pause
    exit /b 1
)
for /f "usebackq delims=" %%T in ("%TOKEN_FILE%") do set "GITLAB_TOKEN=%%T"

REM --- 最新バージョンを取得 ---------------------------------
echo.
echo [1/3] 最新バージョンを問い合わせ中...
for /f "usebackq delims=" %%V in (`
  powershell -NoProfile -Command ^
    "$u='%GITLAB_URL%/api/v4/projects/%PROJECT_ID%/packages' + ^
       '?package_type=generic&package_name=%PACKAGE_NAME%&order_by=created_at&sort=desc&per_page=1'; ^
     $h=@{'PRIVATE-TOKEN'='%GITLAB_TOKEN%'}; ^
     $pkg = Invoke-RestMethod -Headers $h -Uri $u -Method Get; ^
     if($pkg){$pkg[0].version}"
`) do set "LATEST_VERSION=%%V"

if "%LATEST_VERSION%"=="" (
    echo ERROR: パッケージ %PACKAGE_NAME% の最新バージョンが取得できませんでした。
    pause
    exit /b 1
)
echo    -> 最新バージョン: %LATEST_VERSION%

REM --- installer.exe をダウンロード -------------------------
echo.
echo [2/3] インストーラをダウンロード中...
set "DL_URL=%GITLAB_URL%/api/v4/projects/%PROJECT_ID%/packages/generic/%PACKAGE_NAME%/%LATEST_VERSION%/installer.exe"
set "DEST=%TEMP%\installer-%LATEST_VERSION%.exe"

curl --header "PRIVATE-TOKEN: %GITLAB_TOKEN%" ^
     --location --fail --output "%DEST%" "%DL_URL%"
if errorlevel 1 (
    echo ERROR: ダウンロードに失敗しました。
    pause
    exit /b 1
)

REM --- インストーラ起動 --------------------------------------
echo.
echo [3/3] インストーラを実行します...
start /wait "" "%DEST%"
echo.
echo 完了しました。
