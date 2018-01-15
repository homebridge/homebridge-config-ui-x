'use strict'

const express = require('express')

const hb = require('../hb')

const router = express.Router()

// these are settings sent to the Angular SPA during bootstrap
router.get('/', (req, res, next) => {
  res.json({
    formAuth: hb.formAuth
  })
})

module.exports = router
