#!/usr/bin/env node

'use strict'

/* This file enables homebridge-config-ui-x to be run independently of the main homebridge process */

process.title = 'homebridge-config-ui-x'

const fs = require('fs')
const path = require('path')
const commander = require('commander')

const options = {
  pluginPath: undefined,
  userStoragePath: undefined,
  homebridgeCorePath: undefined
}

// log
const log = (...params) => {
  let date = new Date()
  console.log(`[${date.toLocaleString()}] [homebridge-config-ui-x]`, ...params)
}

log.error = (...params) => {
  console.error(...params)
}

log.warn = (...params) => {
  console.warn(...params)
}

commander
  .option('-P, --plugin-path <path>', '', (p) => { options.pluginPath = p })
  .option('-U, --user-storage-path <path>', '', (p) => { options.userStoragePath = p })
  .option('-H, --homebridge-core-path <path>', '', (p) => { options.homebridgeCorePath = p })
  .parse(process.argv)

// all options are required
Object.keys(options).forEach(option => {
  if (!options[option]) {
    log(`The ${option} option is required. See --help`)
    process.exit(1)
  }
})

// load homebridge package.json
let homebridge
if (fs.existsSync(path.resolve(options.homebridgeCorePath, 'package.json'))) {
  homebridge = require(path.resolve(options.homebridgeCorePath, 'package.json'))
} else {
  log(`Could not find homebridge at ${options.homebridgeCorePath}`)
  process.exit(1)
}

// import plugin
const plugin = require('../dist/index.js')

// config
const config = {
  port: process.env.HOMEBRIDGE_CONFIG_UI_PORT || 8080,
  log: process.env.HOMEBRIDGE_CONFIG_UI_LOG || '/homebridge/logs/homebridge.log',
  restart: process.env.HOMEBRIDGE_CONFIG_UI_RESTART || 'killall -9 homebridge && killall -9 homebridge-config-ui-x',
  theme: process.env.HOMEBRIDGE_CONFIG_UI_THEME || 'red',
  auth: process.env.HOMEBRIDGE_CONFIG_UI_AUTH || 'form',
  homebridgeNpmPkg: process.env.HOMEBRIDGE_CONFIG_UI_NPM_PKG || 'homebridge',
  homebridgeFork: process.env.HOMEBRIDGE_CONFIG_UI_FORK || undefined,
  homebridgeInsecure: (process.env.HOMEBRIDGE_INSECURE === "1")
}

// emulate homebridge handler
const service = {
  serverVersion: homebridge.version,
  pluginPath: options.pluginPath,
  registerPlatform: (pluginName, alias, Service) => {
    return new Service(log, config)
  },
  user: {
    configPath: () => {
      return path.join(options.userStoragePath, 'config.json')
    },
    storagePath: () => {
      return options.userStoragePath
    }
  }
}

// run server
plugin(service)
