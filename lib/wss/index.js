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

module.exports.io = {}

module.exports.server = (server) => {
  const wss = new WebSocket.Server({
    server: server
  })

  wss.on('connection', (ws, req) => {
    // authenticate the websocket connection using a jwt since basic auth won't cover websockets
    let params = qs.parse(url.parse(req.url).query)

    if (params.token && params.username) {
      users.verifyJwt(params.username, params.token, (err) => {
        if (err) {
          // invalid token - kill the websocket
          ws.close()
          hb.logger('Unauthorised WebSocket Connection Closed')
        }
      })
    } else {
      // no token provided - kill the websocket
      ws.close()
    }

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

  module.exports.io.wss = wss
  return wss
}
