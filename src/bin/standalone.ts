#!/usr/bin/env node

process.title = 'homebridge-config-ui-x';

import * as os from 'os';
import * as path from 'path';
import * as commander from 'commander';

commander
  .allowUnknownOption()
  .option('-U, --user-storage-path [path]', '', (p) => process.env.UIX_STORAGE_PATH = p)
  .option('-P, --plugin-path [path]', '', (p) => process.env.UIX_CUSTOM_PLUGIN_PATH = p)
  .option('-I, --insecure', '', () => process.env.UIX_INSECURE_MODE = '1')
  .option('-T, --no-timestamp', '', () => process.env.UIX_LOG_NO_TIMESTAMPS = '1')
  .parse(process.argv);

if (!process.env.UIX_STORAGE_PATH) {
  process.env.UIX_STORAGE_PATH = path.resolve(os.homedir(), '.homebridge');
}

process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');

import('../main');
