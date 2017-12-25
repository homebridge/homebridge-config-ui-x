'use strict'

const _ = require('lodash')
const os = require('os')
const path = require('path')
const semver = require('semver')
const Bluebird = require('bluebird')
const rp = require('request-promise')

const fs = Bluebird.promisifyAll(require('fs'))
const childProcess = Bluebird.promisifyAll(require('child_process'))

const hb = require('./hb')

class PackageManager {
  constructor () {
    // load base paths where plugins might be installed
    this.paths = this.getBasePaths()

    // setup requests with default options
    this.rp = rp.defaults({json: true})

    // pre-load installed plugins
    this.plugins = []
    this.getInstalled()
  }

  getBasePaths () {
    // this is the same code used by homebridge to find plugins
    // https://github.com/nfarina/homebridge/blob/c73a2885d62531925ea439b9ad6d149a285f6daa/lib/plugin.js#L105-L134

    let win32 = process.platform === 'win32'
    let paths = []

    // add the paths used by require()
    paths = paths.concat(require.main.paths)

    if (hb.pluginPath) {
      this.customPluginPath = path.resolve(process.cwd(), hb.pluginPath)
      paths.unshift(this.customPluginPath)
    }

    // THIS SECTION FROM: https://github.com/yeoman/environment/blob/master/lib/resolver.js

    // Adding global npm directories
    // We tried using npm to get the global modules path, but it haven't work out
    // because of bugs in the parseable implementation of `ls` command and mostly
    // performance issues. So, we go with our best bet for now.
    if (process.env.NODE_PATH) {
      paths = process.env.NODE_PATH.split(path.delimiter)
        .filter(function (p) { return !!p }) // trim out empty values
        .concat(paths)
    } else {
      // Default paths for each system
      if (win32) {
        paths.push(path.join(process.env.APPDATA, 'npm/node_modules'))
      } else {
        paths.push('/usr/local/lib/node_modules')
        paths.push('/usr/lib/node_modules')
        paths.push(childProcess.execSync('/bin/echo -n "$(npm -g prefix)/lib/node_modules"').toString('utf8'))
      }
    }

    // filter out duplicates and non-existent paths
    return _.uniq(paths).filter((requiredPath) => {
      return fs.existsSync(requiredPath)
    })
  }

  getInstalled () {
    let staging = []
    let plugins = []

    return Bluebird.map(this.paths, (requiredPath) => {
      return fs.readdirAsync(requiredPath)
        .map(name => path.join(requiredPath, name))
        .filter(pluginPath => fs.statAsync(path.join(pluginPath, 'package.json')).catch(x => false))
        .map(pluginPath => fs.readFileAsync(path.join(pluginPath, 'package.json'), 'utf8').then(JSON.parse).catch(x => false))
        .filter(pluginPath => pluginPath)
        .filter(pjson => pjson.name && pjson.name.indexOf('homebridge-') === 0)
        .filter(pjson => pjson.keywords && pjson.keywords.includes('homebridge-plugin'))
        .map(pjson => {
          let plugin = {
            name: pjson.name,
            installed: pjson.version || '0.0.1',
            description: pjson.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim(),
            globalInstall: (requiredPath !== this.customPluginPath),
            pluginPath: requiredPath
          }

          return this.rp.get(`https://api.npms.io/v2/package/${pjson.name}`)
            .then((pkg) => {
              // found on npm, it's a public package
              plugin.publicPackage = true
              plugin.version = pkg.collected.metadata.version
              plugin.update = semver.lt(plugin.installed, pkg.collected.metadata.version)
              plugin.links = pkg.collected.metadata.links
              if (!staging.find(x => x.name === plugin.name && x.globalInstall === plugin.globalInstall)) {
                staging.push(plugin)
              }
            })
            .catch((err) => {
              if (err.statusCode !== 404) {
                console.error(err.message)
              }
              // not found on npm, assuming a non public package
              plugin.publicPackage = false
              plugin.version = 'N/A'
              plugin.update = false
              plugin.links = false
              if (!staging.find(x => x.name === plugin.name && x.globalInstall === plugin.globalInstall)) {
                staging.push(plugin)
              }
            })
        })
    })
    .then(() => {
      // filter out duplicate plugins and give preference to non-global plugins
      staging.forEach((plugin) => {
        if (!plugins.find(x => plugin.name === x.name)) {
          plugins.push(plugin)
        } else if (!plugin.globalInstall && plugins.find(x => plugin.name === x.name && x.globalInstall === true)) {
          let index = plugins.findIndex(x => plugin.name === x.name && x.globalInstall === true)
          plugins[index] = plugin
        }
      })

      this.plugins = _.sortBy(plugins, ['name'])
      return this.plugins
    })
  }

