#!/bin/sh

# set -x

TARGET_VERSION="$1"
TARGET_PATH="$2"

echo "Target Version: $TARGET_VERSION"
echo "Target Path: $TARGET_PATH"

echo ""

tmp_dir=$(mktemp -d -t homebridge-ui-update.XXXXXXX)
if [ "$?" != "0" ]; then
  echo "Failed to create temporary directory."
  exit 1
fi

echo "Downloading SHASUMS256.txt..."
curl -fsSL# -o "$tmp_dir/SHASUMS256.txt" \
  https://github.com/oznu/homebridge-config-ui-x/releases/download/${TARGET_VERSION}/SHASUMS256.txt
if [ "$?" != "0" ]; then
  echo "Failed to download SHASUMS256.txt"
  exit 1
fi

echo "Downloading homebridge-config-ui-x-${TARGET_VERSION}.tar.gz..."
curl -fL# -o "$tmp_dir/homebridge-config-ui-x-${TARGET_VERSION}.tar.gz" \
  https://github.com/oznu/homebridge-config-ui-x/releases/download/${TARGET_VERSION}/homebridge-config-ui-x-${TARGET_VERSION}.tar.gz
if [ "$?" != "0" ]; then
  echo "Failed to download homebridge-config-ui-x-${TARGET_VERSION}.tar.gz"
  exit 1
fi

echo "Verifying download..."
cd $tmp_dir
shasum -a 256 -c SHASUMS256.txt
if [ "$?" != "0" ]; then
  echo "Download failed integrity check."
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
tar -xvf "$tmp_dir/homebridge-config-ui-x-${TARGET_VERSION}.tar.gz" -C "$TARGET_PATH"
if [ "$?" != "0" ]; then
  echo "Failed to extract..."
  mv "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak" "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x"
  exit 1
fi
echo ""

echo "Running post-install scripts..."
cd "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x"
npm rebuild --foreground-scripts node-pty-prebuilt-multiarch
if [ "$?" != "0" ]; then
  echo "Failed to rebuild..."
  mv "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak" "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x"
  exit 1
fi
echo ""

echo "Cleaning up..."
rm -rf "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak"
rm -rf $tmp_dir
echo ""

echo "Installed v${TARGET_VERSION}"
