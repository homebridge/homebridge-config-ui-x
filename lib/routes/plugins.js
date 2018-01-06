'use strict'

const express = require('express')

const hb = require('../hb')
const pm = require('../pm.js')

const router = express.Router()

router.get('/', (req, res, next) => {
  if (req.query.search && req.query.search !== '') {
    return pm.searchRegistry(req.query.search)
      .then(pkgs => {
        res.json(pkgs)
      })
      .catch(next)
  } else {
    return pm.getInstalled()
      .then(pkgs => {
        res.json(pkgs)
      })
      .catch(next)
  }
})

router.get('/homebridge', (req, res, next) => {
  return pm.getHomebridge()
    .then(server => res.json(server))
    .catch(next)
})

router.put('/update', (req, res, next) => {
  return pm.updatePlugin(req.body.package)
    .then(() => {
      hb.logger('Package ' + req.body.package + ' upgraded.')
      res.json({ok: true})
    })
    .catch(next)
})

router.post('/uninstall', (req, res, next) => {
  return pm.removePlugin(req.body.package)
    .then(() => {
      hb.logger('Package ' + req.body.package + ' removed.')
      res.json({ok: true})
    })
    .catch(next)
})

router.post('/install', (req, res, next) => {
  return pm.installPlugin(req.body.package)
    .then(() => {
      hb.logger('Package ' + req.body.package + ' installed.')
      res.json({ok: true})
    })
    .catch(next)
})

module.exports = router
