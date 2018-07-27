import * as WebSocket from 'ws';
import { HapClient, ServiceType } from '@oznu/hap-client';

import { hb } from '../hb';

export class AccessoriesWssHandler {
  private ws: WebSocket;
  private hapClient: HapClient;
  private services: any;

  constructor(ws: WebSocket, req) {
    this.ws = ws;

    // setup hap client
    this.hapClient = new HapClient(`http://localhost:${hb.homebridgeConfig.bridge.port}`, hb.homebridgeConfig.bridge.pin);

    // on connect send everything
    this.loadAccessories(true);

    // load accessories at an interval
    const loadAccessoriesInterval = setInterval(this.loadAccessories.bind(this), 3000);

    // handling incoming requests
    const requestHandler = async (msg?) => {
      if (msg.set) {
        const service: ServiceType = this.services.find(x => x.aid === msg.set.aid && x.iid === msg.set.siid);
        await service.setCharacteristic(msg.set.iid, msg.set.value);
        await this.loadAccessories();

        // do a refresh to check if any accessories changed after this action
        setTimeout(() => {
          this.loadAccessories(true);
        }, 1500);
      }
    };
    ws.on('accessories', requestHandler);

    // when the client disconnects stop checking the accessories status
    const onClose = () => {
      onUnsubscribe('accessories');
    };
    ws.on('close', onClose);

    // when the client leaves the accessories page, stop checking the accessories status
    const onUnsubscribe = (sub?) => {
      if (sub === 'accessories') {
        clearInterval(loadAccessoriesInterval);
        ws.removeEventListener('accessories', requestHandler);
        ws.removeEventListener('unsubscribe', onUnsubscribe);
        ws.removeEventListener('close', onClose);
      }
    };
    ws.on('unsubscribe', onUnsubscribe);
  }

  send(data) {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ accessories: data }));
    }
  }

  loadAccessories(refreshServices?: boolean) {
    return this.hapClient.getAllServices()
      .then(services => {
        this.services = services;
        this.send({services: services});
        if (refreshServices) {
          services.forEach(service => service.refreshCharacteristics());
        }
      })
      .catch((e) => {
        if (e.statusCode === 401) {
          hb.warn(`Homebridge must be running in insecure mode to view and control accessories from this plugin.`);
          this.ws.emit('unsubscribe', 'accessories');
        } else {
          hb.error(`Failed load accessories from Homebridge: ${e.message}`);
        }
      });
  }
}

