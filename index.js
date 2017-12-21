'use strict'

const fs = require('fs')
const path = require('path')
const http = require('http')

const hb = require('./lib/hb')

var homebridge

module.exports = function (service) {
  homebridge = service
  homebridge.registerPlatform('homebridge-config-ui', 'config', HomebridgeConfigUi)
}

class HomebridgeConfigUi {
  constructor (log, config) {
    hb.logger = log
    hb.service = homebridge
    hb.config = homebridge.user.configPath()
    hb.authfile = path.join(homebridge.user.storagePath(), 'auth.json')
    hb.log = config.log || '/var/log/homebridge.stdout.log'
    hb.error_log = config.error_log || '/var/log/homebridge.stderr.log'
    hb.restart = config.restart || '/usr/local/bin/supervisorctl restart homebridge'
    hb.temp = config.temp || '/sys/class/thermal/thermal_zone0/temp'
    hb.base = config.base || '/usr/local/lib/node_modules'
    hb.port = config.port || 8080

    if (!fs.existsSync(hb.authfile)) {
      fs.appendFileSync(hb.authfile, JSON.stringify([{
        'id': 1,
        'username': 'admin',
        'password': 'admin',
        'name': 'Administrator',
        'admin': true
      }], null, 4))
    }

    var modified = false
    hb.auth = require(hb.authfile)

    for (var i = 0; i < hb.auth.length; i++) {
      if (hb.auth[i].id === 1 && !hb.auth[i].admin) {
        hb.auth[i].admin = true
        modified = true
      }
    }

    if (modified) {
      fs.writeFileSync(hb.authfile, JSON.stringify(hb.auth, null, 4))
    }

    var app = require('./lib/app')
    var server = http.createServer(app)

    const onError = (error) => {
      if (error.syscall !== 'listen') {
        throw error
      }

      var bind = typeof hb.port === 'string' ? 'Pipe ' + hb.port : 'Port ' + hb.port

      switch (error.code) {
        case 'EACCES':
          console.error(bind + ' requires elevated privileges')
          process.exit(1)

        case 'EADDRINUSE':
          console.error(bind + ' is already in use')
          process.exit(1)

        default:
          throw error
      }
    }

    const onListening = () => {
      var addr = server.address()
      var bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port
      var msg = 'Console is listening on ' + bind + '.'
      hb.logger(msg)
    }

    server.listen(hb.port)
    server.on('error', onError)
    server.on('listening', onListening)
  }

  accessories (callback) {
    let accessories = []
    callback(accessories)
  }
}
