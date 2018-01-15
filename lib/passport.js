const passport = require('passport')
const BasicStrategy = require('passport-http').BasicStrategy

const hb = require('./hb')
const users = require('./users')

passport.use(new BasicStrategy((username, password, callback) => {
  users.findByUsername(username, (err, user) => {
    if (err) {
      return callback(err)
    }

    if (!user) {
      return callback(null, false)
    }

    if (user.hashedPassword !== users.hashPassword(password, username)) {
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

passport.noAuth = (req, res, next) => {
  req.user = users.getUsers()[0]
  next()
}

passport.formAuth = (req, res, next) => {
  if (req.headers['x-jwt']) {
    users.verifyJwt(req.headers['x-jwt'], (err, user) => {
      if (err) {
        return res.sendStatus(401)
      }
      req.user = user
      next()
    })
  } else {
    return res.sendStatus(401)
  }
}

if (hb.authMethod === 'none' || hb.authMethod === false) {
  hb.logger('Authentication Disabled')
  hb.formAuth = false
  passport.auth = passport.noAuth
  passport.staticAuth = passport.noAuth
} else if (hb.authMethod === 'basic') {
  hb.logger('Using Basic Authentication')
  hb.formAuth = false
  passport.auth = passport.authenticate('basic', {session: false})
  passport.staticAuth = passport.authenticate('basic', {session: false})
} else {
  hb.formAuth = true
  hb.logger('Using Form Authentication')
  passport.auth = passport.formAuth
  passport.staticAuth = passport.noAuth
}

module.exports = passport
