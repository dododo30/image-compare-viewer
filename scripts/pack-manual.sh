#!/usr/bin/env bash
# 备用打包脚本：绕过 electron-builder 的"解压后重命名"步骤，
# 用于腾讯电脑管家等安全软件锁定新解压文件、导致标准 npm run pack 失败的情况。
# 用法（VS Code 的 Git Bash 终端）: bash scripts/pack-manual.sh
set -e
cd "$(dirname "$0")/.."
export PATH="/c/Program Files/nodejs:$PATH"

echo "[1/5] 编译网页..."
npm run build

echo "[2/5] 解压 Electron 运行时..."
ZIP=$(ls -t "$LOCALAPPDATA/electron/Cache/"*/electron-*-win32-x64.zip 2>/dev/null | head -1)
[ -n "$ZIP" ] || { echo "找不到缓存的 Electron zip，请先成功执行过一次 npm run pack 或 npm install"; exit 1; }
rm -rf release .build-staging
mkdir -p release/win-unpacked
unzip -q "$(cygpath -u "$ZIP")" -d release/win-unpacked
sleep 8   # 等待安全软件扫描完新解压的文件

echo "[3/5] 生成 app.asar..."
mkdir -p .build-staging
cp -r dist electron package.json .build-staging/
npx asar pack .build-staging release/win-unpacked/resources/app.asar
rm -f release/win-unpacked/resources/default_app.asar
mv release/win-unpacked/electron.exe "release/win-unpacked/图片对比查看器.exe"

echo "[4/5] 打 portable 包..."
npx electron-builder --win portable --prepackaged release/win-unpacked

echo "[5/5] 清理中间产物..."
rm -rf .build-staging release/my-app-*.nsis.7z release/builder-debug.yml
ls -lh release/*.exe
