'use strict'

const os = require('os')
const fs = require('fs')
const rp = require('request-promise')

const hb = require('../hb')
const config = require(hb.config)

module.exports = class StatusWssHandler {
  constructor (ws, req) {
    this.ws = ws

    // on connect send everything
    this.sendData()
    this.sendStatus()
    this.sendServerStatus()

    // load stats every 5 seconds and push to client
    let statsInterval = setInterval(this.sendData.bind(this), 5000)

    // check status of homebridge every 10 seconds
    let statusInterval = setInterval(this.sendServerStatus.bind(this), 10000)

    // clear interval when socket closes
    let onClose = () => {
      clearInterval(statsInterval)
      clearInterval(statusInterval)
    }
    ws.on('close', onClose)

    // clear interval when client goes to another page
    let onUnsubscribe = (sub) => {
      if (sub === 'status') {
        clearInterval(statsInterval)
        clearInterval(statusInterval)
        ws.removeEventListener('unsubscribe', onUnsubscribe)
        ws.removeEventListener('close', onClose)
      }
    }
    ws.on('unsubscribe', onUnsubscribe)
  }

  sendData () {
    if (this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({stats: this.getStats()}))
    }
  }

  sendStatus () {
    this.ws.send(JSON.stringify({
      server: {
        consolePort: hb.port,
        port: config.bridge.port,
        pin: config.bridge.pin
      }
    }))
  }

  sendServerStatus () {
    return this.checkStatus()
      .then(up => {
        if (this.ws.readyState === 1) {
          this.ws.send(JSON.stringify({
            server: {
              consolePort: hb.port,
              port: config.bridge.port,
              pin: config.bridge.pin,
              status: up ? 'up' : 'down'
            },
            status: up ? 'up' : 'down' // TODO remove this in next major version
          }))
        }
      })
      .catch(() => {})
  }

  getStats () {
    // core stats
    const stats = {
      memory: {
        total: parseFloat(((os.totalmem() / 1024) / 1024) / 1024).toFixed(2),
        used: parseFloat((((os.totalmem() - os.freemem()) / 1024) / 1024) / 1024).toFixed(2),
        free: parseFloat(((os.freemem() / 1024) / 1024) / 1024).toFixed(2)
      }
    }

    stats.cpu = (os.platform() === 'win32') ? null : parseFloat((parseFloat(os.loadavg()) * 100) / os.cpus().length).toFixed(2)

    // server uptime
    let uptime = {
      delta: Math.floor(os.uptime())
    }

    uptime.days = Math.floor(uptime.delta / 86400)
    uptime.delta -= uptime.days * 86400
    uptime.hours = Math.floor(uptime.delta / 3600) % 24
    uptime.delta -= uptime.hours * 3600
    uptime.minutes = Math.floor(uptime.delta / 60) % 60

    stats.uptime = uptime

    // cpu temp
    var temp = null
    if (hb.temp) {
      try {
        temp = fs.readFileSync(hb.temp)
        temp = ((temp / 1000).toPrecision(3))
      } catch (e) {
        temp = null
        hb.logger(`ERROR: Failed to read temp from ${hb.temp}`)
      }
    }
    stats.cputemp = temp

    return stats
  }

  checkStatus () {
    const config = require(hb.config)
    // check if homebridge is running on the port specified in the config.json
    return rp.get(`http://localhost:${config.bridge.port}`, {
      resolveWithFullResponse: true,
      simple: false // <- This prevents the promise from failing on a 404
    })
    .then(() => {
      return true
    })
    .catch(() => {
      return false
    })
  }
}
