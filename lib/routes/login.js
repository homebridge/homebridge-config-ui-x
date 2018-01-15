'use strict'

const express = require('express')

const users = require('../users')

const router = express.Router()

router.post('/', (req, res, next) => {
  users.findByUsername(req.body.username, (err, user) => {
    if (err) {
      return res.sendStatus(403)
    }

    if (!user) {
      return res.sendStatus(403)
    }

    if (user.hashedPassword !== users.hashPassword(req.body.password, req.body.username)) {
      return res.sendStatus(403)
    }

    return res.json({
      token: users.getJwt(user)
    })
  })
})

module.exports = router
