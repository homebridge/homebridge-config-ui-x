'use strict'

const express = require('express')

const hb = require('../hb')
const pm = require('../pm')

const router = express.Router()
const config = require(hb.config)

router.get('/', (req, res, next) => {
  pm.getHomebridge()
    .then(server => {
      res.render('index', {
        controller: 'index',
        title: 'Status',
        user: req.user,
        server: server
      })
    })
})

router.get('/pin', (req, res, next) => {
  res.setHeader('Content-type', 'image/svg+xml')

  res.render('pin', {
    layout: false,
    pin: config.bridge.pin
  })
})

router.get('/restart', (req, res, next) => {
  res.render('progress', {
    layout: false,
    message: 'Restarting Server',
    redirect: '/'
  })

  setTimeout(() => {
    if (hb.restart) {
      require('child_process').exec(hb.restart)
    } else {
      process.exit(0)
    }
  }, 100)
})

router.get('/upgrade', (req, res, next) => {
  pm.updateHomebridge()
    .then(() => {
      hb.logger('Homebridge server upgraded.')
      res.render('progress', {
        layout: false,
        message: 'Upgrading Server',
        redirect: '/restart'
      })
    })
})

router.get('/logout', (req, res, next) => {
  hb.logger(req.user.name + ' logged out.')

  req.logout()
  res.redirect('/')
})

module.exports = router
