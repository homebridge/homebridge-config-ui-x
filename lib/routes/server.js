'use strict'

const qr = require('qr-image')
const childProcess = require('child_process')
const express = require('express')

const hb = require('../hb')
const users = require('../users')
const qrcode = require('../qrcode')

const router = express.Router()
const config = require(hb.config)

router.get('/', (req, res, next) => {
  return res.json({
    port: config.bridge.port,
    console_port: hb.port,
    pin: config.bridge.pin
  })
})

router.get('/qrcode.svg', (req, res, next) => {
  let data = qrcode.getCode()

  if (!data) {
    return res.sendStatus(404)
  }

  let qrSvg = qr.image(data, {type: 'svg'})
  res.setHeader('Content-type', 'image/svg+xml')
  qrSvg.pipe(res)
})

router.put('/restart', (req, res, next) => {
  hb.logger('Homebridge restart request received')
  res.status(202).json({ok: true, command: hb.restart})

  setTimeout(() => {
    if (hb.restart) {
      hb.logger(`Executing restart command: ${hb.restart}`)
      childProcess.exec(hb.restart, (err) => {
        if (err) {
          hb.logger('Restart command exited with an error. Failed to restart Homebridge.')
        }
      })
    } else if (hb.restart !== false) {
      hb.logger(`No restart command defined, killing process...`)
      process.exit(1)
    }
  }, 100)
})

router.get('/token', (req, res, next) => {
  return res.json({
    token: users.getJwt(req.user)
  })
})

module.exports = router
