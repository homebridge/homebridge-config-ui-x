'use strict'

const express = require('express')

const users = require('../users')

const router = express.Router()

router.get('/', (req, res, next) => {
  let authfile = users.getUsers()

  // remove user passwords before sending to client
  authfile = authfile.map((user) => {
    delete user.password
    return user
  })

  res.json(authfile)
})

router.post('/', (req, res, next) => {
  let authfile = users.getUsers()

  // check to see if user already exists
  if (authfile.find(x => x.username === req.body.username)) {
    return res.sendStatus(409)
  }

  users.addUser(req.body)

  res.json({ok: true})
})

router.delete('/:id', (req, res, next) => {
  users.deleteUser(req.params.id)
  res.json({ok: true})
})

router.put('/:id', (req, res, next) => {
  users.updateUser(parseInt(req.params.id), req.body)
  res.json({ok: true})
})

module.exports = router
