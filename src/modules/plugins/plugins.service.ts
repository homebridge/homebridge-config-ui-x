import { Injectable, NotFoundException } from '@nestjs/common';
import { HomebridgePlugin, IPackageJson, INpmSearchResults, INpmRegistryModule } from './types';
import axios from 'axios';
import * as os from 'os';
import * as _ from 'lodash';
import * as path from 'path';
import * as https from 'https';
import * as fs from 'fs-extra';
import * as child_process from 'child_process';
import * as semver from 'semver';
import * as color from 'bash-color';
import * as pty from 'node-pty-prebuilt-multiarch';
import * as NodeCache from 'node-cache';

import { Logger } from '../../core/logger/logger.service';
import { ConfigService } from '../../core/config/config.service';

@Injectable()
export class PluginsService {
  private npm: Array<string> = this.getNpmPath();
  private paths: Array<string> = this.getBasePaths();

  // installed plugin cache
  private installedPlugins: HomebridgePlugin[];

  // npm package cache
  private npmPackage: HomebridgePlugin;

  // verified plugins cache
  private verifiedPlugins: string[] = [];

  // misc schemas
  private miscSchemas = {
    'homebridge-tplink-smarthome': path.join(process.env.UIX_BASE_PATH, 'misc-schemas', 'homebridge-tplink-smarthome.json'),
  };

  // setup http client with default options
  private http = axios.create({
    headers: {
      'User-Agent': this.configService.package.name,
    },
    timeout: 5000,
    httpsAgent: new https.Agent({ keepAlive: true })
  });

  // create a cache for storing plugin package.json from npm
  private npmPluginCache = new NodeCache({ stdTTL: 300 });

  constructor(
    private configService: ConfigService,
    private logger: Logger,
  ) {

    /**
     * The "timeout" option on axios is the response timeout
     * If the user has no internet, the dns lookup may take a long time to timeout
     * As the dns lookup timeout is not configurable in Node.js, this interceptor
     * will cancel the request after 15 seconds.
     */
    this.http.interceptors.request.use((config) => {
      const source = axios.CancelToken.source();
      config.cancelToken = source.token;

      setTimeout(() => {
        source.cancel('Timeout: request took more than 15 seconds');
      }, 15000);

      return config;
    });

    this.loadVerifiedPluginsList();
  }

  /**
   * Return an array of plugins currently installed
   */
  public async getInstalledPlugins(): Promise<HomebridgePlugin[]> {
    const plugins: HomebridgePlugin[] = [];
    const modules = await this.getInstalledModules();

    // filter out non-homebridge plugins by name
    const homebridgePlugins = modules
      .filter(module => (module.name.indexOf('homebridge-') === 0) || this.isScopedPlugin(module.name))
      .filter(async module => (await fs.pathExists(path.join(module.installPath, 'package.json')).catch(x => null)))
      .filter(x => x);

    await Promise.all(homebridgePlugins.map(async (pkg) => {
      try {
        const pjson: IPackageJson = await fs.readJson(path.join(pkg.installPath, 'package.json'));
        // check each plugin has the 'homebridge-plugin' keyword
        if (pjson.keywords && pjson.keywords.includes('homebridge-plugin')) {
          // parse the package.json for each plugin
          const plugin = await this.parsePackageJson(pjson, pkg.path);

          // filter out duplicate plugins and give preference to non-global plugins
          if (!plugins.find(x => plugin.name === x.name)) {
            plugins.push(plugin);
          } else if (!plugin.globalInstall && plugins.find(x => plugin.name === x.name && x.globalInstall === true)) {
            const index = plugins.findIndex(x => plugin.name === x.name && x.globalInstall === true);
            plugins[index] = plugin;
          }
        }
      } catch (e) {
        this.logger.error(`Failed to parse plugin "${pkg.name}": ${e.message}`);
      }
    }));

    this.installedPlugins = plugins;
    return _.orderBy(plugins, [(resultItem) => { return resultItem.name === this.configService.name; }, 'updateAvailable', 'name'], ['desc', 'desc', 'asc']);
  }

