'use strict'

const fs = require('fs')
const os = require('os')
const express = require('express')

const hb = require('../hb')

const router = express.Router()
const config = require(hb.config)

router.get('/', (req, res, next) => {
  var mem = {
    total: parseFloat(((os.totalmem() / 1024) / 1024) / 1024).toFixed(2),
    used: parseFloat((((os.totalmem() - os.freemem()) / 1024) / 1024) / 1024).toFixed(2),
    free: parseFloat(((os.freemem() / 1024) / 1024) / 1024).toFixed(2)
  }

  var load = parseFloat((parseFloat(os.loadavg()) * 100) / os.cpus().length).toFixed(2)

  var uptime = {
    delta: Math.floor(os.uptime())
  }

  var temp
  if (hb.temp) {
    temp = fs.readFileSync(hb.temp)
  } else {
    temp = null
  }
  var cputemp = ((temp / 1000).toPrecision(3)) + '°C'

  uptime.days = Math.floor(uptime.delta / 86400)
  uptime.delta -= uptime.days * 86400
  uptime.hours = Math.floor(uptime.delta / 3600) % 24
  uptime.delta -= uptime.hours * 3600
  uptime.minutes = Math.floor(uptime.delta / 60) % 60

  res.render('status', {
    layout: false,
    port: config.bridge.port,
    console_port: hb.port,
    uptime: uptime,
    cpu: load,
    mem: mem,
    cputemp: cputemp
  })
})

module.exports = router
