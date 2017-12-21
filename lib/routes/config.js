'use strict'

const fs = require('fs')
const express = require('express')

const hb = require('../hb')

const router = express.Router()
const now = new Date()

const userId = 1000
const groupId = 1000

router.get('/', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/config'
    res.redirect('/login')
  }
}, function (req, res, next) {
  write(req, res)
})

router.post('/', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/config'
    res.redirect('/login')
  }
}, function (req, res, next) {
  save(req, res)
  write(req, res)
})

router.get('/advanced', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/config/advanced'
    res.redirect('/login')
  }
}, function (req, res, next) {
  delete require.cache[require.resolve(hb.config)]

  res.render('advanced', {
    controller: 'config',
    title: 'Configuration',
    user: req.user,
    config: JSON.stringify(require(hb.config), null, 4)
  })
})

router.post('/advanced', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/config/advanced'
    res.redirect('/login')
  }
}, function (req, res, next) {
  var config = JSON.parse(req.body['config'])

  fs.renameSync(hb.config, hb.config + '.' + now.getFullYear() + '-' + now.getMonth() + '-' + now.getDay() + '-' + ('0' + now.getHours()).slice(-2) + ':' +
    ('0' + now.getMinutes()).slice(-2) + ':' +
    ('0' + now.getSeconds()).slice(-2))
  fs.appendFileSync(hb.config, JSON.stringify(config, null, 4))
  fs.chownSync(hb.config, userId, groupId)

  delete require.cache[require.resolve(hb.config)]

  hb.logger('Advanced Configuration Changed.')

  res.render('advanced', {
    controller: 'config',
    title: 'Configuration',
    user: req.user,
    config: JSON.stringify(require(hb.config), null, 4)
  })
})

router.get('/backup', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/config'
    res.redirect('/login')
  }
}, function (req, res, next) {
  var config = require(hb.config)

  res.setHeader('Content-disposition', 'attachment; filename=config.json')
  res.setHeader('Content-type', 'application/json')

  res.write(JSON.stringify(config, null, 4), function (err) {
    if (err) {
      console.error(err)
    }
    res.end()
  })
})

function write (req, res) {
  var config = require(hb.config)

  var server = {
    name: (config.bridge.name || 'Homebridge'),
    mac: (config.bridge.username || 'CC:22:3D:E3:CE:30'),
    port: (config.bridge.port || 51826),
    pin: (config.bridge.pin || '031-45-154')
  }

  var platforms = []

  for (var i = 0; i < config.platforms.length; i++) {
    var name = config.platforms[i].name

    delete config.platforms[i].name

    platforms.push({
      id: config.platforms[i].platform.split('.')[0],
      name: name,
      json: JSON.stringify(config.platforms[i], null, 4)
    })
  }

  var accessories = []

  if (config.accessories === undefined) {
    console.log('accessories is undefined')
    for (var b = 0; b < config.accessories; b++) {
      console.log('accessories is undefined in Loop')
      name = config.accessories.name

      delete config.accessories.name

      accessories.push({
        id: i + '-' + config.accessories.accessory.split('.')[0],
        name: name,
        json: JSON.stringify(config.accessories, null, 4)
      })
    }
  } else if (config.accessories.length !== undefined) {
    console.log('accessories is NOT undefined')
    for (i = 0; i < config.accessories.length; i++) {
      console.log('accessories is NOT undefined in loops')
      name = config.accessories[i].name

      delete config.accessories[i].name

      accessories.push({
        id: i + '-' + config.accessories[i].accessory.split('.')[0],
        name: name,
        json: JSON.stringify(config.accessories[i], null, 4)
      })
    }
  }

  delete require.cache[require.resolve(hb.config)]

  res.render('config', {
    controller: 'config',
    title: 'Configuration',
    user: req.user,
    server: server,
    platforms: platforms,
    accessories: accessories
  })
}

function save (req, res) {
  var config = require(hb.config)

  config.bridge.name = req.body.name
  config.bridge.username = req.body.mac
  config.bridge.port = (!isNaN(parseInt(req.body.port))) ? parseInt(req.body.port) : 51826
  config.bridge.pin = req.body.pin

  config.platforms = []

  if (Object.prototype.toString.call(req.body.platform) === '[object Array]') {
    for (var i = 0; i < req.body.platform.length; i++) {
      if (req.body[req.body.platform[i] + '-delete'] === 'false') {
        var platform = JSON.parse(req.body[req.body.platform[i] + '-code'])

        platform.name = req.body[req.body.platform[i] + '-name']
        config.platforms.push(platform)
      }
    }
  } else if (req.body.platform && req.body.platform !== '') {
    if (req.body[req.body.platform + '-delete'] === 'false') {
      platform = JSON.parse(req.body[req.body.platform + '-code'])

      platform.name = req.body[req.body.platform + '-name']
      config.platforms.push(platform)
    }
  }

  config.accessories = []

  if (Object.prototype.toString.call(req.body.accessory) === '[object Array]') {
    for (i = 0; i < req.body.accessory.length; i++) {
      if (req.body[req.body.accessory[i] + '-delete'] === 'false') {
        var accessory = JSON.parse(req.body[req.body.accessory[i] + '-code'])

        accessory.name = req.body[req.body.accessory[i] + '-name']
        config.accessories.push(accessory)
      }
    }
  } else if (req.body.accessory && req.body.accessory !== '') {
    if (req.body[req.body.accessory + '-delete'] === 'false') {
      accessory = JSON.parse(req.body[req.body.accessory + '-code'])

      accessory.name = req.body[req.body.accessory + '-name']
      config.accessories.push(accessory)
    }
  }

  fs.renameSync(hb.config, hb.config + '.' + now.getFullYear() + '-' + now.getMonth() + '-' + now.getDay() + '-' + ('0' + now.getHours()).slice(-2) + ':' +
    ('0' + now.getMinutes()).slice(-2) + ':' +
    ('0' + now.getSeconds()).slice(-2))
  fs.appendFileSync(hb.config, JSON.stringify(config, null, 4))
  fs.chownSync(hb.config, userId, groupId)

  delete require.cache[require.resolve(hb.config)]

  hb.logger('Configuration Changed.')
}

module.exports = router
