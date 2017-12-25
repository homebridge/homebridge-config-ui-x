#!/usr/bin/env node

'use strict'

/* This file enables homebridge-config-ui-x to be run independently of the main homebridge process */

const fs = require('fs')
const path = require('path')
const commander = require('commander')

const options = {
  pluginPath: undefined,
  userStoragePath: undefined,
  homebridgeCorePath: undefined
}

// log
const log = (msg) => {
  let date = new Date()
  console.log(`[${date.toLocaleString()}] [homebridge-config-ui-x] ${msg}`)
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
const plugin = require('./index.js')

// config
const config = {
  port: process.env.HOMEBRIDGE_CONFIG_UI_PORT || 8080,
  log: process.env.HOMEBRIDGE_CONFIG_UI_LOG || '/homebridge/logs/homebridge.log',
  restart: process.env.HOMEBRIDGE_CONFIG_UI_RESTART || 'pkill homebridge; pkill homebridge-config-ui-x'
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
