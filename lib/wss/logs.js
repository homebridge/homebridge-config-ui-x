'use strict'

const fs = require('fs')
const color = require('bash-color')
const pty = require('pty.js')

const hb = require('../hb')

const tailLog = (ws, req, command) => {
  let cmd = command.join(' ')

  // spawn the process that will output the logs
  let term = pty.spawn(command.shift(), command, {
    name: 'xterm-color',
    cols: 60,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
  })

  let send = (data) => {
    ws.send(JSON.stringify({log: data}))
  }

  // send stdout data from the process to the client
  term.on('data', (data) => {
    send(data)
  })

  // send an error message to the client if the log tailing process exits early
  term.on('exit', (code) => {
    try {
      send('\n\r')
      send(color.red(`The log tail command "${cmd}" exited with code ${code}.\n\r`))
      send(color.red(`Please check the command in your config.json is correct.\n\r`))
    } catch (e) {
      // the client socket probably closed
    }
  })

  // when the client disconnects stop tailing the log file
  let onClose = () => {
    term.kill()
  }
  ws.on('close', onClose)

  // when the client leaves the log page, stop tailing the log file
  let onMessage = (sub) => {
    if (sub === 'logs-unsub') {
      term.kill()
      ws.removeEventListener('message', onMessage)
      ws.removeEventListener('close', onClose)
    }
  }
  ws.on('message', onMessage)
}

module.exports = (ws, req) => {
  if (hb.log && typeof (hb.log) === 'string' && fs.existsSync(hb.log)) {
    let command = `tail -n 100 -f ${hb.log}`.split(' ')

    // sudo mode is requested in plugin config
    if (hb.sudo) {
      command.unshift('sudo', '-n')
    }

    ws.send(JSON.stringify({log: color.cyan(`Loading logs from file file\r\nCMD: ${command.join(' ')}\r\n\r\n`)}))

    tailLog(ws, req, command)
  } else if (hb.log && hb.log === 'systemd') {
    let command = `journalctl -o cat -n 500 -f -u homebridge`.split(' ')

    // sudo mode is requested in plugin config
    if (hb.sudo) {
      command.unshift('sudo', '-n')
    }

    ws.send(JSON.stringify({log: color.cyan(`Using systemd to tail logs\r\nCMD: ${command.join(' ')}\r\n\r\n`)}))

    tailLog(ws, req, command)
  } else if (hb.log && typeof (hb.log) === 'object' && hb.log.tail) {
    let command = hb.log.tail.split(' ')
    tailLog(ws, req, command)
  } else {
    ws.send(JSON.stringify({log: color.red(`Log file does not exist: ${hb.log}\r\n`)}))
    ws.send(JSON.stringify({log: color.red(`Please set the correct path to the logs in the homebridge config.json\r\n\r\n`)}))
    ws.send(JSON.stringify({log: color.cyan(`See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n`)}))
  }
}
