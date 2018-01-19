import 'source-map-support/register';

import * as http from 'http';

import { hb } from './hb';
import { users } from './users';

module.exports = (homebridge) => {
  hb.homebridge = homebridge;
  homebridge.registerPlatform('homebridge-config-ui-x', 'config', HomebridgeConfigUi);
};

class HomebridgeConfigUi {
  private server;

  constructor (log, config) {
    // setup
    hb.init(log, config);

    // ensure auth.json is setup correctly
    users.setupAuthFile();

    // bootstrap the server
    this.bootstrap();
  }

  async bootstrap () {
    // dynamically load modules so app is only loaded if plugin is enabled
    const { ExpressServer } = await import('./app');
    const { WSS } = await import('./wss');

    const app = new ExpressServer().app;

    this.server = http.createServer(app);

    // attach websocker server to the express server
    hb.wss = new WSS(this.server);

    this.server.listen(hb.port);
    this.server.on('error', this.onServerError.bind(this));
    this.server.on('listening', this.onServerListening.bind(this));
  }

  onServerListening () {
    const addr = this.server.address();
    const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
    const msg = 'Console is listening on ' + bind + '.';
    hb.log(msg);
  }

  onServerError (error) {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = typeof hb.port === 'string' ? 'Pipe ' + hb.port : 'Port ' + hb.port;

    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
  }

  accessories (callback) {
    const accessories = [];
    callback(accessories);
  }
}
