'use strict'

const fs = require('fs')
const WebSocket = require('ws')
const childProcess = require('child_process')
const reader = require('read-last-lines')
const Tail = require('tail').Tail

const convert = require('./ansi')
const hb = require('./hb')

const tailLogFromFile = (ws, req) => {
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
}

const tailLogFromCommand = (ws, req) => {
  console.log(ws)
  // spawn the process that will output the logs
  let command = hb.log.tail.split(' ')
  let tail = childProcess.spawn(command.shift(), command)

  // send stdout data from the process to the client
  tail.stdout.on('data', (data) => {
    ws.send(JSON.stringify({type: 'stdout', data: convert(data).replace(/\n$/, '')}))
  })

  // send stderr data from the process to the client
  tail.stderr.on('data', (data) => {
    ws.send(JSON.stringify({type: 'stdout', data: convert(data).replace(/\n$/, '')}))
  })

  // send an error message to the client if the log tailing process exits early
  tail.on('close', (code) => {
    try {
      ws.send(JSON.stringify({type: 'stdout', data: `<span style="color:red;">The log tail command "${hb.log.tail}" exited unexpectedly with code ${code}. Please check the command in your config.json is correct.</span>`}))
    } catch (e) {
      // the client socket probably closed
    }
  })

  // when the client leaves the log page, stop tailing the log file
  ws.on('close', () => {
    tail.kill()
  })
}

module.exports = (server) => {
  const wss = new WebSocket.Server({ server })

  wss.on('connection', (ws, req) => {
    if (hb.log && typeof (hb.log) === 'string' && fs.existsSync(hb.log)) {
      // start tailing the log
      tailLogFromFile(ws, req)
    } else if (hb.log && typeof (hb.log) === 'object' && hb.log.tail) {
      tailLogFromCommand(ws, req)
    } else {
      ws.send(JSON.stringify({type: 'stdout', data: `Log file does not exist: ${hb.log}`}))
      ws.send(JSON.stringify({type: 'stdout', data: `Please set the correct path for the logs in the homebridge config.json`}))
    }

    // absorb websocket errors
    ws.on('error', () => {})
  })

  return wss
}
