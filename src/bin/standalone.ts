#!/usr/bin/env node

/* This file enables homebridge-config-ui-x to be run independently of the main homebridge process */
process.title = 'homebridge-config-ui-x';

import 'source-map-support/register';

import * as fs from 'fs';
import * as path from 'path';
import * as commander from 'commander';

import { UiServer } from '../server';

const options = {
  pluginPath: undefined,
  userStoragePath: undefined,
  homebridgeCorePath: undefined
};

commander
  .option('-P, --plugin-path <path>', '', (p) => { options.pluginPath = p; })
  .option('-U, --user-storage-path <path>', '', (p) => { options.userStoragePath = p; })
  .option('-H, --homebridge-core-path <path>', '', (p) => { options.homebridgeCorePath = p; })
  .parse(process.argv);

// all options are required
Object.keys(options).forEach(option => {
  if (!options[option]) {
    console.log(`The ${option} option is required. See --help`);
    process.exit(1);
  }
});

// load homebridge package.json
let homebridge;
if (fs.existsSync(path.resolve(options.homebridgeCorePath, 'package.json'))) {
  homebridge = require(path.resolve(options.homebridgeCorePath, 'package.json'));
} else {
  console.log(`Could not find homebridge at ${options.homebridgeCorePath}`);
  process.exit(1);
}

// config
const setup: any = {
  homebridgeVersion: homebridge.version,
  configPath: path.join(options.userStoragePath, 'config.json'),
  storagePath: options.userStoragePath,
  config: {
    port: process.env.HOMEBRIDGE_CONFIG_UI_PORT || 8080,
    logOpts: {
      method: 'file',
      path: process.env.HOMEBRIDGE_CONFIG_UI_LOG || '/homebridge/logs/homebridge.log',
    },
    restart: process.env.HOMEBRIDGE_CONFIG_UI_RESTART || 'killall -9 homebridge && killall -9 homebridge-config-ui-x',
    theme: process.env.HOMEBRIDGE_CONFIG_UI_THEME || 'red',
    auth: process.env.HOMEBRIDGE_CONFIG_UI_AUTH || 'form',
    temp: process.env.HOMEBRIDGE_CONFIG_UI_TEMP || undefined,
    homebridgeNpmPkg: process.env.HOMEBRIDGE_CONFIG_UI_NPM_PKG || 'homebridge',
    homebridgeFork: process.env.HOMEBRIDGE_CONFIG_UI_FORK || undefined,
    homebridgeInsecure: (process.env.HOMEBRIDGE_INSECURE === '1'),
    loginWallpaper: process.env.HOMEBRIDGE_CONFIG_UI_LOGIN_WALLPAPER || undefined,
    pluginPath: options.pluginPath,
  },
};

if (
  fs.existsSync(path.join(options.userStoragePath, 'certs', 'uix-key.pem'))
  && fs.existsSync(path.join(options.userStoragePath, 'certs', 'uix-cert.pem'))
) {
  setup.config.ssl = {
    key: path.join(options.userStoragePath, 'certs', 'uix-key.pem'),
    cert: path.join(options.userStoragePath, 'certs', 'uix-cert.pem')
  };
}

export = new UiServer(setup);

