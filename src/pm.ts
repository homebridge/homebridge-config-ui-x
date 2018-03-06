import * as os from 'os';
import * as _ from 'lodash';
import * as path from 'path';
import * as nodeFs from 'fs';
import * as pty from 'node-pty';
import * as semver from 'semver';
import * as color from 'bash-color';
import * as Bluebird from 'bluebird';
import * as rp from 'request-promise';
import * as child_process from 'child_process';

const fs = Bluebird.promisifyAll(nodeFs);
const childProcess = Bluebird.promisifyAll(child_process);

import { hb } from './hb';

class PackageManager {
  private paths: Array<any>;
  private plugins: Array<any>;
  private customPluginPath: string;
  private rp: any;
  private npm: any;
  private nsp: string;

  constructor() {
    // load base paths where plugins might be installed
    this.paths = this.getBasePaths();

    // setup requests with default options
    this.rp = rp.defaults({json: true});

    // get npm path
    this.npm = this.getNpmPath();

    // get nsp path
    this.nsp = path.resolve(require.resolve('nsp'), '../../bin/nsp');

    // pre-load installed plugins
    this.plugins = [];
    this.getInstalled();
  }

  getNpmPath() {
    if (os.platform() === 'win32') {
      // if running on windows find the full path to npm
      const windowsNpmPath = [
        path.join(process.env.APPDATA, 'npm/npm.cmd'),
        path.join(process.env.ProgramFiles, 'nodejs/npm.cmd')
      ]
      .filter(fs.existsSync);

      if (windowsNpmPath.length) {
        return windowsNpmPath[0];
      } else {
        hb.log(color.red(`ERROR: Cannot find npm binary. You will not be able to manage plugins or update homebridge.`));
        hb.log(color.red(`ERROR: You might be able to fix this problem by running: npm install -g npm`));
        return 'npm';
      }
    } else {
      // Linux and macOS don't require the full path to npm
      return 'npm';
    }
  }

  getBasePaths() {
    // this is the same code used by homebridge to find plugins
    // https://github.com/nfarina/homebridge/blob/c73a2885d62531925ea439b9ad6d149a285f6daa/lib/plugin.js#L105-L134

    let paths = [];

    // add the paths used by require()
    paths = paths.concat(require.main.paths);

    if (hb.pluginPath) {
      this.customPluginPath = path.resolve(process.cwd(), hb.pluginPath);
      paths.unshift(this.customPluginPath);
    }

    // THIS SECTION FROM: https://github.com/yeoman/environment/blob/master/lib/resolver.js

    // Adding global npm directories
    // We tried using npm to get the global modules path, but it haven't work out
    // because of bugs in the parseable implementation of `ls` command and mostly
    // performance issues. So, we go with our best bet for now.
    if (process.env.NODE_PATH) {
      paths = process.env.NODE_PATH.split(path.delimiter)
        .filter((p) => !!p) // trim out empty values
        .concat(paths);
    } else {
      // Default paths for each system
      if ((os.platform() === 'win32')) {
        paths.push(path.join(process.env.APPDATA, 'npm/node_modules'));
      } else {
        paths.push('/usr/local/lib/node_modules');
        paths.push('/usr/lib/node_modules');
        paths.push(childProcess.execSync('/bin/echo -n "$(npm -g prefix)/lib/node_modules"').toString('utf8'));
      }
    }

    // filter out duplicates and non-existent paths
    return _.uniq(paths).filter((requiredPath) => {
      return fs.existsSync(requiredPath);
    });
  }

