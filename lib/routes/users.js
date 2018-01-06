'use strict'

const fs = require('fs')
const express = require('express')

const hb = require('../hb')

const router = express.Router()

router.get('/', (req, res, next) => {
  // clear user cache
  delete require.cache[require.resolve(hb.authfile)]

  // load authfile from disk
  let authfile = require(hb.authfile)

  // remove user passwords before sending to client
  authfile = authfile.map((user) => {
    delete user.password
    return user
  })

  res.json(authfile)
})

router.post('/', (req, res, next) => {
  if (req.user.admin) {
    if (!isNaN(parseInt(req.body.id)) && req.body.username !== '' && req.body.name !== '') {
      var data = require(hb.authfile)

      if (parseInt(req.body.id) === 0) {
        if (req.body.password !== '') {
          var id = 0

          for (var i = 0; i < data.length; i++) {
            if (data[i].id > id) {
              id = data[i].id
            }
          }

          data.push({
            id: (id + 1),
            username: req.body.username,
            password: req.body.password,
            name: req.body.name,
            admin: (req.body.admin === 'true')
          })
        }
      } else {
        for (i = 0; i < data.length; i++) {
          if (data[i].id === parseInt(req.body.id)) {
            data[i].username = req.body.username
            data[i].name = req.body.name
            data[i].admin = (req.body.admin === 'true')

            if (req.body.password !== '') {
              data[i].password = req.body.password
            }

            break
          }
        }
      }

      fs.writeFileSync(hb.authfile, JSON.stringify(data, null, 4))

      delete require.cache[require.resolve(hb.authfile)]

      hb.auth = require(hb.authfile)
    }

    res.redirect('/accounts')
  } else {
    var err = new Error('Forbidden')

    err.status = 403
    next(err)
  }
})

router.get('/delete', (req, res, next) => {
  if (req.user.admin) {
    if (!isNaN(parseInt(req.query.id)) && parseInt(req.query.id) > 1) {
      var current = require(hb.authfile)
      var data = []

      for (var i = 0; i < current.length; i++) {
        if (current[i].id !== parseInt(req.query.id)) {
          data.push(current[i])
        }
      }

      fs.writeFileSync(hb.authfile, JSON.stringify(data, null, 4))

      delete require.cache[require.resolve(hb.authfile)]

      hb.auth = require(hb.authfile)
    }

    res.redirect('/accounts')
  } else {
    var err = new Error('Forbidden')

    err.status = 403
    next(err)
  }
})

router.post('/password', (req, res, next) => {
  if (!isNaN(parseInt(req.body.id)) && (parseInt(req.body.id) === req.user.id || req.user.admin)) {
    if (req.body.password !== '') {
      var data = require(hb.authfile)

      for (var i = 0; i < data.length; i++) {
        if (data[i].id === parseInt(req.body.id)) {
          data[i].password = req.body.password
          break
        }
      }

      fs.writeFileSync(hb.authfile, JSON.stringify(data, null, 4))

      delete require.cache[require.resolve(hb.authfile)]

      hb.auth = require(hb.authfile)
    }

    res.redirect(req.session.referer ? req.session.referer : '/')
  } else {
    var err = new Error('Forbidden')

    err.status = 403
    next(err)
  }
})

module.exports = router
