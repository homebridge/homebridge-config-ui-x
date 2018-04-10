process.title = 'homebridge-config-ui-x';

import 'source-map-support/register';

import { UiServer } from './server';

process.on('message', (setup) => {
  return new UiServer(setup);
});

process.on('disconnect', () => {
  console.warn('Parent process terminated, shutting down homebridge-config-ui-x...');
  process.exit();
});

process.send('ready');
