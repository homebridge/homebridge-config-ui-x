#!/usr/bin/env node
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import { program } from 'commander'

process.title = 'homebridge-config-ui-x'

program
  .allowUnknownOption()
  .option('-U, --user-storage-path [path]', '', p => process.env.UIX_STORAGE_PATH = p)
  .option('-P, --plugin-path [path]', '', p => process.env.UIX_CUSTOM_PLUGIN_PATH = p)
  .option('-I, --insecure', '', () => process.env.UIX_INSECURE_MODE = '1')
  .option('-T, --no-timestamp', '', () => process.env.UIX_LOG_NO_TIMESTAMPS = '1')
  .parse(process.argv)

if (!process.env.UIX_STORAGE_PATH) {
  process.env.UIX_STORAGE_PATH = resolve(homedir(), '.homebridge')
}

process.env.UIX_CONFIG_PATH = resolve(process.env.UIX_STORAGE_PATH, 'config.json')

import('../main')
