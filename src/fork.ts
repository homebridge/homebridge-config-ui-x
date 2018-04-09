process.title = 'homebridge-config-ui-x';

import * as color from 'bash-color';

const plugin = require('./index');
let pluginName = 'homebridge-config-ui-x';


// log
const log: any = (...params) => {
  const date = new Date();
  console.log(color.white(`[${date.toLocaleString()}]`), color.cyan(`[${pluginName}]`), ...params);
};

log.error = (...params) => {
  const date = new Date();
  console.error(color.white(`[${date.toLocaleString()}]`), color.cyan(`[${pluginName}]`), color.red(...params));
};

log.warn = (...params) => {
  const date = new Date();
  console.warn(color.white(`[${date.toLocaleString()}]`), color.cyan(`[${pluginName}]`), color.yellow(...params));
};

process.on('message', (setup) => {
  pluginName = setup.config.name || 'homebridge-config-ui-x';

  const service = {
    serverVersion: setup.serverVersion,
    pluginPath: setup.pluginPath,
    user: {
      configPath: () => {
        return setup.homebridge.configPath;
      },
      storagePath: () => {
        return setup.homebridge.storagePath;
      }
    },
    registerPlatform: () => {},
  };

  const Service = plugin(service);
  return new Service(log, setup.config);
});

process.on('disconnect', () => {
  log('Got SIGINT, shutting down homebridge-config-ui-x...');
  process.exit();
});

process.send('ready');

