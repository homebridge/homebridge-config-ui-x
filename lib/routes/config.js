'use strict'

const fs = require('fs')
const express = require('express')

const hb = require('../hb')

const router = express.Router()

router.get('/', (req, res, next) => {
  delete require.cache[require.resolve(hb.config)]

  res.render('advanced', {
    controller: 'config',
    title: 'Configuration',
    user: req.user,
    config: JSON.stringify(require(hb.config), null, 4)
  })
})

router.post('/advanced', (req, res, next) => {
  const config = JSON.parse(req.body['config'])
  const now = new Date()

  fs.renameSync(hb.config, hb.config + '.' + now.getFullYear() + '-' + now.getMonth() + '-' + now.getDay() + '-' + ('0' + now.getHours()).slice(-2) + ':' +
    ('0' + now.getMinutes()).slice(-2) + ':' +
    ('0' + now.getSeconds()).slice(-2))
  fs.appendFileSync(hb.config, JSON.stringify(config, null, 4))

  delete require.cache[require.resolve(hb.config)]

  hb.logger('Advanced Configuration Changed.')

  res.redirect('/config')
})

router.get('/backup', (req, res, next) => {
  var config = require(hb.config)

  res.setHeader('Content-disposition', 'attachment; filename=config.json')
  res.setHeader('Content-type', 'application/json')

  res.write(JSON.stringify(config, null, 4), (err) => {
    if (err) {
      console.error(err)
    }
    res.end()
  })
})

module.exports = router
