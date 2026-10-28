#!/usr/bin/env bash
set -euo pipefail
# RN 0.76's pod helper does not fail when its curl subprocess fails. Validate
# both archives before Xcode's Hermes replacement phase tries to extract them.
VERSION=$(node -p "require('./node_modules/react-native/package.json').version")
DIRECTORY=ios/Pods/hermes-engine-artifacts
mkdir -p "$DIRECTORY"
for CONFIGURATION in debug release; do
  ARCHIVE="$DIRECTORY/hermes-ios-$VERSION-$CONFIGURATION.tar.gz"
  if tar -tzf "$ARCHIVE" >/dev/null 2>&1; then continue; fi
  OK=false
  for HOST in https://repo.maven.apache.org/maven2 https://repo1.maven.org/maven2; do
    URL="$HOST/com/facebook/react/react-native-artifacts/$VERSION/react-native-artifacts-$VERSION-hermes-ios-$CONFIGURATION.tar.gz"
    if curl --fail --location --retry 3 --retry-all-errors --connect-timeout 20 "$URL" -o "$ARCHIVE.tmp" \
      && tar -tzf "$ARCHIVE.tmp" >/dev/null 2>&1; then
      mv -f "$ARCHIVE.tmp" "$ARCHIVE"
      OK=true
      break
    fi
  done
  [[ "$OK" == true ]] || { echo "Unable to obtain a valid Hermes $CONFIGURATION archive." >&2; exit 1; }
done
