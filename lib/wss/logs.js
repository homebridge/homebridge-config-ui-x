'use strict'

const os = require('os')
const fs = require('fs')
const pty = require('node-pty')
const color = require('bash-color')

const hb = require('../hb')

module.exports = class LogsWssHandler {
  constructor (ws, req) {
    this.ws = ws

    if (hb.log && typeof (hb.log) === 'string' && fs.existsSync(hb.log)) {
      this.logFromFile()
    } else if (hb.log && hb.log === 'systemd') {
      this.logFromSystemd()
    } else if (hb.log && typeof (hb.log) === 'object' && hb.log.tail) {
      this.logFromCommand()
    } else {
      this.logNotConfigured()
    }

    // when the client disconnects stop tailing the log file
    let onClose = () => {
      this.killTerm()
    }
    ws.on('close', onClose)

    // when the client leaves the log page, stop tailing the log file
    let onUnsubscribe = (sub) => {
      if (sub === 'logs') {
        this.killTerm()
        ws.removeEventListener('unsubscribe', onUnsubscribe)
        ws.removeEventListener('close', onClose)
      }
    }
    ws.on('unsubscribe', onUnsubscribe)
  }

  send (data) {
    this.ws.send(JSON.stringify({log: data}))
  }

  logFromFile () {
    let command
    if (os.platform() === 'win32') {
      // windows - use powershell to tail log
      command = ['powershell.exe', '-command', `Get-Content -Path '${hb.log}' -Wait -Tail 100`]
    } else {
      // linux / macos etc
      command = `tail -n 100 -f ${hb.log}`.split(' ')

      // sudo mode is requested in plugin config
      if (hb.sudo) {
        command.unshift('sudo', '-n')
      }
    }

    this.send(color.cyan(`Loading logs from file\r\nCMD: ${command.join(' ')}\r\n\r\n`))

    this.tailLog(command)
  }

  logFromSystemd () {
    let command = `journalctl -o cat -n 500 -f -u homebridge`.split(' ')

    // sudo mode is requested in plugin config
    if (hb.sudo) {
      command.unshift('sudo', '-n')
    }

    this.send(color.cyan(`Using systemd to tail logs\r\nCMD: ${command.join(' ')}\r\n\r\n`))

    this.tailLog(command)
  }

  logFromCommand () {
    let command = Array.isArray(hb.log.tail) ? hb.log.tail.slice() : hb.log.tail.split(' ')

    this.send(color.cyan(`Using custom command to tail logs\r\nCMD: ${command.join(' ')}\r\n\r\n`))

    this.tailLog(command)
  }

  logNotConfigured () {
    if (hb.log) {
      this.send(color.red(`Log file does not exist: ${hb.log}\r\n`))
      this.send(color.red(`Please set the correct path to the logs in your Homebridge config.json file.\r\n\r\n`))
    } else {
      this.send(color.red(`Cannot show logs. Log option is not configured in your Homebridge config.json file.\r\n\r\n`))
    }
    this.send(color.cyan(`See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n`))
  }

  tailLog (command) {
    let cmd = command.join(' ')

    // spawn the process that will output the logs
    this.term = pty.spawn(command.shift(), command, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
      env: process.env
    })

    // send stdout data from the process to the client
    this.term.on('data', this.send.bind(this))

    // send an error message to the client if the log tailing process exits early
    this.term.on('exit', (code) => {
      try {
        this.send('\n\r')
        this.send(color.red(`The log tail command "${cmd}" exited with code ${code}.\n\r`))
        this.send(color.red(`Please check the command in your config.json is correct.\n\r\n\r`))
        this.send(color.cyan(`See https://github.com/oznu/homebridge-config-ui-x#log-viewer-configuration for instructions.\r\n`))
      } catch (e) {
        // the client socket probably closed
      }
    })
  }

  killTerm () {
    if (this.term) {
      this.term.kill()
    }
  }

}
