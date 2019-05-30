process.title = 'homebridge-config-ui-x';

setInterval(() => {
  if (!process.connected) {
    process.exit(1);
  }
}, 10000);

process.on('disconnect', () => {
  process.exit();
});

process.on('unhandledRejection', (err: any) => {
  console.error(`[${new Date().toLocaleString()}]`, '\x1b[36m[homebridge-config-ui-x]\x1b[0m', '\033[31m' + err.toString() + '\x1b[0m');
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[${new Date().toLocaleString()}]`,
      '\x1b[36m[homebridge-config-ui-x]\x1b[0m',
      '\033[31mAnother process or service on this host is using port ' + err.port + '.',
      'Please stop the other service or change the port you have assigned to homebridge-config-ui-x.\x1b[0m',
    );
    setTimeout(() => process.exit(0));
  } else if (err.code === 'EACCES') {
    console.error(
      `[${new Date().toLocaleString()}]`,
      '\x1b[36m[homebridge-config-ui-x]\x1b[0m',
      '\033[31mThe process owner does not have permission to run services on port ' + err.port + '.',
      'Please change the homebridge-config-ui-x port to something above 1024.',
    );
    setTimeout(() => process.exit(0));
  } else {
    const msg = 'Caught Unhandled Rejection Error :: Details Below';
    console.error(`[${new Date().toLocaleString()}]`, '\x1b[36m[homebridge-config-ui-x]\x1b[0m', '\033[31m' + msg + '\x1b[0m');
    console.error(err);
  }
});

import('../main');
