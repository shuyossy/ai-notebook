echo.
echo [1/3] 最新バージョンを問い合わせ中...
for /f "usebackq delims=" %%V in (`
  powershell -NoProfile -Command ^
    " $u = '%GITLAB_URL%/api/v4/projects/%PROJECT_ID%/packages?package_type=generic^&package_name=%PACKAGE_NAME%^&order_by=created_at^&sort=desc^&per_page=1'; ^
      $h = @{ 'PRIVATE-TOKEN' = '%GITLAB_TOKEN%' }; ^
      $pkg = Invoke-RestMethod -Headers $h -Uri $u -Method Get; ^
      if ($pkg) { $pkg[0].version } "
`) do set "LATEST_VERSION=%%V"

if "%LATEST_VERSION%"=="" (
    echo ERROR: パッケージ %PACKAGE_NAME% の最新バージョンが取得できませんでした。
    pause
    exit /b 1
)
echo    -> 最新バージョン: %LATEST_VERSION%