  searchRegistry (query) {
    let packages = []

    var q = ((!query || !query.length) ? '' : query + '+') + 'keywords:homebridge-plugin+not:deprecated+not:insecure&size=30'
    return this.rp.get(`https://api.npms.io/v2/search?q=${q}`)
    .then((res) => {
      return res.results
    })
    .filter(pkg => pkg.package.name && pkg.package.name.indexOf('homebridge-') === 0)
    .map((pkg) => {
      if (this.plugins.find(x => x.name === pkg.package.name)) {
        // a plugin with the same name is already installed
        let installedPlugin = this.plugins.find(x => x.name === pkg.package.name)
        packages.push({
          name: pkg.package.name,
          installed: installedPlugin.installed,
          version: pkg.package.version,
          update: semver.lt(installedPlugin.installed, pkg.package.version),
          description: pkg.package.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim(),
          links: pkg.package.links
        })
      } else {
        packages.push({
          name: pkg.package.name,
          version: pkg.package.version,
          description: pkg.package.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim(),
          links: pkg.package.links
        })
      }
    })
    .then(x => packages)
  }

  getHomebridge () {
    return this.rp.get(`https://api.npms.io/v2/package/homebridge`)
      .then(pkg => {
        return {
          name: pkg.collected.metadata.name,
          installed: hb.homebridge.serverVersion,
          version: pkg.collected.metadata.version,
          update: semver.lt(hb.homebridge.serverVersion, pkg.collected.metadata.version),
          description: pkg.collected.metadata.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim(),
          links: pkg.collected.metadata.links
        }
      })
  }

  installPlugin (pkg) {
    return this.getInstalled()
      .then(plugins => {
        // install new plugins in the same location as this plugin
        let installPath = (hb.homebridge.pluginPath) ? hb.homebridge.pluginPath : plugins.find(x => x.name === hb.this.name).pluginPath

        // prepare flags for npm command
        let installOptions = []

        // check to see if custom plugin path is using a package.json file
        if (installPath === this.customPluginPath && fs.existsSync(path.resolve(installPath, '../package.json'))) {
          installPath = path.resolve(installPath, '../')
          installOptions.push('--save')
        }

        installOptions = installOptions.join(' ')

        return childProcess.execAsync(`npm install ${installOptions} ${pkg}@latest`, {cwd: installPath})
      })
  }

  removePlugin (pkg) {
    return this.getInstalled()
      .then(plugins => {
        // install new plugins in the same location as this plugin
        let installPath = plugins.find(x => x.name === pkg).pluginPath

        // prepare flags for npm command
        let installOptions = []

        // check to see if custom plugin path is using a package.json file
        if (installPath === this.customPluginPath && fs.existsSync(path.resolve(installPath, '../package.json'))) {
          installPath = path.resolve(installPath, '../')
          installOptions.push('--save')
        }

        installOptions = installOptions.join(' ')

        return childProcess.execAsync(`npm uninstall ${installOptions} ${pkg}`, {cwd: installPath})
      })
  }

  updatePlugin (pkg) {
    return this.getInstalled()
      .then(plugins => {
        // install new plugins in the same location as this plugin
        let installPath = plugins.find(x => x.name === pkg).pluginPath

        // prepare flags for npm command
        let installOptions = []

        // check to see if custom plugin path is using a package.json file
        if (installPath === this.customPluginPath && fs.existsSync(path.resolve(installPath, '../package.json'))) {
          installPath = path.resolve(installPath, '../')
          installOptions.push('--save')
        }

        installOptions = installOptions.join(' ')

        return childProcess.execAsync(`npm install ${installOptions} ${pkg}@latest`, {cwd: installPath})
      })
  }

  updateHomebridge () {
    let paths = this.getBasePaths()
    let yarnDir = null
    // check if homebridge was installed using yarn
    return childProcess.execAsync('yarn global dir', {cwd: os.tmpdir()})
      .then(data => {
        yarnDir = path.join(data.trim(data), 'node_modules')
        paths.push(yarnDir)
        return paths
      })
      .catch(() => {
        return paths
      })
      .filter(requiredPath => fs.statAsync(path.join(requiredPath, 'homebridge', 'package.json')).catch(x => false))
      .map(installPath => {
        if (installPath === yarnDir) {
          hb.logger(`Using yarn to upgrade homebridge at ${installPath}...`)
          return childProcess.execAsync(`yarn add homebridge@latest`, {cwd: installPath})
            .then(() => {
              hb.logger(`Upgraded homebridge using yarn at ${installPath}`)
            })
        } else {
          hb.logger(`Using npm to upgrade homebridge at ${installPath}...`)
          return childProcess.execAsync(`npm install homebridge@latest`, {cwd: installPath})
            .then(() => {
              hb.logger(`Upgraded homebridge using npm at ${installPath}`)
            })
        }
      })
  }
}

module.exports = new PackageManager()
