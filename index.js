'use strict'

const fs = require('fs')
const path = require('path')
const http = require('http')
const commander = require('commander')

const hb = require('./lib/hb')
const wss = require('./lib/wss-logs')

var homebridge

module.exports = (service) => {
  homebridge = service
  homebridge.registerPlatform('homebridge-config-ui-x', 'config', HomebridgeConfigUi)
}

class HomebridgeConfigUi {
  constructor (log, config) {
    // parse plugin path argument from homebridge
    commander
      .allowUnknownOption()
      .option('-P, --plugin-path [path]', '', (p) => {
        hb.pluginPath = p
      })
      .parse(process.argv)

    hb.logger = log
    hb.homebridge = homebridge
    hb.config = homebridge.user.configPath()
    hb.authfile = path.join(homebridge.user.storagePath(), 'auth.json')
    hb.port = config.port || 8080
    hb.log = config.log || '/var/log/homebridge.log'
    hb.restart = config.restart
    hb.temp = config.temp

    if (!fs.existsSync(hb.authfile)) {
      fs.appendFileSync(hb.authfile, JSON.stringify([{
        'id': 1,
        'username': 'admin',
        'password': 'admin',
        'name': 'Administrator',
        'admin': true
      }], null, 4))
    }

    let modified = false
    hb.auth = require(hb.authfile)

    for (let i = 0; i < hb.auth.length; i++) {
      if (hb.auth[i].id === 1 && !hb.auth[i].admin) {
        hb.auth[i].admin = true
        modified = true
      }
    }

    if (modified) {
      fs.writeFileSync(hb.authfile, JSON.stringify(hb.auth, null, 4))
    }

    let app = require('./lib/app')
    let server = http.createServer(app)

    // attach websocker server to the express server
    wss(server)

    const onError = (error) => {
      if (error.syscall !== 'listen') {
        throw error
      }

      var bind = typeof hb.port === 'string' ? 'Pipe ' + hb.port : 'Port ' + hb.port

      switch (error.code) {
        case 'EACCES':
          console.error(bind + ' requires elevated privileges')
          process.exit(1)
          break
        case 'EADDRINUSE':
          console.error(bind + ' is already in use')
          process.exit(1)
          break
        default:
          throw error
      }
    }

    const onListening = () => {
      let addr = server.address()
      let bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port
      let msg = 'Console is listening on ' + bind + '.'
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
