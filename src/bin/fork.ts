process.title = 'homebridge-config-ui-x';

import { UiServer } from '../server';

setInterval(() => {
  if (!process.connected) {
    process.exit(1);
  }
}, 10000);

process.on('message', (message) => {
  if (typeof message === 'object') {
    return new UiServer(message);
  }
});

process.on('disconnect', () => {
  process.exit();
});

process.send('ready');
