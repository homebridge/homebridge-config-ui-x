const passport = require('passport')
const BasicStrategy = require('passport-http').BasicStrategy
const users = require('./users')

passport.use(new BasicStrategy((username, password, callback) => {
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

passport.auth = passport.authenticate('basic', {session: false})

module.exports = passport
