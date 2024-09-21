#!/bin/bash

# set -x

TARGET_PLUGIN="$1"
TARGET_VERSION="$2"
TARGET_PATH="$3"

TARGET_PLUGIN_BUNDLE_NAME="${TARGET_PLUGIN/\//@}-${TARGET_VERSION}"

REPO_BASE_URL="https://github.com/homebridge/verified/releases/download/v1.0.0"

echo "Target Version: $TARGET_VERSION"
echo "Target Path: $TARGET_PATH"

echo ""

SHASUM_COMMAND=""
if command -v shasum > /dev/null; then
  SHASUM_COMMAND="shasum -a 256"
elif command -v sha256sum > /dev/null; then
  SHASUM_COMMAND="sha256sum"
else
  echo "Failed to find required shasum or sha256sum command."
  exit 1
fi

if ! command -v curl > /dev/null; then
  echo "Failed to find required curl command."
fi

if ! command -v jq > /dev/null; then
  echo "Failed to find required jq command."
fi

tmp_dir=$(mktemp -d -t "$TARGET_PLUGIN_BUNDLE_NAME".XXXXXXX)
if ! [ "$tmp_dir" ]; then
  echo "Failed to create temporary directory."
  exit 1
fi

echo "Downloading ${TARGET_PLUGIN_BUNDLE_NAME}.sha256..."
if ! curl -fsSL# -o "$tmp_dir/SHASUMS256.txt" "$REPO_BASE_URL/${TARGET_PLUGIN_BUNDLE_NAME}.sha256"; then
  echo "Failed to download SHASUMS256.txt"
  exit 1
fi

echo "Downloading ${TARGET_PLUGIN_BUNDLE_NAME}.tar.gz..."
if ! curl -fL# -o "$tmp_dir/${TARGET_PLUGIN_BUNDLE_NAME}.tar.gz" "$REPO_BASE_URL/${TARGET_PLUGIN_BUNDLE_NAME}.tar.gz"; then
  echo "Failed to download homebridge-config-ui-x-${TARGET_VERSION}.tar.gz"
  exit 1
fi
echo ""

echo "Verifying download..."
if ! cd "$tmp_dir"; then
  echo "Failed to change directory to $tmp_dir"
  exit 1
fi
$SHASUM_COMMAND -c SHASUMS256.txt
if ! $SHASUM_COMMAND -c SHASUMS256.txt; then
  echo "Download failed integrity check."
  rm -rf "$tmp_dir"
  exit 1
fi
echo ""

if [ ! -d "$TARGET_PATH" ]; then
  mkdir -p "$TARGET_PATH"
fi

echo "Creating backup..."
if [ -d "$TARGET_PATH/$TARGET_PLUGIN" ]; then
  mv "$TARGET_PATH/$TARGET_PLUGIN" "$TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bak"
  echo "Backup path: $TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bak"

  if [ -d "$TARGET_PATH/.bin/" ]; then
    for FILE in "$TARGET_PATH/.bin/"*; do
      if [[ "$(readlink "$FILE")" == "../$TARGET_PLUGIN/"* ]]; then
        mkdir -p "$TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bin.bak"
        mv "$FILE" "$TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bin.bak/"
      fi
    done
  fi
fi
echo ""

function postInstallCleanup() {
  rm -rf "$TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bak"
  rm -rf "$TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bin.bak/"
  rm -rf "$tmp_dir"
}

function revertToBackup() {
  rm -rf "${TARGET_PATH:?}/${TARGET_PLUGIN:?}"
  if [ -d "$TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bak" ]; then
    echo "Restoring previous version..."
    mv "$TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bak" "$TARGET_PATH/$TARGET_PLUGIN"
    [ -d "$TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bin.bak" ] && mv "$TARGET_PATH/.$TARGET_PLUGIN_BUNDLE_NAME.bin.bak/"* "$TARGET_PATH/.bin/"
    echo "Restore Complete. Installation failed."
  fi
  postInstallCleanup
  exit 1
}

echo "Extracting..."
if ! tar --no-same-owner -xmvf "$tmp_dir/${TARGET_PLUGIN_BUNDLE_NAME}.tar.gz" -C "$TARGET_PATH"; then
  echo "Failed to extract."
  revertToBackup
else
  echo "Extracted to: $TARGET_PATH"
fi
echo ""

echo "Running post-install scripts..."
if ! cd "$TARGET_PATH/$TARGET_PLUGIN"; then
  echo "Failed to change directory to $TARGET_PATH/$TARGET_PLUGIN"
  exit 1
fi
if ! npm rebuild --foreground-scripts; then
  echo "Failed to rebuild."
  revertToBackup
fi
echo ""

PLUGIN_PACKAGE_JSON_PATH="$(dirname "$TARGET_PATH")/package.json"

if [ ! -f "$PLUGIN_PACKAGE_JSON_PATH" ]; then
  echo "{}" > "$PLUGIN_PACKAGE_JSON_PATH"
fi
echo "Updating $PLUGIN_PACKAGE_JSON_PATH..."
if PACKAGE_JSON=$(jq -rM ".dependencies += { \"$TARGET_PLUGIN\": \"$TARGET_VERSION\"}" < "$PLUGIN_PACKAGE_JSON_PATH"); then
  printf "%s" "$PACKAGE_JSON" > "$PLUGIN_PACKAGE_JSON_PATH"
else
  echo "Failed to update $PLUGIN_PACKAGE_JSON_PATH"
  exit 1
fi
echo ""

echo "Cleaning up..."
postInstallCleanup
echo ""

echo "Installed ${TARGET_PLUGIN} v${TARGET_VERSION}"
