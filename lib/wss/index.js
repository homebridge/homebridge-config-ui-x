'use strict'

const url = require('url')
const qs = require('querystring')
const WebSocket = require('ws')

const hb = require('../hb')
const users = require('../users')

module.exports = class WSS {
  constructor (server) {
    this.server = new WebSocket.Server({
      server: server,
      verifyClient: this.verifyClient
    })

    this.subscriptions = {
      logs: require('./logs'),
      status: require('./status')
    }

    this.server.on('connection', (ws, req) => {
      // basic ws router
      ws.on('message', (data) => {
        let msg
        try {
          msg = JSON.parse(data)
        } catch (e) {
          hb.logger(`Invalid message sent to WebSocket server: ${data}`)
          return null
        }

        if (msg.subscribe) {
          this.subscribeHandler(ws, req, msg)
        } else if (msg.unsubscribe) {
          this.unsubscribeHandler(ws, req, msg)
        }
      })

      // absorb websocket errors
      ws.on('error', () => {})
    })
  }

  verifyClient (info, callback) {
    // authenticate the websocket connection using a jwt
    let params = qs.parse(url.parse(info.req.url).query)

    if (params.token) {
      users.verifyJwt(params.token, (err) => {
        if (err) {
          // invalid token - reject the websocket connection
          hb.logger('Unauthorised WebSocket Connection Closed')
          callback(false)
        }
      })
    } else {
      // no token provided - reject the websocket connection
      callback(false)
    }
    callback(true)
  }

  subscribeHandler (ws, req, msg) {
    if (this.subscriptions[msg.subscribe]) {
      return new this.subscriptions[msg.subscribe](ws, req)
    } else {
      hb.logger(`Invalid subscription: ${msg.subscribe}`)
    }
  }

  unsubscribeHandler (ws, req, msg) {
    if (this.subscriptions[msg.unsubscribe]) {
      ws.emit('unsubscribe', msg.unsubscribe)
    } else {
      hb.logger(`Invalid subscription: ${msg.unsubscribe}`)
    }
  }
}
