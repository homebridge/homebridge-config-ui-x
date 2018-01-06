'use strict'

const WebSocket = require('ws')

const handlers = {
  logs: require('./logs'),
  status: require('./status')
}

module.exports.io = {}

module.exports.server = (server) => {
  const wss = new WebSocket.Server({ server })

  wss.on('connection', (ws, req) => {
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
