import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';

import { hb } from './hb';
import { users } from './users';

export class UiServer {
  private server;

  private setup: {
    homebridgeVersion: string,
    configPath: string,
    storagePath: string,
    config: any,
  };

  constructor(setup) {
    this.setup = setup;
    this.init().catch((err) => {
      hb.error(err);
    });
  }

  async init() {
    hb.init(this.setup);

    await users.setupAuthFile();
    await hb.refreshHomebridgeConfig();

    // dynamically load modules
    const { ExpressServer } = await import('./app');
    const { WSS } = await import('./wss');

    const app = new ExpressServer().app;

    if (this.setup.config.ssl && ((this.setup.config.ssl.key && this.setup.config.ssl.cert) || this.setup.config.ssl.pfx)) {
      // start the server using https if user has supplied certificates
      await this.startWithHttps(app);
    } else {
      // start the http server
      await this.startServer(app);
    }

    // attach websocker server to the express server
    hb.wss = new WSS(this.server);

    this.server.listen(hb.port);
    this.server.on('error', this.onServerError.bind(this));
    this.server.on('listening', this.onServerListening.bind(this));
  }

  async startServer(app) {
    this.server = http.createServer(app);
  }

  async startWithHttps(app) {
    hb.warn('Starting server using HTTPS');

    this.server = https.createServer({
      key: this.setup.config.ssl.key ? fs.readFileSync(this.setup.config.ssl.key) : undefined,
      cert: this.setup.config.ssl.cert ? fs.readFileSync(this.setup.config.ssl.cert) : undefined,
      pfx: this.setup.config.ssl.pfx ? fs.readFileSync(this.setup.config.ssl.pfx) : undefined,
      passphrase: this.setup.config.ssl.passphrase
    }, app);
  }

  onServerListening() {
    const addr = this.server.address();
    const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
    const msg = `Console v${hb.ui.version} is listening on ${bind}.`;
    hb.log(msg);
  }

  onServerError(error) {
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
}
