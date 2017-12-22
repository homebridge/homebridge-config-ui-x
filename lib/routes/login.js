'use strict'

const express = require('express')
const passport = require('passport')

const hb = require('../hb')

const router = express.Router()

router.get('/', (req, res, next) => {
  res.render('login', {
    layout: false,
    controller: 'login'
  })
})

router.post('/', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err)
    }

    if (!user) {
      hb.logger('Failed login attempt.')

      return res.redirect('/login')
    }

    req.logIn(user, (err) => {
      if (err) {
        return next(err)
      }

      var referer = req.session.referer ? req.session.referer : '/'
      delete req.session.referer

      hb.logger(user.name + ' successfully logged in.')

      return res.redirect(referer)
    })
  })(req, res)
})

module.exports = router
