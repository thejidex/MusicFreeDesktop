#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'iOS builds require macOS and Xcode.' >&2; exit 1; }
VERSION=$(node -p "require('./package.json').version.split('.').slice(0,2).join('.')")
OUTPUT="../release/MusicFree-v${VERSION}-ios-unsigned.ipa"
[[ ! -e "$OUTPUT" ]] || { echo "Output already exists: $OUTPUT" >&2; exit 1; }
export RCT_NEW_ARCH_ENABLED=0
bundle exec pod install --project-directory=ios
xcodebuild -workspace ios/MusicFree.xcworkspace -scheme MusicFreeNew \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath out/ios/DerivedData -archivePath out/ios/MusicFree.xcarchive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' \
  MARKETING_VERSION="$VERSION" archive
mkdir -p out/ios/ipa/Payload ../release
APP=out/ios/MusicFree.xcarchive/Products/Applications/MusicFree.app
[[ -d "$APP" && -f "$APP/main.jsbundle" ]] || { echo 'Native app or JS bundle missing.' >&2; exit 1; }
cp -R "$APP" out/ios/ipa/Payload/
(cd out/ios/ipa && /usr/bin/zip -qry "$(cd ../../../.. && pwd)/release/MusicFree-v${VERSION}-ios-unsigned.ipa" Payload)
(cd ../release && shasum -a 256 "MusicFree-v${VERSION}-ios-unsigned.ipa" > "SHA256SUMS-v${VERSION}-ios.txt")
echo 'UNSIGNED IPA: users must sign this package before installing on an iPhone.'
