import * as url from 'url';
import * as qs from 'qs';
import * as WebSocket from 'ws';

import { hb } from '../hb';
import { users } from '../users';
import { LogsWssHandler } from './logs';
import { StatusWssHandler } from './status';
import { AccessoriesWssHandler} from './accessories';
import { TerminalWssHandler } from './terminal';

export class WSS {
  public server: WebSocket.Server;
  private subscriptions: any;

  constructor(server) {
    this.server = new WebSocket.Server({
      server: server,
      verifyClient: this.verifyClient
    });

    this.subscriptions = {
      logs: LogsWssHandler,
      status: StatusWssHandler,
      accessories: AccessoriesWssHandler,
      terminal: TerminalWssHandler,
    };

    this.server.on('connection', (ws, req) => {
      // basic ws router
      ws.on('message', (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch (e) {
          hb.log(`Invalid message sent to WebSocket server: ${data}`);
          return null;
        }

        if (msg.subscribe) {
          this.subscribeHandler(ws, req, msg);
        } else if (msg.unsubscribe) {
          this.unsubscribeHandler(ws, req, msg);
        }

        if (msg.accessories) {
          ws.emit('accessories', msg);
        }

        if (msg.terminal) {
          ws.emit('terminal', msg);
        }
      });

      // absorb websocket errors
      ws.on('error', () => {});
    });
  }

  verifyClient(info, callback) {
    // authenticate the websocket connection using a jwt
    const params = qs.parse(url.parse(info.req.url).query);

    if (params.token) {
      return users.verifyJwt(params.token)
        .then((user) => {
          if (user) {
            info.req.user = user;
            return callback(true);
          } else {
            // invalid token - reject the websocket connection
            hb.log('Unauthorised WebSocket Connection Closed');
            return callback(false);
          }
        })
        .catch(() => callback(false));
    } else {
      // no token provided - reject the websocket connection
      hb.log('Unauthorised WebSocket Connection Closed');
      return callback(false);
    }
  }

  subscribeHandler(ws, req, msg) {
    if (this.subscriptions[msg.subscribe]) {
      return new this.subscriptions[msg.subscribe](ws, req);
    } else {
      hb.log(`Invalid subscription: ${msg.subscribe}`);
    }
  }

  unsubscribeHandler(ws, req, msg) {
    if (this.subscriptions[msg.unsubscribe]) {
      ws.emit('unsubscribe', msg.unsubscribe);
    } else {
      hb.log(`Invalid subscription: ${msg.unsubscribe}`);
    }
  }
}
