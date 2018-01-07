'use strict'

const os = require('os')
const fs = require('fs')
const rp = require('request-promise')

const hb = require('../hb')

const getStats = () => {
  // core stats
  const stats = {
    memory: {
      total: parseFloat(((os.totalmem() / 1024) / 1024) / 1024).toFixed(2),
      used: parseFloat((((os.totalmem() - os.freemem()) / 1024) / 1024) / 1024).toFixed(2),
      free: parseFloat(((os.freemem() / 1024) / 1024) / 1024).toFixed(2)
    },
    cpu: parseFloat((parseFloat(os.loadavg()) * 100) / os.cpus().length).toFixed(2)
  }

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
  var temp
  if (hb.temp) {
    temp = fs.readFileSync(hb.temp)
  } else {
    temp = null
  }
  stats.cputemp = ((temp / 1000).toPrecision(3))

  return stats
}

const checkStatus = () => {
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

module.exports = (ws, req) => {
  let sendData = () => {
    ws.send(JSON.stringify({stats: getStats()}))
  }

  let sendStatus = () => {
    return checkStatus()
      .then(up => ws.send(JSON.stringify({status: up ? 'up' : 'down'})))
      .catch(() => {})
  }

  // on connect send everything
  sendData()
  sendStatus()

  // load stats every 5 seconds and push to client
  let statsInterval = setInterval(sendData, 5000)

  // check status of homebridge every 10 seconds
  let statusInterval = setInterval(sendStatus, 10000)

  // clear interval when socket closes
  let onClose = () => {
    clearInterval(statsInterval)
    clearInterval(statusInterval)
  }
  ws.on('close', onClose)

  // clear interval when client goes to another page
  let onMessage = (sub) => {
    if (sub === 'status-unsub') {
      clearInterval(statsInterval)
      clearInterval(statusInterval)
      ws.removeEventListener('message', onMessage)
      ws.removeEventListener('close', onClose)
    }
  }
  ws.on('message', onMessage)
}