  /**
   * Returns an array of out-of-date plugins
   */
  public async getOutOfDatePlugins(): Promise<HomebridgePlugin[]> {
    const plugins = await this.getInstalledPlugins();
    return plugins.filter(x => x.updateAvailable);
  }

  /**
   * Search the npm registry for homebridge plugins
   * @param query
   */
  public async searchNpmRegistry(query: string): Promise<HomebridgePlugin[]> {
    if (!this.installedPlugins) {
      await this.getInstalledPlugins();
    }

    const q = ((!query || !query.length) ? '' : query + '+') + 'keywords:homebridge-plugin+not:deprecated&size=30';
    const searchResults: INpmSearchResults = (await this.http.get(`https://registry.npmjs.org/-/v1/search?text=${q}`)).data;

    const result: HomebridgePlugin[] = searchResults.objects
      .filter(x => x.package.name.indexOf('homebridge-') === 0 || this.isScopedPlugin(x.package.name))
      .map((pkg) => {
        let plugin: HomebridgePlugin = {
          name: pkg.package.name,
        };

        // see if the plugin is already installed
        const isInstalled = this.installedPlugins.find(x => x.name === plugin.name);
        if (isInstalled) {
          plugin = isInstalled;
          return plugin;
        }

        // it's not installed; finish building the response
        plugin.publicPackage = true;
        plugin.installedVersion = null;
        plugin.latestVersion = pkg.package.version;
        plugin.lastUpdated = pkg.package.date;
        plugin.description = (pkg.package.description) ?
          pkg.package.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim() : pkg.package.name;
        plugin.links = pkg.package.links;
        plugin.author = (pkg.package.publisher) ? pkg.package.publisher.username : null;
        plugin.verifiedPlugin = this.verifiedPlugins.includes(pkg.package.name);

        return plugin;
      });

    if (!result.length && (query.indexOf('homebridge-') === 0 || this.isScopedPlugin(query))) {
      return await this.searchNpmRegistrySingle(query);
    }

    return _.orderBy(result, ['verifiedPlugin'], ['desc']);
  }

  /**
   * Get a single plugin from the registry using it's exact name
   * Used as a fallback if the search queries are not finding the desired plugin
   * @param query
   */
  async searchNpmRegistrySingle(query: string): Promise<HomebridgePlugin[]> {
    try {
      const pkg: INpmRegistryModule = (await (this.http.get(`https://registry.npmjs.org/${encodeURIComponent(query).replace('%40', '@')}`))).data;
      if (!pkg.keywords || !pkg.keywords.includes('homebridge-plugin')) {
        return [];
      }

      let plugin: HomebridgePlugin;

      // see if the plugin is already installed
      const isInstalled = this.installedPlugins.find(x => x.name === pkg.name);
      if (isInstalled) {
        plugin = isInstalled;
        return [plugin];
      }

      plugin = {
        name: pkg.name,
        description: (pkg.description) ?
          pkg.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim() : pkg.name,
        verifiedPlugin: this.verifiedPlugins.includes(pkg.name),
      } as HomebridgePlugin;

      // it's not installed; finish building the response
      plugin.publicPackage = true;
      plugin.latestVersion = pkg['dist-tags'] ? pkg['dist-tags'].latest : undefined;
      plugin.lastUpdated = pkg.time.modified;
      plugin.updateAvailable = false;
      plugin.links = {
        npm: `https://www.npmjs.com/package/${plugin.name}`,
        homepage: pkg.homepage,
      };
      plugin.author = (pkg.maintainers.length) ? pkg.maintainers[0].name : null;
      plugin.verifiedPlugin = this.verifiedPlugins.includes(pkg.name);

      return [plugin];
    } catch (e) {
      if (e.statusCode !== 404) {
        this.logger.error('Failed to search npm registry');
        this.logger.error(e.message);
      }
      return [];
    }
  }

