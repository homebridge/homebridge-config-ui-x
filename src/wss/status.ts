import * as os from 'os';
import * as fs from 'fs';
import * as rp from 'request-promise';

import { hb } from '../hb';

export class StatusWssHandler {
  private ws: any;
  private config: any;

  constructor(ws, req) {
    this.ws = ws;
    this.config = require(hb.configPath);

    // on connect send everything
    this.sendData();
    this.sendStatus();
    this.sendServerStatus();

    // load stats every 5 seconds and push to client
    const statsInterval = setInterval(this.sendData.bind(this), 5000);

    // check status of homebridge every 10 seconds
    const statusInterval = setInterval(this.sendServerStatus.bind(this), 10000);

    // clear interval when socket closes
    const onClose = () => {
      onUnsubscribe('status');
    };
    ws.on('close', onClose);

    // clear interval when client goes to another page
    const onUnsubscribe = (sub) => {
      if (sub === 'status') {
        clearInterval(statsInterval);
        clearInterval(statusInterval);
        ws.removeEventListener('unsubscribe', onUnsubscribe);
        ws.removeEventListener('close', onClose);
      }
    };
    ws.on('unsubscribe', onUnsubscribe);
  }

  sendData() {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({stats: this.getStats()}));
    }
  }

  sendStatus() {
    this.ws.send(JSON.stringify({
      server: {
        consolePort: hb.port,
        port: this.config.bridge.port,
        pin: this.config.bridge.pin
      }
    }));
  }

  sendServerStatus() {
    return this.checkStatus()
      .then(up => {
        if (this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({
            server: {
              consolePort: hb.port,
              port: this.config.bridge.port,
              pin: this.config.bridge.pin,
              status: up ? 'up' : 'down'
            },
            status: up ? 'up' : 'down' // TODO remove this in next major version
          }));
        }
      })
      .catch(() => {});
  }

  getStats() {
    // core stats
    const stats: any = {
      memory: {
        total: (((os.totalmem() / 1024) / 1024) / 1024).toFixed(2),
        used: ((((os.totalmem() - os.freemem()) / 1024) / 1024) / 1024).toFixed(2),
        free: (((os.freemem() / 1024) / 1024) / 1024).toFixed(2)
      }
    };

    stats.cpu = (os.platform() === 'win32') ? null : (parseFloat(os.loadavg() + '') * 100 / os.cpus().length).toFixed(2);

    // server uptime
    const uptime: any = {
      delta: Math.floor(os.uptime())
    };

    uptime.days = Math.floor(uptime.delta / 86400);
    uptime.delta -= uptime.days * 86400;
    uptime.hours = Math.floor(uptime.delta / 3600) % 24;
    uptime.delta -= uptime.hours * 3600;
    uptime.minutes = Math.floor(uptime.delta / 60) % 60;

    stats.uptime = uptime;

    // cpu temp
    let temp = null;
    if (hb.temperatureFile) {
      try {
        temp = fs.readFileSync(hb.temperatureFile);
        temp = ((temp / 1000).toPrecision(3));
      } catch (e) {
        temp = null;
        hb.log(`ERROR: Failed to read temp from ${hb.temperatureFile}`);
      }
    }
    stats.cputemp = temp;

    return stats;
  }

  checkStatus() {
    // check if homebridge is running on the port specified in the config.json
    return rp.get(`http://localhost:${this.config.bridge.port}`, {
      resolveWithFullResponse: true,
      simple: false // <- This prevents the promise from failing on a 404
    })
    .then(() => {
      return true;
    })
    .catch(() => {
      return false;
    });
  }
}
