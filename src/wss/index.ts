import * as url from 'url';
import * as qs from 'qs';
import { Server as WebSocketServer } from 'ws';

import { hb } from '../hb';
import { users } from '../users';
import { LogsWssHandler } from './logs';
import { StatusWssHandler } from './status';

export class WSS {
  public server: WebSocketServer;
  private subscriptions: any;

  constructor (server) {
    this.server = new WebSocketServer({
      server: server,
      verifyClient: this.verifyClient
    });

    this.subscriptions = {
      logs: LogsWssHandler,
      status: StatusWssHandler
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
      });

      // absorb websocket errors
      ws.on('error', () => {});
    });
  }

  verifyClient (info, callback) {
    // authenticate the websocket connection using a jwt
    const params = qs.parse(url.parse(info.req.url).query);

    if (params.token) {
      users.verifyJwt(params.token, (err) => {
        if (err) {
          // invalid token - reject the websocket connection
          hb.log('Unauthorised WebSocket Connection Closed');
          callback(false);
        }
      });
    } else {
      // no token provided - reject the websocket connection
      callback(false);
    }
    callback(true);
  }

  subscribeHandler (ws, req, msg) {
    if (this.subscriptions[msg.subscribe]) {
      return new this.subscriptions[msg.subscribe](ws, req);
    } else {
      hb.log(`Invalid subscription: ${msg.subscribe}`);
    }
  }

  unsubscribeHandler (ws, req, msg) {
    if (this.subscriptions[msg.unsubscribe]) {
      ws.emit('unsubscribe', msg.unsubscribe);
    } else {
      hb.log(`Invalid subscription: ${msg.unsubscribe}`);
    }
  }
}
