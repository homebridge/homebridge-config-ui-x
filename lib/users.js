'use strict'

const crypto = require('crypto')
const fs = require('fs')
const hb = require('./hb')

class Users {
  findById (id, callback) {
    let authfile = this.getUsers()

    let user = authfile.find(x => x.id === id)

    if (user) {
      callback(null, user)
    } else {
      callback(new Error('User ' + id + ' does not exist'))
    }
  }

  findByUsername (username, callback) {
    let authfile = this.getUsers()

    let user = authfile.find(x => x.username === username)

    if (user) {
      callback(null, user)
    } else {
      callback(null, null)
    }
  }

  getUsers () {
    delete require.cache[require.resolve(hb.authfile)]
    return require(hb.authfile)
  }

  hashPassword (password, salt) {
    // pbkdf2 iterations have been kept low so we don't lock up homebridge when a user logs in on low powered devices
    // we're using the username as the salt for the sake of keeping the module portable
    let derivedKey = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512')
    return derivedKey.toString('hex')
  }

  addUser (user) {
    let authfile = this.getUsers()

    // user object
    let newuser = {
      id: authfile.length ? Math.max.apply(Math, authfile.map(x => x.id)) + 1 : 1,
      username: user.username,
      name: user.name,
      hashedPassword: this.hashPassword(user.password, user.username),
      admin: user.admin
    }

    // add the user to the authfile
    authfile.push(newuser)

    // update the auth.json
    fs.writeFileSync(hb.authfile, JSON.stringify(authfile, null, 4))

    hb.logger(`Added new user: ${user.username}`)
  }

  updateUser (userId, update) {
    let authfile = this.getUsers()

    let user = authfile.find(x => x.id === userId)

    if (!user) {
      throw new Error('User not gound')
    }

    user.name = update.name || user.name
    user.admin = update.admin || user.admin

    if (update.password) {
      user.hashedPassword = this.hashPassword(update.password, user.username)
    }

    // update the auth.json
    fs.writeFileSync(hb.authfile, JSON.stringify(authfile, null, 4))

    hb.logger(`Updated user: ${user.username}`)
  }

  deleteUser (id) {
    let authfile = this.getUsers()

    let index = authfile.findIndex(x => x.id === parseInt(id))
    if (index < 0) {
      throw new Error('User not found')
    }

    authfile.splice(index, 1)

    // update the auth.json
    fs.writeFileSync(hb.authfile, JSON.stringify(authfile, null, 4))

    hb.logger(`Deleted user with ID ${id}`)
  }

  updateOldPasswords () {
    let authfile = this.getUsers()

    authfile = authfile.map((user) => {
      if (user.password && !user.hashedPassword) {
        user.hashedPassword = this.hashPassword(user.password, user.username)
        delete user.password
        return user
      } else {
        return user
      }
    })

    fs.writeFileSync(hb.authfile, JSON.stringify(authfile, null, 4))
  }

  setupDefaultUser () {
    return this.addUser({
      'username': 'admin',
      'password': 'admin',
      'name': 'Administrator',
      'admin': true
    })
  }

  setupAuthFile () {
    if (!fs.existsSync(hb.authfile)) {
      fs.writeFileSync(hb.authfile, '[]')
    }

    let authfile = this.getUsers()

    // if there are no admin users, add the default user
    if (!authfile.find(x => x.admin === true || x.username === 'admin')) {
      this.setupDefaultUser()
    }

    // update older auth.json files from plain text to hashed passwords
    if (authfile.find(x => x.password && !x.hashedPassword)) {
      this.updateOldPasswords()
    }
  }
}

module.exports = new Users()