  /**
   * Installs the requested plugin with NPM
   * @param pluginName
   * @param client
   */
  async installPlugin(pluginName: string, client) {
    await this.getInstalledPlugins();

    // install new plugins in the same location as this plugin
    let installPath = (this.configService.customPluginPath) ?
      this.configService.customPluginPath : this.installedPlugins.find(x => x.name === this.configService.name).installPath;

    // prepare flags for npm command
    const installOptions: Array<string> = [];

    // check to see if custom plugin path is using a package.json file
    if (installPath === this.configService.customPluginPath && await fs.pathExists(path.resolve(installPath, '../package.json'))) {
      installOptions.push('--save');
    }

    installPath = path.resolve(installPath, '../');

    await this.runNpmCommand([...this.npm, 'install', ...installOptions, `${pluginName}@latest`], installPath, client);

    return true;
  }

  /**
   * Removes the requested plugin with NPM
   * @param pluginName
   * @param client
   */
  async uninstallPlugin(pluginName: string, client) {
    await this.getInstalledPlugins();
    // find the plugin
    const plugin = this.installedPlugins.find(x => x.name === pluginName);
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" Not Found`);
    }

    // get the currently installed
    let installPath = plugin.installPath;

    // prepare flags for npm command
    const installOptions: Array<string> = [];

    // check to see if custom plugin path is using a package.json file
    if (installPath === this.configService.customPluginPath && await fs.pathExists(path.resolve(installPath, '../package.json'))) {
      installOptions.push('--save');
    }

    installPath = path.resolve(installPath, '../');

    await this.runNpmCommand([...this.npm, 'uninstall', ...installOptions, pluginName], installPath, client);
    await this.ensureCustomPluginDirExists();

