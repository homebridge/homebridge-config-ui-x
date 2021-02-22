/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * This script "mocks" homebridge and is used to extract the plugin alias and type.
 */

const path = require('path');
const EventEmitter = require('events').EventEmitter;

let pluginAlias;
let pluginType;

const HomebridgeApiMock = {
  registerPlatform(pluginIdentifier, platformName, constructor) {
    pluginType = 'platform';
    if (typeof platformName === 'function') {
      constructor = platformName;
      platformName = pluginIdentifier;
      pluginAlias = platformName;
    } else {
      pluginAlias = platformName;
    }
  },
  registerAccessory(pluginIdentifier, accessoryName, constructor) {
    pluginType = 'accessory';
    if (typeof accessoryName === 'function') {
      constructor = accessoryName;
      accessoryName = pluginIdentifier;
      pluginAlias = accessoryName;
    } else {
      pluginAlias = accessoryName;
    }
  },
  version: 2.5,
  serverVersion: '1.2.3',
  on: () => { /** mock */ },
  emit: () => { /** mock */ },
  hap: {
    Characteristic: new class Characteristic extends EventEmitter {
      constructor() {
        super();
        return new Proxy(this, {
          get() {
            return {
              UUID: '0000003E-0000-1000-8000-0026BB765291',
            };
          }
        });
      }
    },
    Service: {},
    AccessoryLoader: {},
    Accessory: {},
    Bridge: {},
    uuid: {
      generate: () => { /** mock */ }
    }
  },
  platformAccessory() {
    return {
      addService() { /** mock */ },
      getService() { /** mock */ },
      removeService() { /** mock */ },
      context() { /** mock */ },
      services() { /** mock */ }
    };
  },
  registerPlatformAccessories() { /** mock */ },
  unregisterPlatformAccessories() { /** mock */ },
  publishExternalAccessories() { /** mock */ },
  updatePlatformAccessories() { /** mock */ },
  user: {
    configPath() {
      return path.join(process.cwd(), 'config.json');
    },
    storagePath() {
      return process.cwd();
    },
    cachedAccessoryPath() {
      return path.join(process.cwd(), 'accessories');
    },
    persistPath() {
      return path.join(process.cwd(), 'persist');
    }
  }
};

function main() {
  try {
    let pluginInitializer;
    const pluginPath = process.env.UIX_EXTRACT_PLUGIN_PATH;
    const pluginModules = require(pluginPath);

    if (typeof pluginModules === 'function') {
      pluginInitializer = pluginModules;
    } else if (pluginModules && typeof pluginModules.default === 'function') {
      pluginInitializer = pluginModules.default;
    } else {
      throw new Error(`Plugin ${pluginPath} does not export a initializer function from main.`);
    }

    pluginInitializer(HomebridgeApiMock);

    process.send({
      pluginAlias: pluginAlias,
      pluginType: pluginType,
    });
    process.exit();

  } catch (e) {
    process.exit(1);
  }
}

main();

setTimeout(() => {
  process.exit(1);
}, 2500);
