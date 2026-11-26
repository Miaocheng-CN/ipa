#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if ! xcrun --sdk iphoneos --show-sdk-path >/dev/null 2>&1; then echo '需要在装有完整 Xcode 和 iOS SDK 的 Mac 上运行。'; exit 1; fi
bash Tests/check-visitor.sh
dst="$PWD/build"
mkdir -p "$dst"
xcodebuild -project Qingying.xcodeproj -target Qingying -configuration Release -sdk iphoneos CONFIGURATION_BUILD_DIR="$dst/Release" CODE_SIGNING_ALLOWED=NO build
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/Payload"
ditto "$dst/Release/Qingying.app" "$stage/Payload/Qingying.app"
for asset in Games/index.html Cloud/index.html Comics/index.html Comics/spread.js extract.js; do test -f "$stage/Payload/Qingying.app/$asset"; done
test -x "$stage/Payload/Qingying.app/Qingying"
(cd "$stage" && /usr/bin/ditto -c -k --keepParent Payload "$dst/Qingying-iPad-1.1.40-unsigned.ipa")
echo "完成：$dst/Qingying-iPad-1.1.40-unsigned.ipa（需自行签名）"
