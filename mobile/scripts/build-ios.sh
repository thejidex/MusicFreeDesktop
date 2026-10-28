#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'iOS builds require macOS and Xcode.' >&2; exit 1; }
VERSION=$(node -p "require('./package.json').version.split('.').slice(0,2).join('.')")
OUTPUT="$PWD/../release/MusicFree-v${VERSION}-ios-unsigned.ipa"
[[ ! -e "$OUTPUT" ]] || { echo "Output already exists: $OUTPUT" >&2; exit 1; }
export RCT_NEW_ARCH_ENABLED=0
node scripts/collect-notices.cjs
bash scripts/ensure-ios-hermes.sh
RN_VERSION=$(node -p "require('./node_modules/react-native/package.json').version")
# A failed remote HEAD probe must never silently select Hermes's latest main.
export HERMES_ENGINE_TARBALL_PATH="$PWD/ios/Pods/hermes-engine-artifacts/hermes-ios-$RN_VERSION-release.tar.gz"
bundle exec pod install --project-directory=ios
xcodebuild -quiet -workspace ios/MusicFree.xcworkspace -scheme MusicFreeNew \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath out/ios/DerivedData -archivePath out/ios/MusicFree.xcarchive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY='' \
  MARKETING_VERSION="$VERSION" archive
mkdir -p out/ios ../release
PACKAGING=$(mktemp -d "$PWD/out/ios/ipa.XXXXXX")
mkdir -p "$PACKAGING/Payload"
APP=out/ios/MusicFree.xcarchive/Products/Applications/MusicFree.app
[[ -d "$APP" && -f "$APP/main.jsbundle" ]] || { echo 'Native app or JS bundle missing.' >&2; exit 1; }
cp -R "$APP" "$PACKAGING/Payload/"
cp out/notices/* "$PACKAGING/Payload/MusicFree.app/"
cp 'ios/Pods/Target Support Files/Pods-MusicFree/Pods-MusicFree-acknowledgements.plist' "$PACKAGING/Payload/MusicFree.app/THIRD-PARTY-IOS.plist"
(cd "$PACKAGING" && /usr/bin/zip -qry "$OUTPUT" Payload)
(cd ../release && shasum -a 256 "MusicFree-v${VERSION}-ios-unsigned.ipa" > "SHA256SUMS-v${VERSION}-ios.txt")
echo 'UNSIGNED IPA: users must sign this package before installing on an iPhone.'