    return true;
  }

  /**
   * Updates the requested plugin with NPM
   * @param pluginName
   * @param client
   */
  async updatePlugin(pluginName: string, client) {
    if (pluginName === this.configService.name && this.configService.dockerOfflineUpdate) {
      await this.updateSelfOffline(client);
      return true;
    }

    // show a warning if updating homebridge-config-ui-x on Raspberry Pi 1 / Zero
    if (pluginName === this.configService.name && os.cpus().length === 1 && os.arch() === 'arm') {
      client.emit('stdout', color.yellow(`***************************************************************\r\n`));
      client.emit('stdout', color.yellow(`Please be patient while ${this.configService.name} updates.\r\n`));
      client.emit('stdout', color.yellow(`This process may take 5-15 minutes to complete on your device.\r\n`));
      client.emit('stdout', color.yellow(`***************************************************************\r\n\r\n`));
    }

    await this.getInstalledPlugins();
    // find the plugin
    const plugin = this.installedPlugins.find(x => x.name === pluginName);
    if (!plugin) {
      throw new Error(`Plugin "${pluginName}" Not Found`);
    }

    // get the currently installed
    let installPath = plugin.installPath;

    // prepare flags for npm command
    const installOptions: Array<string> = [];

    // check to see if custom plugin path is using a package.json file
    if (installPath === this.configService.customPluginPath && await fs.pathExists(path.resolve(installPath, '../package.json'))) {
      installOptions.push('--save');
    }

    installPath = path.resolve(installPath, '../');

    await this.runNpmCommand([...this.npm, 'install', ...installOptions, `${pluginName}@latest`], installPath, client);

    return true;
  }

  /**
   * Gets the Homebridge package details
   */
  public async getHomebridgePackage() {
    // try load from the "homebridgePackagePath" option first
    if (this.configService.ui.homebridgePackagePath) {
      const pjsonPath = path.join(this.configService.ui.homebridgePackagePath, 'package.json');
      if (await fs.pathExists(pjsonPath)) {
        return await this.parsePackageJson(await fs.readJson(pjsonPath), this.configService.ui.homebridgePackagePath);
      } else {
        this.logger.error(`"homebridgePath" (${this.configService.ui.homebridgePackagePath}) does not exist`);
      }
    }

    const modules = await this.getInstalledModules();

    const homebridgeInstalls = modules.filter(x => x.name === 'homebridge');

    if (homebridgeInstalls.length > 1) {
      this.logger.warn('Multiple Instances Of Homebridge Found Installed');
      homebridgeInstalls.forEach((instance) => {
        this.logger.warn(instance.installPath);
      });
    }

    if (!homebridgeInstalls.length) {
      this.configService.hbServiceUiRestartRequired = true;
      this.logger.error('Unable To Find Homebridge Installation');
      throw new Error('Unable To Find Homebridge Installation');
    }

    const homebridgeModule = homebridgeInstalls[0];
    const pjson: IPackageJson = await fs.readJson(path.join(homebridgeModule.installPath, 'package.json'));
    const homebridge = await this.parsePackageJson(pjson, homebridgeModule.path);

    return homebridge;
  }

  /**
   * Updates the Homebridge package
   */
  public async updateHomebridgePackage(client) {
    const homebridge = await this.getHomebridgePackage();

    // get the currently installed
    let installPath = homebridge.installPath;

    // prepare flags for npm command
    const installOptions: Array<string> = [];

    // check to see if custom plugin path is using a package.json file
    if (installPath === this.configService.customPluginPath && await fs.pathExists(path.resolve(installPath, '../package.json'))) {
      installOptions.push('--save');
    }

    installPath = path.resolve(installPath, '../');

    await this.runNpmCommand([...this.npm, 'install', ...installOptions, `${homebridge.name}@latest`], installPath, client);

    return true;
  }

  /**
   * Gets the npm module details
   */
  public async getNpmPackage() {
    if (this.npmPackage) {
      return this.npmPackage;
    } else {
      const modules = await this.getInstalledModules();

      const npmPkg = modules.find(x => x.name === 'npm');

      if (!npmPkg) {
        throw new Error('Could not find npm package');
      }

      const pjson: IPackageJson = await fs.readJson(path.join(npmPkg.installPath, 'package.json'));
      const npm = await this.parsePackageJson(pjson, npmPkg.path) as HomebridgePlugin & { showUpdateWarning?: boolean };

      // show the update warning if the installed version is below the minimum recommended
      npm.showUpdateWarning = semver.lt(npm.installedVersion, '6.4.1');

      this.npmPackage = npm;
      return npm;
    }
  }

  /**
   * Sets a flag telling the system to update the package next time the UI is restarted
   * Dependend on OS support - currently only supported by the oznu/homebridge docker image
   */
  public async updateSelfOffline(client) {
    client.emit('stdout', color.yellow(`${this.configService.name} has been scheduled to update on the next container restart.\n\r\n\r`));
    await new Promise(resolve => setTimeout(resolve, 800));

    client.emit('stdout', color.yellow(`The Docker container will now try and restart.\n\r\n\r`));
    await new Promise(resolve => setTimeout(resolve, 800));

    client.emit('stdout', color.yellow(`If you have not started the Docker container with `) +
      color.red('--restart=always') + color.yellow(` you may\n\rneed to manually start the container again.\n\r\n\r`));
    await new Promise(resolve => setTimeout(resolve, 800));

    client.emit('stdout', color.yellow(`This process may take several minutes. Please be patient.\n\r`));
    await new Promise(resolve => setTimeout(resolve, 10000));

    await fs.createFile('/homebridge/.uix-upgrade-on-restart');
  }

  /**
   * Returns the config.schema.json for the plugin
   * @param pluginName
   */
  public async getPluginConfigSchema(pluginName: string) {
    if (!this.installedPlugins) await this.getInstalledPlugins();
    const plugin = this.installedPlugins.find(x => x.name === pluginName);
    if (!plugin) {
      throw new NotFoundException();
    }

    if (!plugin.settingsSchema) {
      throw new NotFoundException();
    }

    const schemaPath = path.resolve(plugin.installPath, pluginName, 'config.schema.json');

    if (this.miscSchemas[pluginName] && !await fs.pathExists(schemaPath)) {
      return await fs.readJson(this.miscSchemas[pluginName]);
    }

    let configSchema = await fs.readJson(schemaPath);

    // check to see if this plugin implements dynamic schemas
    if (configSchema.dynamicSchemaVersion) {
      const dynamicSchemaPath = path.resolve(this.configService.storagePath, `.${pluginName}-v${configSchema.dynamicSchemaVersion}.schema.json`);
      this.logger.log(`[${pluginName}] dynamic schema path: ${dynamicSchemaPath}`);
      if (fs.existsSync(dynamicSchemaPath)) {
        try {
          configSchema = await fs.readJson(dynamicSchemaPath);
          this.logger.log(`[${pluginName}] dynamic schema loaded from: ${dynamicSchemaPath}`);
        } catch (e) {
          this.logger.error(`[${pluginName}] Failed to load dynamic schema at ${dynamicSchemaPath}: ${e.message}`);
        }
      }
    }

    // modify this plugins schema to set the default port number
    if (pluginName === this.configService.name) {
      configSchema.schema.properties.port.default = this.configService.ui.port;

      // filter some options from the UI config when using service mode
      if (this.configService.serviceMode) {
        configSchema.layout = configSchema.layout.filter(x => {
          if (x.ref === 'log') {
            return false;
          }
          return true;
        });

        const advanced = configSchema.layout.find(x => x.ref === 'advanced');
        advanced.items = advanced.items.filter(x => {
          if (x === 'sudo' || x.key === 'restart') {
            return false;
          }
          return true;
        });
      }
    }

    // modify homebridge-alexa to set the default pin
    if (pluginName === 'homebridge-alexa') {
      configSchema.schema.properties.pin.default = this.configService.homebridgeConfig.bridge.pin;
    }

    // add the display name from the config.json
    if (plugin.displayName) {
      configSchema.displayName = plugin.displayName;
    }

    return configSchema;
  }

  /**
   * Returns the changelog from the npm package for a plugin
   * @param pluginName
   */
  public async getPluginChangeLog(pluginName: string) {
    await this.getInstalledPlugins();
    const plugin = this.installedPlugins.find(x => x.name === pluginName);
    if (!plugin) {
      throw new NotFoundException();
    }

    const changeLog = path.resolve(plugin.installPath, plugin.name, 'CHANGELOG.md');

    if (await fs.pathExists(changeLog)) {
      return {
        changelog: await fs.readFile(changeLog, 'utf8'),
      };
    } else {
      throw new NotFoundException();
    }
  }

  /**
   * Get the latest release notes from GitHub for a plugin
   * @param pluginName
   */
  public async getPluginRelease(pluginName: string) {
    if (!this.installedPlugins) await this.getInstalledPlugins();
    const plugin = pluginName === 'homebridge' ? await this.getHomebridgePackage() : this.installedPlugins.find(x => x.name === pluginName);
    if (!plugin) {
      throw new NotFoundException();
    }

    // plugin must have a homepage to workout Git Repo
    if (!plugin.links.homepage) {
      throw new NotFoundException();
    }

    // make sure the repo is GitHub
    if (!plugin.links.homepage.match(/https:\/\/github.com/)) {
      throw new NotFoundException();
    }

    try {
      const repo = plugin.links.homepage.split('https://github.com/')[1].split('#readme')[0];
      const release = (await this.http.get(`https://api.github.com/repos/${repo}/releases/latest`)).data;
      return {
        name: release.name,
        changelog: release.body,
      };
    } catch (e) {
      throw new NotFoundException();
    }
  }

  /**
   * Load any @scoped homebridge modules
   */
  private async getInstalledScopedModules(requiredPath, scope): Promise<Array<{ name: string, path: string, installPath: string }>> {
    try {
      if ((await fs.stat(path.join(requiredPath, scope))).isDirectory()) {
        const scopedModules = await fs.readdir(path.join(requiredPath, scope));
        return scopedModules
          .filter((x) => x.startsWith('homebridge-'))
          .map((x) => {
            return {
              name: path.join(scope, x).split(path.sep).join('/'),
              installPath: path.join(requiredPath, scope, x),
              path: requiredPath,
            };
          });
      } else {
        return [];
      }
    } catch (e) {
      this.logger.debug(e);
      return [];
    }
  }

  /**
   * Returns a list of modules installed
   */
  private async getInstalledModules(): Promise<Array<{ name: string, path: string, installPath: string }>> {
    const allModules = [];
    // loop over each possible path to find installed plugins
    for (const requiredPath of this.paths) {
      const modules: string[] = await fs.readdir(requiredPath);
      for (const module of modules) {
        try {
          if (module.charAt(0) === '@') {
            allModules.push(...await this.getInstalledScopedModules(requiredPath, module));
          } else {
            allModules.push({
              name: module,
              installPath: path.join(requiredPath, module),
              path: requiredPath,
            });
          }
        } catch (e) {
          this.logger.log(`Failed to parse item "${module}" in ${requiredPath}: ${e.message}`);
        }
      }
    }
    return allModules;
  }

  /**
   * Return a boolean if the plugin is an @scoped/homebridge plugin
   */
  private isScopedPlugin(name: string): boolean {
    return (name.charAt(0) === '@' && name.split('/').length > 0 && name.split('/')[1].indexOf('homebridge-') === 0);
  }

  /**
   * Helper function to work out where npm is
   */
  private getNpmPath() {
    if (os.platform() === 'win32') {
      // if running on windows find the full path to npm
      const windowsNpmPath = [
        path.join(process.env.APPDATA, 'npm/npm.cmd'),
        path.join(process.env.ProgramFiles, 'nodejs/npm.cmd'),
      ]
        .filter(fs.existsSync);

      if (windowsNpmPath.length) {
        return [windowsNpmPath[0], '-g'];
      } else {
        this.logger.error(`ERROR: Cannot find npm binary. You will not be able to manage plugins or update homebridge.`);
        this.logger.error(`ERROR: You might be able to fix this problem by running: npm install -g npm`);
      }

    }
    // Linux and macOS don't require the full path to npm
    return ['npm'];
  }

  /**
   * Get the paths used by Homebridge to load plugins
   * this is the same code used by homebridge to find plugins
   * https://github.com/nfarina/homebridge/blob/c73a2885d62531925ea439b9ad6d149a285f6daa/lib/plugin.js#L105-L134
   */
  private getBasePaths() {
    let paths = [];

    // add the paths used by require()
    // we need to use 'eval' on require to bypass webpack
    // tslint:disable-next-line: no-eval
    paths = paths.concat(eval('require').main.paths);

    if (this.configService.customPluginPath) {
      paths.unshift(this.configService.customPluginPath);
    }

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
        paths.push(child_process.execSync('/bin/echo -n "$(npm --no-update-notifier -g prefix)/lib/node_modules"').toString('utf8'));
      }
    }

    // don't look at homebridge-config-ui-x's own modules
    paths = paths.filter(x => x !== path.join(process.env.UIX_BASE_PATH, 'node_modules'));

    // filter out duplicates and non-existent paths
    return _.uniq(paths).filter((requiredPath) => {
      return fs.existsSync(requiredPath);
    });
  }

  /**
   * Convert the package.json into a HomebridgePlugin
   * @param pjson
   * @param installPath
   */
  private async parsePackageJson(pjson: IPackageJson, installPath: string): Promise<HomebridgePlugin> {
    const plugin: HomebridgePlugin = {
      name: pjson.name,
      displayName: pjson.displayName,
      description: (pjson.description) ?
        pjson.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim() : pjson.name,
      verifiedPlugin: this.verifiedPlugins.includes(pjson.name),
      installedVersion: installPath ? (pjson.version || '0.0.1') : null,
      globalInstall: (installPath !== this.configService.customPluginPath),
      settingsSchema: await fs.pathExists(path.resolve(installPath, pjson.name, 'config.schema.json')) || this.miscSchemas[pjson.name],
      installPath,
    };

    // if the plugin is private, do not attempt to query npm
    if (pjson.private) {
      plugin.publicPackage = false;
      plugin.latestVersion = null;
      plugin.updateAvailable = false;
      plugin.links = {};
      return plugin;
    }

    return this.getPluginFromNpm(plugin);
  }

  /**
   * Accepts a HomebridgePlugin and adds data from npm
   * @param plugin
   */
  private async getPluginFromNpm(plugin: HomebridgePlugin): Promise<HomebridgePlugin> {
    try {
      if (plugin.name.includes('@')) {
        // scoped plugins do not allow us to access the "latest" tag directly

        // attempt to load from cache
        const fromCache = this.npmPluginCache.get(plugin.name);

        // restore from cache, or load from npm
        const pkg: INpmRegistryModule = fromCache || (await this.http.get(`https://registry.npmjs.org/${plugin.name.replace('%40', '@')}`)).data;

        // store in cache if it was not there already
        if (!fromCache) {
          this.npmPluginCache.set(plugin.name, pkg);
        }

        plugin.publicPackage = true;
        plugin.latestVersion = pkg['dist-tags'] ? pkg['dist-tags'].latest : plugin.installedVersion;
        plugin.updateAvailable = semver.lt(plugin.installedVersion, plugin.latestVersion);
        plugin.links = {
          npm: `https://www.npmjs.com/package/${plugin.name}`,
          homepage: pkg.homepage,
        };
        plugin.author = (pkg.maintainers.length) ? pkg.maintainers[0].name : null;
        plugin.engines = plugin.latestVersion ? pkg.versions[plugin.latestVersion].engines : {};
      } else {
        // access the "latest" tag directly to speed up the request time

        // attempt to load from cache
        const fromCache = this.npmPluginCache.get(plugin.name);

        // restore from cache, or load from npm
        const pkg: IPackageJson = fromCache || (await this.http.get(`https://registry.npmjs.org/${encodeURIComponent(plugin.name).replace('%40', '@')}/latest`)).data;

        // store in cache if it was not there already
        if (!fromCache) {
          this.npmPluginCache.set(plugin.name, pkg);
        }

        plugin.publicPackage = true;
        plugin.latestVersion = pkg.version;
        plugin.updateAvailable = semver.lt(plugin.installedVersion, plugin.latestVersion);
        plugin.links = {
          npm: `https://www.npmjs.com/package/${plugin.name}`,
          homepage: pkg.homepage,
        };
        plugin.author = (pkg.maintainers.length) ? pkg.maintainers[0].name : null;
        plugin.engines = pkg.engines;
      }
    } catch (e) {
      if (e.statusCode !== 404) {
        this.logger.log(`[${plugin.name}] Failed to check registry.npmjs.org for updates: ${e.message}`);
      }
      plugin.publicPackage = false;
      plugin.latestVersion = null;
      plugin.updateAvailable = false;
      plugin.links = {};
    }
    return plugin;
  }

  /**
   * Executes an NPM command
   * @param command
   * @param cwd
   * @param client
   */
  private async runNpmCommand(command: Array<string>, cwd: string, client) {
    let timeoutTimer;
    command = command.filter(x => x.length);

    // sudo mode is requested in plugin config
    if (this.configService.ui.sudo) {
      command.unshift('sudo', '-E', '-n');
    } else {
      // do a pre-check to test for write access when not using sudo mode
      try {
        await fs.access(path.resolve(cwd, 'node_modules'), fs.constants.W_OK);
      } catch (e) {
        client.emit('stdout', color.yellow(`The user "${os.userInfo().username}" does not have write access to the target directory:\n\r\n\r`));
        client.emit('stdout', `${path.resolve(cwd, 'node_modules')}\n\r\n\r`);
        client.emit('stdout', color.yellow(`This may cause the operation to fail.\n\r`));
        client.emit('stdout', color.yellow(`See the docs for details on how to enable sudo mode:\n\r`));
        client.emit('stdout', color.yellow(`https://github.com/oznu/homebridge-config-ui-x#sudo-mode\n\r\n\r`));
      }
    }

    this.logger.log(`Running Command: ${command.join(' ')}`);

    if (!semver.satisfies(process.version, `>=${this.configService.minimumNodeVersion}`)) {
      client.emit('stdout', color.yellow(`Node.js v${this.configService.minimumNodeVersion} higher is required for ${this.configService.name}.\n\r`));
      client.emit('stdout', color.yellow(`You may experience issues while running on Node.js ${process.version}.\n\r\n\r`));
    }

    client.emit('stdout', color.cyan(`USER: ${os.userInfo().username}\n\r`));
    client.emit('stdout', color.cyan(`DIR: ${cwd}\n\r`));
    client.emit('stdout', color.cyan(`CMD: ${command.join(' ')}\n\r\n\r`));

    // setup the environment for the call
    const env = {};
    Object.assign(env, process.env);
    Object.assign(env, {
      npm_config_global_style: 'true',
      npm_config_unsafe_perm: 'true',
      npm_config_update_notifier: 'false',
      npm_config_prefer_online: 'true',
    });

    // on windows we want to ensure the global prefix is the same as the install path
    if (os.platform() === 'win32') {
      Object.assign(env, {
        npm_config_prefix: cwd,
      });
    }

    await new Promise((resolve, reject) => {
      const term = pty.spawn(command.shift(), command, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd,
        env,
      });

      // send stdout data from the process to all clients
      term.on('data', (data) => {
        client.emit('stdout', data);
      });

      // send an error message to the client if the command does not exit with code 0
      term.on('exit', (code) => {
        if (code === 0) {
          clearTimeout(timeoutTimer);
          client.emit('stdout', color.green(`\n\rCommand succeeded!.\n\r`));
          resolve();
        } else {
          clearTimeout(timeoutTimer);
          reject('Command failed. Please review log for details.');
        }
      });

      // if the command spends to long trying to execute kill it after 5 minutes
      timeoutTimer = setTimeout(() => {
        term.kill('SIGTERM');
      }, 300000);
    });
  }

  /**
   * When npm removes the last plugin in a custom node_modules location it may delete this location
   * which will cause errors. This function ensures the plugin directory is recreated if it was removed.
   */
  private async ensureCustomPluginDirExists() {
    if (!this.configService.customPluginPath) {
      return;
    }

    if (!await fs.pathExists(this.configService.customPluginPath)) {
      this.logger.warn(`Custom plugin directory was removed. Re-creating: ${this.configService.customPluginPath}`);
      try {
        await fs.ensureDir(this.configService.customPluginPath);
      } catch (e) {
        this.logger.error(`Failed to recreate custom plugin directory`);
        this.logger.error(e.message);
      }
    }
  }

  /**
   * Loads the list of verified plugins from github
   */
  private async loadVerifiedPluginsList() {
    try {
      this.verifiedPlugins = (await this.http.get('https://raw.githubusercontent.com/homebridge/verified/master/verified-plugins.json')).data;
    } catch (e) {
      // try again in 60 seconds
      setTimeout(() => {
        this.loadVerifiedPluginsList();
      }, 60000);
    }
  }

}
