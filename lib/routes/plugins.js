'use strict'

const fs = require('fs')
const express = require('express')

const npm = require('../npm')
const hb = require('../hb')

const now = new Date()
const router = express.Router()

const userId = 1000 // fs.append changes the file ownership to root:root this is to change back to user
const groupId = 1000 // fs.append changes the file ownership to root:root this is to change back to user

router.get('/', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/plugins'
    res.redirect('/login')
  }
}, function (req, res, next) {
  if (req.query.search && req.query.search !== '') {
    npm.search(req.query.search, function (err, pkgs) {
      if (err) {
        console.error(err)
      }
      res.render('plugins', {
        controller: 'plugins',
        title: 'Plugins',
        user: req.user,
        search: (req.query.search) ? req.query.search : '',
        packages: pkgs
      })
    })
  } else {
    npm.installed(function (err, pkgs) {
      if (err) {
        console.error(err)
      }
      res.render('plugins', {
        controller: 'plugins',
        title: 'Plugins',
        user: req.user,
        packages: pkgs
      })
    })
  }
})

router.get('/upgrade', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/plugins'
    res.redirect('/login')
  }
}, function (req, res, next) {
  npm.update(req.query.package, function (err, stdout, stderr) {
    if (err) {
      console.error(err)
    }
    hb.logger('Package ' + req.query.package + ' upgraded.')
    res.redirect('/plugins')
  })
})

router.get('/uninstall', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/plugins'
    res.redirect('/login')
  }
}, function (req, res, next) {
  var config = require(hb.config)
  var platforms = []

  for (var i = 0; i < config.platforms.length; i++) {
    if (!config.platforms[i].npm_package || config.platforms[i].npm_package !== req.query.package) {
      platforms.push(config.platforms[i])
    }
  }

  var accessories = []

  for (var b = 0; b < config.accessories.length; b++) {
    if (!config.accessories[b].npm_package || config.accessories[b].npm_package !== req.query.package) {
      accessories.push(config.accessories[b])
    }
  }

  fs.renameSync(hb.config, hb.config + '.' + now.getFullYear() + '-' + now.getMonth() + '-' + now.getDay() + '-' + ('0' + now.getHours()).slice(-2) + ':' +
    ('0' + now.getMinutes()).slice(-2) + ':' +
    ('0' + now.getSeconds()).slice(-2))
  fs.appendFileSync(hb.config, JSON.stringify(config, null, 4))
  fs.chownSync(hb.config, userId, groupId)

  delete require.cache[require.resolve(hb.config)]

  npm.uninstall(req.query.package, function (err, stdout, stderr) {
    if (err) {
      console.error(err)
    }
    hb.logger('Package ' + req.query.package + ' removed.')
    res.redirect('/plugins')
  })
})

router.get('/install', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/plugins'
    res.redirect('/login')
  }
}, function (req, res, next) {
  var platform = {
    'platform': '[ENTER PLATFORM]',
    'npm_package': req.query.package
  }

  res.render('install', {
    controller: 'plugins',
    title: 'Plugins',
    user: req.user,
    package: req.query.package,
    platform_json: JSON.stringify(platform, null, 4)
  })
})

router.post('/install', function (req, res, next) {
  if (req.user) {
    next()
  } else {
    req.session.referer = '/plugins'
    res.redirect('/login')
  }
}, function (req, res, next) {
  var config = require(hb.config)

  if (req.body['platform-code'] !== '' && req.body['platform-name'] !== '') {
    var platform = JSON.parse(req.body['platform-code'])

    platform.name = req.body['platform-name']

    if (!config.platforms) {
      config.platforms = []
    }

    config.platforms.push(platform)
  }

  if (!config.accessories) {
    config.accessories = []
  } else
        if (req.body[req.body.accessory + '-delete'] === 'false') {
          var accessory = JSON.parse(req.body[req.body.accessory + '-code'])

          accessory.name = req.body[req.body.accessory + '-name']
          config.accessories.push(accessory)
        }

  fs.renameSync(hb.config, hb.config + '.' + now.getFullYear() + '-' + now.getMonth() + '-' + now.getDay() + '-' + ('0' + now.getHours()).slice(-2) + ':' +
    ('0' + now.getMinutes()).slice(-2) + ':' +
    ('0' + now.getSeconds()).slice(-2))
  fs.appendFileSync(hb.config, JSON.stringify(config, null, 4))
  fs.chownSync(hb.config, userId, groupId)

  delete require.cache[require.resolve(hb.config)]

  npm.install(req.body.package, function (err, stdout, stderr) {
    if (err) {
      console.error(err)
    }
    hb.logger('Package ' + req.body.package + ' installed.')
    res.redirect('/plugins')
  })
})

module.exports = router
