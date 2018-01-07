'use strict'

const childProcess = require('child_process')
const express = require('express')

const pm = require('../pm')
const hb = require('../hb')

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

router.put('/upgrade', (req, res, next) => {
  pm.updateHomebridge()
    .then(() => {
      hb.logger('Homebridge server upgraded.')
      res.render('progress', {
        layout: false,
        message: 'Upgrading Server',
        redirect: '/restart'
      })
    })
    .catch(next)
})

module.exports = router
