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

# Restore the backed-up install after a failed extract/rebuild. The new
# (broken) directory must be removed BEFORE the mv: `mv` onto an existing
# directory moves the backup INSIDE it, leaving the broken install in place
# and the good one nested where nothing will ever load it. Mirrors
# revertToBackup in upgrade-install-plugin.sh.
revert_to_backup() {
  if [ -d "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak" ]; then
    echo "Restoring previous version..."
    rm -rf "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x"
    mv "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak" "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x"
    echo "Restore complete. Installation failed."
  fi
  rm -rf "$tmp_dir"
  exit 1
}

echo "Creating backup..."
if [ -d "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x" ]; then
  # A stale backup from an earlier failed run would make the mv below nest
  # the live install inside it instead of renaming
  rm -rf "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak"
  mv "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x" "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak"
fi
echo ""

echo "Extracting..."
if ! tar --no-same-owner -xvmf "$tmp_dir/homebridge-config-ui-x-${TARGET_VERSION}.tar.gz" -C "$TARGET_PATH"; then
  echo "Failed to extract."
  revert_to_backup
fi
echo ""

echo "Running post-install scripts..."

if ! cd "$TARGET_PATH/lib/node_modules/homebridge-config-ui-x"; then
  echo "Failed to change directory to $TARGET_PATH/lib/node_modules/homebridge-config-ui-x"
  exit 1
fi

if ! npm rebuild --foreground-scripts @homebridge/node-pty-prebuilt-multiarch; then
  echo "Failed to rebuild."
  # Leave the directory we cd'd into before revert_to_backup deletes it
  cd "$TARGET_PATH" || true
  revert_to_backup
fi
echo ""

echo "Cleaning up..."
rm -rf "$TARGET_PATH/lib/node_modules/.homebridge-config-ui-x.bak"
rm -rf "$tmp_dir"
echo ""

echo "Installed v${TARGET_VERSION}"
