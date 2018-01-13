'use strict'

const url = require('url')
const qs = require('querystring')
const WebSocket = require('ws')

const hb = require('../hb')
const users = require('../users')

const handlers = {
  logs: require('./logs'),
  status: require('./status')
}

module.exports = class WSS {
  constructor (server) {
    this.server = new WebSocket.Server({
      server: server,
      verifyClient: this.verifyClient
    })

    this.server.on('connection', (ws, req) => {
      // subscription handler
      ws.on('message', (sub) => {
        switch (sub) {
          case 'logs-sub':
            handlers.logs(ws, req)
            break
          case 'status-sub':
            handlers.status(ws, req)
            break
        }
      })

      // absorb websocket errors
      ws.on('error', () => {})
    })
  }

  verifyClient (info, callback) {
    // authenticate the websocket connection using a jwt
    let params = qs.parse(url.parse(info.req.url).query)

    if (params.token && params.username) {
      users.verifyJwt(params.username, params.token, (err) => {
        if (err) {
          // invalid token - reject the websocket connection
          hb.logger('Unauthorised WebSocket Connection Closed')
          callback(false, 403, 'Invalid Token')
        }
      })
    } else {
      // no token provided - reject the websocket connection
      callback(false, 403, 'Invalid Token')
    }
    callback(true)
  }
}
