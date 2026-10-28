#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p out/ios/smoke
DEVICE=$(xcrun simctl list devices available -j | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{const d=Object.values(JSON.parse(s).devices).flat().find(d=>d.name.startsWith('iPhone'));if(!d)process.exit(1);console.log(d.udid)})")
xcrun simctl boot "$DEVICE" || true
xcrun simctl bootstatus "$DEVICE" -b
xcodebuild -quiet -workspace ios/MusicFree.xcworkspace -scheme MusicFreeNew \
  -configuration Release -sdk iphonesimulator -destination "id=$DEVICE" \
  -derivedDataPath out/ios/Simulator CODE_SIGNING_ALLOWED=NO build
APP=out/ios/Simulator/Build/Products/Release-iphonesimulator/MusicFree.app
xcrun simctl install "$DEVICE" "$APP"
xcrun simctl launch --terminate-running-process "$DEVICE" io.github.thejidex.musicfree | tee out/ios/smoke/launch.txt
sleep 15
xcrun simctl io "$DEVICE" screenshot out/ios/smoke/launch.png
xcrun simctl spawn "$DEVICE" log show --last 1m --style compact --predicate 'process == "MusicFree"' > out/ios/smoke/app.log
if grep -E 'Unhandled JS Exception|Terminating app due to uncaught exception|RCTFatalException' out/ios/smoke/app.log; then
  echo 'Application reported a fatal error.' >&2
  exit 1
fi
