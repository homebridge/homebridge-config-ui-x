process.title = 'homebridge-config-ui-x';

import 'source-map-support/register';

import { UiServer } from '../server';

let healthcheck;

process.on('message', (message) => {
  if (typeof message === 'object') {
    return new UiServer(message);
  } else if (message === 'ping') {
    clearTimeout(healthcheck);
    healthcheck = setTimeout(process.exit, 30000);
  }
});

process.on('disconnect', () => {
  console.warn('Parent process terminated, shutting down homebridge-config-ui-x...');
  process.exit();
});

process.send('ready');
