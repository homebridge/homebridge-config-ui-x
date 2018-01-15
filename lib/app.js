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
app.get('/', passport.staticAuth, (req, res, next) => {
  res.sendFile(path.resolve(__dirname, '../public/index.html'))
})

// static assets
app.use(express.static(path.resolve(__dirname, '../public')))

// enable cors for development using ng serve
app.use(cors({
  origin: ['http://localhost:4200'],
  credentials: true
}))

// json post handler
app.use(bodyParser.json())

app.use('/api/login', require('./routes/login'))
app.use('/api/settings', require('./routes/settings'))

// force authentication on all other /api routes
app.use('/api', passport.auth)

// authenticated routes
app.use('/api/server', require('./routes/server'))
app.use('/api/users', require('./routes/users'))
app.use('/api/packages', require('./routes/packages'))
app.use('/api/config', require('./routes/config'))

// serve index.html for anything not on the /api routes
app.get(/^((?!api\/).)*$/, passport.staticAuth, (req, res, next) => {
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
