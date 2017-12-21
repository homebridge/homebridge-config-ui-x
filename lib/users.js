'use strict'

const hb = require('./hb')

module.exports.findById = function (id, callback) {
  process.nextTick(function () {
    var idx = id - 1

    if (hb.auth[idx]) {
      callback(null, hb.auth[idx])
    } else {
      callback(new Error('User ' + id + ' does not exist'))
    }
  })
}

module.exports.findByUsername = function (username, callback) {
  process.nextTick(function () {
    for (var i = 0, len = hb.auth.length; i < len; i++) {
      var record = hb.auth[i]

      if (record.username === username) {
        return callback(null, record)
      }
    }

    return callback(null, null)
  })
}
