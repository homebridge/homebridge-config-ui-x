#!/bin/sh

# set -x

TARGET_VERSION="$1"
TARGET_PATH="$2"
GITHUB_RELEASE_NAME="$3"

echo "Target Version: $TARGET_VERSION"
echo "Target Path: $TARGET_PATH"
echo "GitHub Release Name: $GITHUB_RELEASE_NAME"

echo ""

SHASUM_COMMAND=""
if command -v shasum > /dev/null; then
  SHASUM_COMMAND="shasum -a 256"
elif command -v sha256sum > /dev/null; then
  SHASUM_COMMAND="sha256sum"
else
  echo "Failed to find shasum or sha256sum command."
  exit 1
fi

tmp_dir=$(mktemp -d -t homebridge-ui-update.XXXXXXX)
if ! [ "$tmp_dir" ]; then
  echo "Failed to create temporary directory."
  exit 1
fi

echo "Downloading SHASUMS256.txt..."
if ! curl -fsSL# -o "$tmp_dir/SHASUMS256.txt" \
   https://github.com/homebridge/homebridge-config-ui-x/releases/download/"${GITHUB_RELEASE_NAME}"/SHASUMS256.txt; then
  echo "Failed to download SHASUMS256.txt"
  exit 1
fi

echo "Downloading homebridge-config-ui-x-${TARGET_VERSION}.tar.gz..."
if ! curl -fL# -o "$tmp_dir/homebridge-config-ui-x-${TARGET_VERSION}.tar.gz" \
  https://github.com/homebridge/homebridge-config-ui-x/releases/download/"${GITHUB_RELEASE_NAME}"/homebridge-config-ui-x-"${TARGET_VERSION}".tar.gz; then
  echo "Failed to download homebridge-config-ui-x-${TARGET_VERSION}.tar.gz"
  exit 1
fi

echo "Verifying download..."
if ! cd "$tmp_dir"; then
  echo "Failed to change directory to $tmp_dir"
  exit 1
fi

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
if [ -d "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x" ]; then
  mv "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x" "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak"
fi
echo ""

echo "Extracting..."
if ! tar --no-same-owner -xvmf "$tmp_dir/homebridge-config-ui-x-${TARGET_VERSION}.tar.gz" -C "$TARGET_PATH"; then
  echo "Failed to extract."
  mv "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak" "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x"
  rm -rf "$tmp_dir"
  exit 1
fi
echo ""

echo "Running post-install scripts..."

if ! cd "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x"; then
  echo "Failed to change directory to $TARGET_PATH/lib/node_modules/homebridge-config-ui-x"
  exit 1
fi

if ! npm rebuild --foreground-scripts --unsafe-perm @homebridge/node-pty-prebuilt-multiarch; then
  echo "Failed to rebuild."
  mv "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak" "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x"
  rm -rf "$tmp_dir"
  exit 1
fi
echo ""

echo "Cleaning up..."
rm -rf "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak"
rm -rf "$tmp_dir"
echo ""

echo "Installed v${TARGET_VERSION}"
