'use strict'

const fs = require('fs')
const reader = require('read-last-lines')
const express = require('express')

const convert = require('../ansi')
const hb = require('../hb')

const router = express.Router()

router.get('/', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/log'
    res.redirect('/login')
  }
}, function (req, res, next) {
  res.render('log', {
    controller: 'log',
    title: 'Log',
    user: req.user
  })
})

router.get('/error', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/log/error'
    res.redirect('/login')
  }
}, function (req, res, next) {
  res.render('warnings', {
    controller: 'log',
    title: 'Log',
    user: req.user
  })
})

router.get('/raw/out', function (req, res, next) {
  reader.read(hb.log, 100).then((data) => res.send(convert(data)))
})

router.get('/raw/error', function (req, res, next) {
  reader.read(hb.error_log, 100).then((data) => res.send(convert(data)))
})

router.get('/clear', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/log'
    res.redirect('/login')
  }
}, function (req, res, next) {
  fs.truncate(hb.log, 0, function () {
    fs.truncate(hb.error_log, 0, function () {
      hb.logger('Logs cleared by ' + req.user.name + '.')
    })
  })
})

module.exports = router
