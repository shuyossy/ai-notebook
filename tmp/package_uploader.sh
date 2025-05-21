#!/usr/bin/env bash
#===============================================================================
# GitLab Package Registry（Generic）へファイルをアップロードするスクリプト
# - アップロード対象は ./release/build 以下の installer.exe, installer.blockmap, latest.yml
# - パッケージバージョンは latest.yml の version フィールドから取得
#
# 使い方:
#   1. このファイルを upload_packages.sh などの名前で保存
#   2. 実行権限を付与: chmod +x upload_packages.sh
#   3. 必要項目を設定した上で実行: ./upload_packages.sh
#===============================================================================

set -euo pipefail

### 1. 環境変数・設定値 ###
GITLAB_API_URL="https://gitlab.com"             # GitLab API ベース URL
PROJECT_ID="123456"                             # 自分のプロジェクト ID に書き換え
PACKAGE_NAME="electron-installer"               # 任意のパッケージ名
PRIVATE_TOKEN="YOUR_PRIVATE_TOKEN_HERE"         # Personal Access Token (scope: api) or CI_JOB_TOKEN

### 2. ビルド成果物ディレクトリ ###
BUILD_DIR="./release/build"

# latest.yml が必ずあるかチェック
if [[ ! -f "${BUILD_DIR}/latest.yml" ]]; then
  echo "Error: ${BUILD_DIR}/latest.yml が見つかりません。" >&2
  exit 1
fi

### 3. バージョン取得 (latest.yml の最初の version: フィールドを抜き出し) ###
#   latest.yml の例:
#     version: 1.2.3
#     files:
#       - url: installer.exe
#         sha512: ...
VERSION=$(sed -n 's/^version:[[:space:]]*//p' "${BUILD_DIR}/latest.yml" | head -n1)

if [[ -z "$VERSION" ]]; then
  echo "Error: latest.yml から version が取得できませんでした。" >&2
  exit 1
fi
echo "Detected version: $VERSION"

### 4. アップロード対象ファイル ###
FILES=(
  "installer.exe"
  "installer.blockmap"
  "latest.yml"
)

### 5. アップロード処理 ###
for FILE in "${FILES[@]}"; do
  SRC_PATH="${BUILD_DIR}/${FILE}"
  if [[ ! -f "$SRC_PATH" ]]; then
    echo "Error: ファイル '$SRC_PATH' が見つかりません。" >&2
    exit 1
  fi

  echo "==> Uploading $FILE ..."
  HTTP_STATUS=$(curl --write-out "%{http_code}" --silent --show-error \
    --header "PRIVATE-TOKEN: ${PRIVATE_TOKEN}" \
    --upload-file "${SRC_PATH}" \
    "${GITLAB_API_URL}/api/v4/projects/${PROJECT_ID}/packages/generic/${PACKAGE_NAME}/${VERSION}/${FILE}")

  if [[ "$HTTP_STATUS" -ge 200 && "$HTTP_STATUS" -lt 300 ]]; then
    echo "    ✔ $FILE uploaded (HTTP $HTTP_STATUS)"
  else
    echo "    ✖ Failed to upload $FILE (HTTP $HTTP_STATUS)" >&2
    exit 1
  fi
done

echo "🎉 All files have been uploaded successfully! 🎉"
