#!/usr/bin/env node

process.title = 'homebridge-config-ui-x';

import * as path from 'path';
import * as commander from 'commander';

commander
  .allowUnknownOption()
  .option('-U, --user-storage-path [path]', '', (p) => process.env.UIX_STORAGE_PATH = p)
  .option('-P, --plugin-path [path]', '', (p) => process.env.UIX_CUSTOM_PLUGIN_PATH = p)
  .option('-H, --homebridge-core-path <path>', '', (p) => { process.env.UIX_HOMEBRIDGE_CORE_PATH = p; })
  .parse(process.argv);

process.env.UIX_CONFIG_PATH = path.resolve(process.env.UIX_STORAGE_PATH, 'config.json');

import('../main');