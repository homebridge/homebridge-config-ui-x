'use strict'

const express = require('express')

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

module.exports = router
