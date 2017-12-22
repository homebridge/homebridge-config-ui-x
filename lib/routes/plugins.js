'use strict'

const express = require('express')

const hb = require('../hb')
const pm = require('../pm.js')

const router = express.Router()

router.get('/', (req, res, next) => {
  if (req.query.search && req.query.search !== '') {
    return pm.searchRegistry(req.query.search)
      .then(pkgs => {
        res.render('plugins', {
          controller: 'plugins',
          title: 'Plugins',
          user: req.user,
          search: (req.query.search) ? req.query.search : '',
          packages: pkgs
        })
      })
      .catch(next)
  } else {
    return pm.getInstalled()
      .then(pkgs => {
        res.render('plugins', {
          controller: 'plugins',
          title: 'Plugins',
          user: req.user,
          packages: pkgs
        })
      })
      .catch(next)
  }
})

router.get('/upgrade', (req, res, next) => {
  return pm.updatePlugin(req.query.package)
    .then(() => {
      hb.logger('Package ' + req.query.package + ' upgraded.')
      res.redirect('/plugins')
    })
    .catch(next)
})

router.get('/uninstall', (req, res, next) => {
  return pm.removePlugin(req.query.package)
    .then(() => {
      hb.logger('Package ' + req.query.package + ' removed.')
      res.redirect('/plugins')
    })
    .catch(next)
})

router.get('/install', (req, res, next) => {
  return pm.installPlugin(req.query.package)
    .then(() => {
      hb.logger('Package ' + req.query.package + ' installed.')
      res.redirect('/plugins')
    })
    .catch(next)
})

module.exports = router
