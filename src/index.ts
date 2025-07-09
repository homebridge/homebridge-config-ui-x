/**
 * Homebridge Entry Point
 */

import process from 'node:process'

import { Command } from 'commander'
import { satisfies } from 'semver'

let homebridge: any

class HomebridgeUi {
  log: any

  constructor(log: any, config: any) {
    this.log = log

    process.env.UIX_CONFIG_PATH = homebridge.user.configPath()
    process.env.UIX_STORAGE_PATH = homebridge.user.storagePath()
    process.env.UIX_PLUGIN_NAME = config.name || 'homebridge-config-ui-x'

    const program = new Command()
    program
      .allowUnknownOption()
      .allowExcessArguments()
      .option('-P, --plugin-path [path]', '', p => process.env.UIX_CUSTOM_PLUGIN_PATH = p)
      .option('-I, --insecure', '', () => process.env.UIX_INSECURE_MODE = '1')
      .option('-T, --no-timestamp', '', () => process.env.UIX_LOG_NO_TIMESTAMPS = '1')
      .parse(process.argv)

    if (!satisfies(process.version, '>=18.15.0')) {
      const msg = `Node.js v18.15.0 higher is required. You may experience issues running this plugin running on ${process.version}.`
      log.error(msg)
      log.warn(msg)
    }
  }

  accessories(callback) {
    const accessories = []
    callback(accessories)
  }
}

// eslint-disable-next-line no-restricted-syntax
export = (api) => {
  homebridge = api
  homebridge.registerPlatform('homebridge-config-ui-x', 'config', HomebridgeUi)
  process.on('disconnect', () => process.exit())
}
