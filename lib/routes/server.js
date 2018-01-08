'use strict'

const childProcess = require('child_process')
const express = require('express')

const hb = require('../hb')
const users = require('../users')

const router = express.Router()
const config = require(hb.config)

router.get('/', (req, res, next) => {
  return res.json({
    port: config.bridge.port,
    console_port: hb.port,
    pin: config.bridge.pin
  })
})

router.put('/restart', (req, res, next) => {
  hb.logger('Homebridge restart request received')
  res.status(202).json({ok: true, command: hb.restart})

  setTimeout(() => {
    if (hb.restart) {
      hb.logger(`Executing restart command: ${hb.restart}`)
      childProcess.exec(hb.restart)
    } else if (hb.restart !== false) {
      hb.logger(`No restart command defined, killing process...`)
      process.exit(0)
    }
  }, 100)
})

router.get('/token', (req, res, next) => {
  res.json({token: users.getJwt(req.user), username: req.user.username})
})

module.exports = router
