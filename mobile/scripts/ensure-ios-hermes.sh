#!/usr/bin/env bash
set -euo pipefail
# Download before pod install, which otherwise probes a remote URL and may
# silently fall back to building Hermes main. Release builds use this exact binary.
VERSION=$(node -p "require('./node_modules/react-native/package.json').version")
DIRECTORY=ios/Pods/hermes-engine-artifacts
mkdir -p "$DIRECTORY"
ARCHIVE="$DIRECTORY/hermes-ios-$VERSION-release.tar.gz"
if tar -tzf "$ARCHIVE" >/dev/null 2>&1; then exit 0; fi
for HOST in https://repo.maven.apache.org/maven2 https://repo1.maven.org/maven2; do
  URL="$HOST/com/facebook/react/react-native-artifacts/$VERSION/react-native-artifacts-$VERSION-hermes-ios-release.tar.gz"
  if curl --fail --location --retry 3 --retry-all-errors --connect-timeout 20 --max-time 120 --retry-max-time 180 "$URL" -o "$ARCHIVE.tmp" \
    && tar -tzf "$ARCHIVE.tmp" >/dev/null 2>&1; then
    mv -f "$ARCHIVE.tmp" "$ARCHIVE"
    exit 0
  fi
done
echo 'Unable to obtain a valid pinned Hermes release archive.' >&2
exit 1
