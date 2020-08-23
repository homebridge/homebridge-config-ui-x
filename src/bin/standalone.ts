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

console.log(`

\u{1b}[33m*********** Homebridge Standalone Mode Is Depreciated **********\u{1b}[0m
\u{1b}[33m*\u{1b}[0m Please swap to "service mode" using the \u{1b}[37mhb-service\u{1b}[0m command.  \u{1b}[33m*\u{1b}[0m
\u{1b}[33m*\u{1b}[0m See https://git.io/JUvQr for instructions on how to migrate. \u{1b}[33m*\u{1b}[0m

`);

import('../main');