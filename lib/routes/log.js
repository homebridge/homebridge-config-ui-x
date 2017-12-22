'use strict'

const fs = require('fs')
const express = require('express')

const hb = require('../hb')

const router = express.Router()

router.get('/', (req, res, next) => {
  res.render('log', {
    controller: 'log',
    title: 'Log',
    user: req.user
  })
})

router.get('/clear', (req, res, next) => {
  fs.truncate(hb.log, 0, () => {
    hb.logger('Logs cleared by ' + req.user.name + '.')
  })
})

module.exports = router