  wssBroadcast(data) {
    hb.wss.server.clients.forEach(function each (client) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({npmLog: data}));
      }
    });
  }

  executeCommand(command, cwd) {
    let timeoutTimer;
    command = command.filter(x => x.length);

    // sudo mode is requested in plugin config
    if (hb.useSudo) {
      command.unshift('sudo', '-E', '-n');
    }

    hb.log(`Running Command: ${command.join(' ')}`);
    this.wssBroadcast(color.cyan(`USER: ${os.userInfo().username}\n\r`));
    this.wssBroadcast(color.cyan(`DIR: ${cwd}\n\r`));
    this.wssBroadcast(color.cyan(`CMD: ${command.join(' ')}\n\r\n\r`));

    return new Bluebird((resolve, reject) => {
      const term = pty.spawn(command.shift(), command, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: cwd,
        env: process.env
      });

      // send stdout data from the process to all clients
      term.on('data', (data) => {
        this.wssBroadcast(data);
      });

      // send an error message to the client if the command does not exit with code 0
      term.on('exit', (code) => {
        if (code === 0) {
          this.wssBroadcast(color.green(`\n\rCommand succeeded!.\n\r`));
          clearTimeout(timeoutTimer);
          resolve();
        } else {
          clearTimeout(timeoutTimer);
          reject(`Command failed. Please review log for details`);
        }
      });

      // if the command spends to long trying to execute kill it after 5 minutes
      timeoutTimer = setTimeout(() => {
        term.kill('SIGTERM');
      }, 300000);
    })
    .then(() => {
      // update the installed cache
      return this.getInstalled();
    });
  }

  runNspScan(pkgPath: string) {
    if (hb.disableNsp) {
      return;
    }

    return new Bluebird((resolve, reject) => {
      let timeoutTimer;
      const command = ['node', this.nsp, 'check', `${pkgPath}`];

      // sudo mode is requested in plugin config
      if (hb.useSudo) {
        command.unshift('sudo', '-E', '-n');
      }

      this.wssBroadcast(color.cyan(`\n\r[nodesecurity.io] Scanning plugin for vulnerabilities...\n\r\n\r`));
      hb.log(`Running Command: ${command.join(' ')}`);

      const term = pty.spawn(command.shift(), command, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        env: process.env
      });

      // send stdout data from the process to all clients
      term.on('data', (data) => {
        this.wssBroadcast(data);
      });

      // send an error message to the client if the command does not exit with code 0
      term.on('exit', (code) => {
        if (code === 0) {
          this.wssBroadcast(color.green(`\n\rCommand succeeded!.\n\r`));
          clearTimeout(timeoutTimer);
          resolve();
        } else if (code === 1) {
          clearTimeout(timeoutTimer);
          this.wssBroadcast(color.yellow(`\n\rThe plugin has still been installed. Use at your own risk.`));
          reject(`Security scan returned possible vulnerabilities.`);
        } else {
          reject(`Security scan failed to run. Error code: ${code}`);
        }
      });

      // if the command spends to long trying to execute kill it after 5 minutes
      timeoutTimer = setTimeout(() => {
        term.kill('SIGTERM');
      }, 60000);
    })
    .delay(1000);
  }

  getInstalled() {
    const staging = [];
    const plugins = [];

    return Bluebird.map(this.paths, (requiredPath) => {
      return fs.readdirAsync(requiredPath)
        .map(name => path.join(requiredPath, name))
        .filter(pluginPath => fs.statAsync(path.join(pluginPath, 'package.json')).catch(x => false))
        .map(pluginPath => fs.readFileAsync(path.join(pluginPath, 'package.json'), 'utf8').then(JSON.parse).catch(x => false))
        .filter(pluginPath => pluginPath)
        .filter(pjson => pjson.name && pjson.name.indexOf('homebridge-') === 0)
        .filter(pjson => pjson.keywords && pjson.keywords.includes('homebridge-plugin'))
        .map(pjson => {
          const plugin: any = {
            name: pjson.name,
            installed: pjson.version || '0.0.1',
            description: pjson.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim(),
            globalInstall: (requiredPath !== this.customPluginPath),
            pluginPath: requiredPath
          };

          return this.rp.get(`https://registry.npmjs.org/${encodeURIComponent(pjson.name).replace('%40', '@')}`)
            .then((pkg) => {
              // found on npm, it's a public package
              plugin.publicPackage = true;
              plugin.version = pkg['dist-tags'].latest;
              plugin.update = semver.lt(plugin.installed, plugin.version);
              plugin.links = {
                npm: `https://www.npmjs.com/package/${pjson.name}`,
                homepage: pkg.homepage,
                bugs: (pkg.bugs) ? pkg.bugs.url : null
              };
              plugin.author = (pkg.maintainers.length) ? pkg.maintainers[0].name : null;
              if (!staging.find(x => x.name === plugin.name && x.globalInstall === plugin.globalInstall)) {
                staging.push(plugin);
              }
            })
            .catch((err) => {
              if (err.statusCode !== 404) {
                console.error(err.message);
              }
              // not found on npm, assuming a non public package
              plugin.publicPackage = false;
              plugin.version = 'N/A';
              plugin.update = false;
              plugin.links = false;
              if (!staging.find(x => x.name === plugin.name && x.globalInstall === plugin.globalInstall)) {
                staging.push(plugin);
              }
            });
        });
    })
    .then(() => {
      // filter out duplicate plugins and give preference to non-global plugins
      staging.forEach((plugin) => {
        if (!plugins.find(x => plugin.name === x.name)) {
          plugins.push(plugin);
        } else if (!plugin.globalInstall && plugins.find(x => plugin.name === x.name && x.globalInstall === true)) {
          const index = plugins.findIndex(x => plugin.name === x.name && x.globalInstall === true);
          plugins[index] = plugin;
        }
      });

      this.plugins = _.sortBy(plugins, ['name']);
      return this.plugins;
    });
  }

  searchRegistry(query) {
    const packages = [];

    const q = ((!query || !query.length) ? '' : query + '+') + 'keywords:homebridge-plugin+not:deprecated&size=30';
    return this.rp.get(`https://registry.npmjs.org/-/v1/search?text=${q}`)
    .then((res) => {
      return res.objects;
    })
    .filter(pkg => pkg.package.name && pkg.package.name.indexOf('homebridge-') === 0)
    .map((pkg) => {
      if (this.plugins.find(x => x.name === pkg.package.name)) {
        // a plugin with the same name is already installed
        const installedPlugin = this.plugins.find(x => x.name === pkg.package.name);
        packages.push({
          publicPackage: true,
          name: pkg.package.name,
          installed: installedPlugin.installed,
          version: pkg.package.version,
          update: semver.lt(installedPlugin.installed, pkg.package.version),
          description: (pkg.package.description) ?
            pkg.package.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim() : pkg.package.name,
          links: pkg.package.links,
          author: pkg.package.publisher.username
        });
      } else {
        packages.push({
          publicPackage: true,
          name: pkg.package.name,
          version: pkg.package.version,
          description: (pkg.package.description) ?
            pkg.package.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim() : pkg.package.name,
          links: pkg.package.links,
          author: pkg.package.publisher.username
        });
      }
    })
    .then(x => packages);
  }

  getHomebridge() {
    return this.rp.get(`https://registry.npmjs.org/${encodeURIComponent(hb.homebridgeNpmPkg).replace('%40', '@')}`)
      .then(pkg => {
        return {
          name: pkg.name,
          installed: hb.homebridge.serverVersion,
          version: pkg['dist-tags'].latest,
          update: semver.lt(hb.homebridge.serverVersion, pkg['dist-tags'].latest),
          description: pkg.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim(),
          fork: false
        };
      });
  }

  getHomebridgeFork() {
    return this.rp.get(`https://raw.githubusercontent.com/${hb.homebridgeFork}/master/package.json`)
      .then(pkg => {
        return {
          name: pkg.name,
          installed: hb.homebridge.serverVersion,
          version: pkg.version,
          update: semver.lt(hb.homebridge.serverVersion, pkg.version),
          description: pkg.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim(),
          fork: hb.homebridgeFork
        };
      });
  }

  installPlugin(pkg) {
    return this.getInstalled()
      .then(plugins => {
        // install new plugins in the same location as this plugin
        let installPath = (this.customPluginPath) ? this.customPluginPath : plugins.find(x => x.name === hb.ui.name).pluginPath;

        // the plugin install destination
        const pkgPath = path.resolve(installPath, pkg);

        // prepare flags for npm command
        const installOptions: any = [];

        // check to see if custom plugin path is using a package.json file
        if (installPath === this.customPluginPath && fs.existsSync(path.resolve(installPath, '../package.json'))) {
          installPath = path.resolve(installPath, '../');
          installOptions.push('--save');
        }

        return this.executeCommand([this.npm, 'install', '--unsafe-perm', ...installOptions, `${pkg}@latest`], installPath)
          .then(() => this.runNspScan(pkgPath));
      })
      .catch((err) => {
        this.wssBroadcast(color.red(`\n\r${err}\n\r`));
        throw err;
      });
  }

  removePlugin(pkg) {
    return this.getInstalled()
      .then(plugins => {
        // install new plugins in the same location as this plugin
        let installPath;
        if (plugins.find(x => x.name === pkg)) {
          installPath = plugins.find(x => x.name === pkg).pluginPath;
        } else {
          throw new Error(`Plugin "${pkg}" Not Found`);
        }

        // prepare flags for npm command
        const installOptions: any = [];

        // check to see if custom plugin path is using a package.json file
        if (installPath === this.customPluginPath && fs.existsSync(path.resolve(installPath, '../package.json'))) {
          installPath = path.resolve(installPath, '../');
          installOptions.push('--save');
        }

        return this.executeCommand([this.npm, 'uninstall', '--unsafe-perm', ...installOptions, pkg], installPath);
      })
      .catch((err) => {
        this.wssBroadcast(color.red(`\n\r${err}\n\r`));
        throw err;
      });
  }

  updatePlugin(pkg) {
    return this.getInstalled()
      .then(plugins => {
        // install new plugins in the same location as this plugin
        let installPath;
        if (plugins.find(x => x.name === pkg)) {
          installPath = plugins.find(x => x.name === pkg).pluginPath;
        } else {
          throw new Error(`Plugin "${pkg}" Not Found`);
        }

        // the plugin install destination
        const pkgPath = path.resolve(installPath, pkg);

        // prepare flags for npm command
        const installOptions: any = [];

        // check to see if custom plugin path is using a package.json file
        if (installPath === this.customPluginPath && fs.existsSync(path.resolve(installPath, '../package.json'))) {
          installPath = path.resolve(installPath, '../');
          installOptions.push('--save');
        }

        return this.executeCommand([this.npm, 'install', '--unsafe-perm', ...installOptions, `${pkg}@latest`], installPath)
          .then(() => this.runNspScan(pkgPath));
      })
      .catch((err) => {
        this.wssBroadcast(color.red(`\n\r${err}\n\r`));
        throw err;
      });
  }

  updateHomebridge() {
    const paths = this.getBasePaths();
    let yarnDir = null;
    // check if homebridge was installed using yarn
    return childProcess.execAsync('yarn global dir', {cwd: os.tmpdir()})
      .then(data => {
        yarnDir = path.join(data.trim(data), 'node_modules');
        paths.push(yarnDir);
        return paths;
      })
      .catch(() => {
        return paths;
      })
      .filter(requiredPath => fs.statAsync(path.join(requiredPath, hb.homebridgeNpmPkg, 'package.json')).catch(x => false))
      .map(installPath => {
        hb.log(`Using npm to upgrade homebridge at ${installPath}...`);
        const pkg = hb.homebridgeFork ? hb.homebridgeFork : `${hb.homebridgeNpmPkg}@latest`;
        return this.executeCommand([this.npm, 'install', '--unsafe-perm', pkg], installPath)
          .then(() => {
            hb.log(`Upgraded homebridge using npm at ${installPath}`);
          });
      })
      .catch((err) => {
        this.wssBroadcast(color.red(`\n\r${err}\n\r`));
        throw err;
      });
  }
}

export const pm = new PackageManager();
