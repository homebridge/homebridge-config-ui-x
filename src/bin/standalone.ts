#!/usr/bin/env node

process.title = 'homebridge-config-ui-x';

import { homedir } from 'os';
import { resolve } from 'path';
import { program } from 'commander';

program
  .allowUnknownOption()
  .option('-U, --user-storage-path [path]', '', (p) => process.env.UIX_STORAGE_PATH = p)
  .option('-P, --plugin-path [path]', '', (p) => process.env.UIX_CUSTOM_PLUGIN_PATH = p)
  .option('-I, --insecure', '', () => process.env.UIX_INSECURE_MODE = '1')
  .option('-T, --no-timestamp', '', () => process.env.UIX_LOG_NO_TIMESTAMPS = '1')
  .parse(process.argv);

if (!process.env.UIX_STORAGE_PATH) {
  process.env.UIX_STORAGE_PATH = resolve(homedir(), '.homebridge');
}

process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json');

import('../main');
