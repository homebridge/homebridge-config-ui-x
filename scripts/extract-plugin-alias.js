/* eslint-disable unused-imports/no-unused-vars */

/**
 * This script "mocks" homebridge and is used to extract the plugin alias and type.
 */

import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

// Create a require function for loading CommonJS plugins
const require = createRequire(import.meta.url)

let pluginAlias
let pluginType

const HomebridgeApiMock = {
  registerPlatform(pluginIdentifier, platformName, constructor) {
    pluginType = 'platform'
    if (typeof platformName === 'function') {
      constructor = platformName
      platformName = pluginIdentifier
      pluginAlias = platformName
    } else {
      pluginAlias = platformName
    }
  },
  registerAccessory(pluginIdentifier, accessoryName, constructor) {
    pluginType = 'accessory'
    if (typeof accessoryName === 'function') {
      constructor = accessoryName
      accessoryName = pluginIdentifier
      pluginAlias = accessoryName
    } else {
      pluginAlias = accessoryName
    }
  },
  version: 2.5,
  serverVersion: '1.2.3',
  on: () => { /** mock */ },
  emit: () => { /** mock */ },
  // Mock Matter API
  isMatterAvailable() {
    return true
  },
  isMatterEnabled() {
    return true
  },
  matterDeviceTypes: new Proxy({}, {
    get() {
      return {} // Return empty object for any device type
    },
  }),
  matterClusters: new Proxy({}, {
    get() {
      return {} // Return empty object for any cluster
    },
  }),
  registerMatterAccessory: () => { /** mock */ },
  unregisterMatterAccessory: () => { /** mock */ },
  updateMatterAccessoryState: () => { /** mock */ },
  hap: {
    Characteristic: new class Characteristic extends EventEmitter {
      constructor() {
        super()
        return new Proxy(this, {
          get() {
            return {
              UUID: '0000003E-0000-1000-8000-0026BB765291',
            }
          },
        })
      }
    }(),
    Service: new class Service extends EventEmitter {
      constructor() {
        super()
        return new Proxy(this, {
          get() {
            return {
              UUID: '0000003E-0000-1000-8000-0026BB765291',
            }
          },
        })
      }
    }(),
    AccessoryLoader: {},
    Accessory: {},
    Bridge: {},
    Categories: {},
    Units: {},
    uuid: {
      generate: () => { /** mock */ },
    },
  },
  platformAccessory() {
    return {
      addService() { /** mock */ },
      getService() { /** mock */ },
      removeService() { /** mock */ },
      context() { /** mock */ },
      services() { /** mock */ },
    }
  },
  registerPlatformAccessories() { /** mock */ },
  unregisterPlatformAccessories() { /** mock */ },
  publishExternalAccessories() { /** mock */ },
  updatePlatformAccessories() { /** mock */ },
  user: {
    configPath() {
      return path.join(process.cwd(), 'config.json')
    },
    storagePath() {
      return process.cwd()
    },
    cachedAccessoryPath() {
      return path.join(process.cwd(), 'accessories')
    },
    persistPath() {
      return path.join(process.cwd(), 'persist')
    },
  },
}

async function main() {
  try {
    let pluginInitializer
    const pluginPath = process.env.UIX_EXTRACT_PLUGIN_PATH

    // Read package.json to get the proper entry point
    let actualEntryPoint = pluginPath
    try {
      const packageJsonPath = path.join(pluginPath, 'package.json')
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

      if (packageJson.main) {
        actualEntryPoint = path.join(pluginPath, packageJson.main)
      }
    } catch (err) {
      console.error('[extract-plugin-alias] Could not read package.json, using directory path')
    }

    let pluginModules

    // Try to load as CommonJS first
    try {
      pluginModules = require(actualEntryPoint)
    } catch (requireError) {
      // If require fails, try dynamic import for ESM modules
      try {
        // For ESM, we need to use file:// URL on some platforms
        const importPath = actualEntryPoint.startsWith('/') || actualEntryPoint.startsWith('file://')
          ? actualEntryPoint
          : path.resolve(actualEntryPoint)
        pluginModules = await import(importPath)
      } catch (importError) {
        throw requireError // Throw the original error
      }
    }

    if (typeof pluginModules === 'function') {
      pluginInitializer = pluginModules
    } else if (pluginModules && typeof pluginModules.default === 'function') {
      pluginInitializer = pluginModules.default
    } else {
      throw new Error(`Plugin ${pluginPath} does not export a initializer function from main.`)
    }

    pluginInitializer(HomebridgeApiMock)

    process.send({
      pluginAlias,
      pluginType,
    })
    process.exit()
  } catch (e) {
    process.exit(1)
  }
}

main()

setTimeout(() => {
  process.exit(1)
}, 2500)
