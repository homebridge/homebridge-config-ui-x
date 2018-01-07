'use strict'

const express = require('express')
const path = require('path')
const bodyParser = require('body-parser')
const cors = require('cors')
const passport = require('./passport')

const app = express()

// authentication middleware
app.use(passport.initialize())
app.use(passport.session())

// load angular spa
app.get('/', passport.auth, (req, res, next) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'))
})

// static assets
app.use(express.static(path.resolve(__dirname, '../public')))

// enable cors
app.use(cors())

// force basic authentication on everything else
app.use(passport.auth)

// json post handler
app.use(bodyParser.json())

// authenticated routes
app.use('/api/server', require('./routes/server'))
app.use('/api/users', require('./routes/users'))
app.use('/api/plugins', require('./routes/plugins'))
app.use('/api/config', require('./routes/config'))

// serve index.html for anything not on the /api routes
app.get(/^((?!api\/).)*$/, (req, res, next) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'))
})

app.use((req, res, next) => {
  res.sendStatus(404)
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500)
  res.json({
    error: err,
    message: err.message
  })
})

module.exports = app
