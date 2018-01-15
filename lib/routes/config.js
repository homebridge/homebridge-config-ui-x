'use strict'

const fs = require('fs')
const express = require('express')
const hb = require('../hb')

const router = express.Router()

router.get('/', (req, res, next) => {
  res.sendFile(hb.config)
})

router.post('/', (req, res, next) => {
  const config = req.body
  const now = new Date()

  // create backup of existing config
  fs.renameSync(hb.config, `${hb.config}.${now.getTime()}`)

  // write new config
  fs.appendFileSync(hb.config, JSON.stringify(config, null, 4))

  delete require.cache[require.resolve(hb.config)]

  hb.logger('Configuration Changes Saved')

  res.json({ok: true})
})

module.exports = router
