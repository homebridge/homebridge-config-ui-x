import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

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

    if (
      this.setup.config.ssl
      && !(this.setup.config.letsencrypt && this.setup.config.letsencrypt.active)
      && ((this.setup.config.ssl.key && this.setup.config.ssl.cert) || this.setup.config.ssl.pfx)
    ) {
      // start the server using https if user has supplied certificates
      await this.startWithHttps(app);
    } else if (
      this.setup.config.letsencrypt
      && this.setup.config.letsencrypt.active
      && this.setup.config.letsencrypt.domain
      && this.setup.config.letsencrypt.email
      && this.setup.config.letsencrypt.domain !== 'localhost'
      && this.setup.config.letsencrypt.challengePort
    ) {
      // start server using let's encrypt
      await this.startWithLetsEncrypt(app);
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

  async startWithLetsEncrypt(app) {
    const greenlock = await import('greenlock');
    const leChallengeFs = await import('le-challenge-fs');
    const leStoreCertbot = await import('le-store-certbot');

    hb.warn(`Starting server using HTTPS with Let's Encrypt`);

    /**
     * Configure Let's Encrypt Options
     */
    const lex = await greenlock.create({
      app: app,
      agreeTos: true,
      version: 'draft-11',
      challenges: {
        'http-01': leChallengeFs.create({
          webrootPath: path.resolve(hb.storagePath, 'letsencrypt/acme-challenges')
        })
      },
      store: leStoreCertbot.create({
        webrootPath: path.resolve(hb.storagePath, 'letsencrypt/acme-challenges'),
        configDir: path.resolve(
          hb.storagePath,
          'letsencrypt',
          this.setup.config.letsencrypt.production ? 'production' : 'staging',
        )
      }),
      server: this.setup.config.letsencrypt.production ?
        'https://acme-v02.api.letsencrypt.org/directory' : 'https://acme-staging-v02.api.letsencrypt.org/directory',
      debug: this.setup.config.letsencrypt.debug,
      email: this.setup.config.letsencrypt.email,
      approveDomains: (opts, certs, cb) => {
        opts.domain = this.setup.config.letsencrypt.domain;
        opts.domains = [this.setup.config.letsencrypt.domain];
        return cb(null, { options: opts });
      },
      log: (debug, ...args) => {
        if (debug) {
          hb.log('[ACME]', ...args);
        }
      }
    });

    /**
     * Start the ACME Challege Response Server
     */
    const challengeServer = http.createServer(
      lex.middleware((req, res) => {
        res.writeHead(404);
        res.end('404');
      })
    ).listen(this.setup.config.letsencrypt.challengePort, function () {
      hb.log(`Listening for Let's Encrypt ACME http-01 challenges on port ${this.address().port}.`);
    });

    challengeServer.on('error', (error: any) => {
      const challengePort = this.setup.config.letsencrypt.challengePort;
      switch (error.code) {
        case 'EACCES':
          hb.error(`Cannot start Let's Encrypt Challenge Server: Running on ${challengePort} requires elevated privileges.`);
          break;
        case 'EADDRINUSE':
          hb.error(`Cannot start Let's Encrypt Challenge Server: Port ${challengePort} is already in use by another process.`);
          break;
        default:
          hb.error(`Cannot start Let's Encrypt Challenge Server: ${error.message}`);
      }
    });

    /**
     * Start the console https server
     */
    this.server = https.createServer(lex.httpsOptions, lex.middleware(app));
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
