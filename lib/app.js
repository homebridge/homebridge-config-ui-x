'use strict'

const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const passport = require('passport')
const Strategy = require('passport-local').Strategy

const users = require('./users')

const app = express()

app.use(express.static(path.resolve(__dirname, '../public')))
app.engine('html', require('hogan-express'))

app.set('views', path.resolve(__dirname, '../views'))
app.set('view engine', 'html')
app.set('layout', 'layout')

app.use(cookieParser())

app.use(bodyParser.urlencoded({
  extended: true
}))

app.use(require('express-session')({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: false
}))

passport.use(new Strategy((username, password, callback) => {
  users.findByUsername(username, (err, user) => {
    if (err) {
      return callback(err)
    }

    if (!user) {
      return callback(null, false)
    }

    if (user.password !== password) {
      return callback(null, false)
    }

    return callback(null, user)
  })
}))

passport.serializeUser((user, callback) => {
  callback(null, user.id)
})

passport.deserializeUser((id, callback) => {
  users.findById(id, (err, user) => {
    if (err) {
      return callback(err)
    }

    callback(null, user)
  })
})

app.use(passport.initialize())
app.use(passport.session())

// unauthenticated routes
app.use('/login', require('./routes/login'))
app.use('/status', require('./routes/status'))

// authentication middleware
app.use(users.auth)

// authenticated routes
app.use('/', require('./routes/index'))
app.use('/log', require('./routes/log'))
app.use('/accounts', require('./routes/accounts'))
app.use('/plugins', require('./routes/plugins'))
app.use('/config', require('./routes/config'))

app.use((req, res, next) => {
  var err = new Error('Not Found')

  err.status = 404
  next(err)
})

app.use((err, req, res, next) => {
  console.error(err)
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}
  res.status(err.status || 500)
  res.render('error', {
    controller: 'error',
    title: 'Error'
  })
})

module.exports = app
