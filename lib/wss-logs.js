'use strict'

const fs = require('fs')
const WebSocket = require('ws')
const reader = require('read-last-lines')
const Tail = require('tail').Tail

const convert = require('./ansi')
const hb = require('./hb')

module.exports = (server) => {
  const wss = new WebSocket.Server({ server })

  wss.on('connection', (ws, req) => {
    if (hb.log && fs.existsSync(hb.log)) {
      // start tailing the log
      let tail = new Tail(hb.log)

      // get the first 100 lines and send it to the client
      reader.read(hb.log, 100).then((data) => {
        ws.send(JSON.stringify({type: 'stdout', data: convert(data)}))
      })

      // each time a new line is written to the log send it to the client
      tail.on('line', (data) => {
        ws.send(JSON.stringify({type: 'stdout', data: convert(data)}))
      })

      // when the client leaves the log page, stop tailing the log file
      ws.on('close', () => {
        tail.unwatch()
      })

      // capture tail errors
      tail.on('error', (err) => {
        hb.logger(err.message)
      })
    } else {
      ws.send(JSON.stringify({type: 'stdout', data: `Log file does not exist: ${hb.log}`}))
      ws.send(JSON.stringify({type: 'stdout', data: `Please set the correct path for the logs in the homebridge config.json`}))
    }

    // absorb websocket errors
    ws.on('error', () => {})
  })

  return wss
}
