import { EventEmitter } from 'events';
import { Injectable, NotFoundException, InternalServerErrorException, HttpService, BadRequestException } from '@nestjs/common';
import { HomebridgePlugin, IPackageJson, INpmSearchResults, INpmRegistryModule } from './types';
import { HomebridgePluginVersions, HomebridgePluginUiMetadata, PluginAlias } from './types';
import axios from 'axios';
import * as os from 'os';
import * as _ from 'lodash';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as child_process from 'child_process';
import * as semver from 'semver';
import * as color from 'bash-color';
import * as NodeCache from 'node-cache';

import { Logger } from '../../core/logger/logger.service';
import { ConfigService, HomebridgeConfig } from '../../core/config/config.service';
import { NodePtyService } from '../../core/node-pty/node-pty.service';

@Injectable()
export class PluginsService {
  private static readonly PLUGIN_IDENTIFIER_PATTERN = /^((@[\w-]*)\/)?(homebridge-[\w-]*)$/;

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
    // 'homebridge-abcd': path.join(process.env.UIX_BASE_PATH, 'misc-schemas', 'abcd'),
  };

  // create a cache for storing plugin package.json from npm
  private npmPluginCache = new NodeCache({ stdTTL: 300 });

  // create a cache for storing plugin alias
  private pluginAliasCache = new NodeCache({ stdTTL: 86400 });

  private verifiedPluginsRetryTimeout: NodeJS.Timeout;

  // these plugins are legacy Homebridge UI plugins / forks of this UI and will cause conflicts
  // or have post install scripts that alter the users system without user interaction
  private searchResultBlacklist = [
    'homebridge-config-ui',
    'homebridge-config-ui-rdp',
    'homebridge-rocket-smart-home-ui',
    'homebridge-ui',
    'homebridge-to-hoobs',
    'homebridge-server',
  ];

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    private nodePtyService: NodePtyService,
    private logger: Logger,
  ) {

    /**
     * The "timeout" option on axios is the response timeout
     * If the user has no internet, the dns lookup may take a long time to timeout
     * As the dns lookup timeout is not configurable in Node.js, this interceptor
     * will cancel the request after 15 seconds.
     */
    this.httpService.axiosRef.interceptors.request.use((config) => {
      const source = axios.CancelToken.source();
      config.cancelToken = source.token;

      setTimeout(() => {
        source.cancel('Timeout: request took more than 15 seconds');
      }, 15000);

      return config;
    });

    // initial verified plugins load
    this.loadVerifiedPluginsList();

    // update the verified plugins list every 12 hours
    setInterval(this.loadVerifiedPluginsList.bind(this), 60000 * 60 * 12);
  }

  /**
   * Return an array of plugins currently installed
   */
  public async getInstalledPlugins(): Promise<HomebridgePlugin[]> {
    const plugins: HomebridgePlugin[] = [];
    const modules = await this.getInstalledModules();
    const disabledPlugins = await this.getDisabledPlugins();

    // filter out non-homebridge plugins by name
    const homebridgePlugins = modules
      .filter(module => (module.name.indexOf('homebridge-') === 0) || this.isScopedPlugin(module.name))
      .filter(module => fs.pathExistsSync(path.join(module.installPath, 'package.json')));

    await Promise.all(homebridgePlugins.map(async (pkg) => {
      try {
        const pjson: IPackageJson = await fs.readJson(path.join(pkg.installPath, 'package.json'));
        // check each plugin has the 'homebridge-plugin' keyword
        if (pjson.keywords && pjson.keywords.includes('homebridge-plugin')) {
          // parse the package.json for each plugin
          const plugin = await this.parsePackageJson(pjson, pkg.path);

          // check if the plugin has been disabled
          plugin.disabled = disabledPlugins.includes(plugin.name);

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
   * Lookup a single plugin in the npm registry
   * @param pluginName
   */
  public async lookupPlugin(pluginName: string): Promise<HomebridgePlugin> {
    if (!PluginsService.PLUGIN_IDENTIFIER_PATTERN.test(pluginName)) {
      throw new BadRequestException('Invalid plugin name.');
    }

    const lookup = await this.searchNpmRegistrySingle(pluginName);

    if (!lookup.length) {
      throw new NotFoundException();
    }

    return lookup[0];
  }

  public async getAvailablePluginVersions(pluginName: string): Promise<HomebridgePluginVersions> {
    if (!PluginsService.PLUGIN_IDENTIFIER_PATTERN.test(pluginName) && pluginName !== 'homebridge') {
      throw new BadRequestException('Invalid plugin name.');
    }

    try {
      const fromCache = this.npmPluginCache.get(`lookup-${pluginName}`);

      const pkg: INpmRegistryModule = fromCache || (await (
        this.httpService.get(`https://registry.npmjs.org/${encodeURIComponent(pluginName).replace('%40', '@')}`, {
          headers: {
            'accept': 'application/vnd.npm.install-v1+json', // only return minimal information
          },
        }).toPromise()
      )).data;

      if (!fromCache) {
        this.npmPluginCache.set(`lookup-${pluginName}`, pkg, 60);
      }

      return {
        tags: pkg['dist-tags'],
        versions: Object.keys(pkg.versions),
      };

    } catch (e) {
      throw new NotFoundException();
    }
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
    let searchResults: INpmSearchResults;

    try {
      searchResults = (await this.httpService.get(`https://registry.npmjs.org/-/v1/search?text=${q}`).toPromise()).data;
    } catch (e) {
      this.logger.error(`Failed to search the npm registry - "${e.message}" - see https://git.io/JJSz6 for help.`);
      throw new InternalServerErrorException(`Failed to search the npm registry - "${e.message}" - see logs.`);
    }

    const result: HomebridgePlugin[] = searchResults.objects
      .filter(x => x.package.name.indexOf('homebridge-') === 0 || this.isScopedPlugin(x.package.name))
      .filter(x => !this.searchResultBlacklist.includes(x.package.name))
      .map((pkg) => {
        let plugin: HomebridgePlugin = {
          name: pkg.package.name,
          private: false,
        };

        // see if the plugin is already installed
        const isInstalled = this.installedPlugins.find(x => x.name === plugin.name);
        if (isInstalled) {
          plugin = isInstalled;
          plugin.lastUpdated = pkg.package.date;
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

    if (
      !result.length
      && (query.indexOf('homebridge-') === 0 || this.isScopedPlugin(query))
      && !this.searchResultBlacklist.includes(query.toLowerCase())
    ) {
      return await this.searchNpmRegistrySingle(query.toLowerCase());
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
      const fromCache = this.npmPluginCache.get(`lookup-${query}`);

      const pkg: INpmRegistryModule = fromCache || (await (
        this.httpService.get(`https://registry.npmjs.org/${encodeURIComponent(query).replace('%40', '@')}`).toPromise()
      )).data;

      if (!fromCache) {
        this.npmPluginCache.set(`lookup-${query}`, pkg, 60);
      }

      if (!pkg.keywords || !pkg.keywords.includes('homebridge-plugin')) {
        return [];
      }

      let plugin: HomebridgePlugin;

      // see if the plugin is already installed
      if (!this.installedPlugins) await this.getInstalledPlugins();
      const isInstalled = this.installedPlugins.find(x => x.name === pkg.name);
      if (isInstalled) {
        plugin = isInstalled;
        plugin.lastUpdated = pkg.time.modified;
        return [plugin];
      }

      plugin = {
        name: pkg.name,
        private: false,
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
      if (e.response?.status !== 404) {
        this.logger.error(`Failed to search the npm registry - "${e.message}" - see https://git.io/JJSz6 for help.`);
      }
      return [];
    }
  }

  /**
   * Installs the requested plugin with NPM
   * @param pluginName
   * @param client
   */
  async installPlugin(pluginName: string, version: string, client: EventEmitter) {
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

    // set global flag
    if (!this.configService.customPluginPath || os.platform() === 'win32') {
      installOptions.push('-g');
    }

    await this.runNpmCommand([...this.npm, 'install', ...installOptions, `${pluginName}@${version}`], installPath, client);

    return true;
  }

  /**
   * Removes the requested plugin with NPM
   * @param pluginName
   * @param client
   */
  async uninstallPlugin(pluginName: string, client: EventEmitter) {
    if (pluginName === this.configService.name) {
      throw new Error(`Cannot uninstall ${pluginName} from ${this.configService.name}.`);
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

    // set global flag
    if (plugin.globalInstall || os.platform() === 'win32') {
      installOptions.push('-g');
    }

    await this.runNpmCommand([...this.npm, 'uninstall', ...installOptions, pluginName], installPath, client);
    await this.ensureCustomPluginDirExists();

    return true;
  }

  /**
   * Updates the requested plugin with NPM
   * @param pluginName
   * @param client
   */
  async updatePlugin(pluginName: string, version: string, client: EventEmitter) {
    if (pluginName === this.configService.name && this.configService.dockerOfflineUpdate && version === 'latest') {
      await this.updateSelfOffline(client);
      return true;
    }

    // show a warning if updating homebridge-config-ui-x on Raspberry Pi 1 / Zero
    if (pluginName === this.configService.name && os.cpus().length === 1 && os.arch() === 'arm') {
      client.emit('stdout', color.yellow('***************************************************************\r\n'));
      client.emit('stdout', color.yellow(`Please be patient while ${this.configService.name} updates.\r\n`));
      client.emit('stdout', color.yellow('This process may take 5-15 minutes to complete on your device.\r\n'));
      client.emit('stdout', color.yellow('***************************************************************\r\n\r\n'));
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

    // set global flag
    if (plugin.globalInstall || os.platform() === 'win32') {
      installOptions.push('-g');
    }

    try {
      await this.runNpmCommand([...this.npm, 'install', ...installOptions, `${pluginName}@${version}`], installPath, client);
      return true;
    } catch (e) {
      if (pluginName === this.configService.name) {
        client.emit('stdout', color.yellow('\r\nCleaning up npm cache, please wait...\r\n'));
        await this.cleanNpmCache();
        client.emit('stdout', color.yellow(`npm cache cleared, please try updating ${this.configService.name} again.\r\n`));
      }
      throw e;
    }
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
      this.logger.warn('Multiple Instances Of Homebridge Found Installed - see https://git.io/JJSgm for help.');
      homebridgeInstalls.forEach((instance) => {
        this.logger.warn(instance.installPath);
      });
    }

    if (!homebridgeInstalls.length) {
      this.configService.hbServiceUiRestartRequired = true;
      this.logger.error('Unable To Find Homebridge Installation - see https://git.io/JJSgZ for help.');
      throw new Error('Unable To Find Homebridge Installation');
    }

    const homebridgeModule = homebridgeInstalls[0];
    const pjson: IPackageJson = await fs.readJson(path.join(homebridgeModule.installPath, 'package.json'));
    const homebridge = await this.parsePackageJson(pjson, homebridgeModule.path);

    if (!homebridge.latestVersion) {
      return homebridge;
    }

    // patch for homebridge 1.2.x to allow updates to newer versions of 1.2.x without 1.2.x being set to "latest"
    const homebridgeVersion = semver.parse(homebridge.installedVersion);

    if (
      homebridgeVersion.major === 1 &&
      homebridgeVersion.minor === 2 &&
      semver.gt(homebridge.installedVersion, homebridge.latestVersion, { includePrerelease: true })
    ) {
      const versions = await this.getAvailablePluginVersions('homebridge');
      if (versions.tags['release-1.2.x'] && semver.gt(versions.tags['release-1.2.x'], homebridge.installedVersion)) {
        homebridge.updateAvailable = true;
        homebridge.latestVersion = versions.tags['release-1.2.x'];
      }
    }
    // end patch

    this.configService.homebridgeVersion = homebridge.installedVersion;

    return homebridge;
  }

  /**
   * Updates the Homebridge package
   */
  public async updateHomebridgePackage(version: string, client: EventEmitter) {
    const homebridge = await this.getHomebridgePackage();

    if (version === 'latest' && homebridge.latestVersion) {
      version = homebridge.latestVersion;
    }

    // get the currently installed
    let installPath = homebridge.installPath;

    // prepare flags for npm command
    const installOptions: Array<string> = [];

    // check to see if custom plugin path is using a package.json file
    if (installPath === this.configService.customPluginPath && await fs.pathExists(path.resolve(installPath, '../package.json'))) {
      installOptions.push('--save');
    }

    installPath = path.resolve(installPath, '../');

    // set global flag
    if (homebridge.globalInstall || os.platform() === 'win32') {
      installOptions.push('-g');
    }

    await this.runNpmCommand([...this.npm, 'install', ...installOptions, `${homebridge.name}@${version}`], installPath, client);

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
  public async updateSelfOffline(client: EventEmitter) {
    client.emit('stdout', color.yellow(`${this.configService.name} has been scheduled to update on the next container restart.\n\r\n\r`));
    await new Promise(resolve => setTimeout(resolve, 800));

    client.emit('stdout', color.yellow('The Docker container will now try and restart.\n\r\n\r'));
    await new Promise(resolve => setTimeout(resolve, 800));

    client.emit('stdout', color.yellow('If you have not started the Docker container with ') +
      color.red('--restart=always') + color.yellow(' you may\n\rneed to manually start the container again.\n\r\n\r'));
    await new Promise(resolve => setTimeout(resolve, 800));

    client.emit('stdout', color.yellow('This process may take several minutes. Please be patient.\n\r'));
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

    // inject schema for _bridge setting (this is hidden, but prevents it getting removed)
    if (configSchema.schema && configSchema.schema.properties) {
      configSchema.schema.properties._bridge = {
        type: 'object',
        notitle: true,
        condition: {
          functionBody: 'return false',
        },
        properties: {
          name: {
            type: 'string',
          },
          username: {
            type: 'string',
          },
          pin: {
            type: 'string',
          },
          port: {
            type: 'integer',
            maximum: 65535,
          },
          setupID: {
            type: 'string',
          },
          manufacturer: {
            type: 'string',
          },
          model: {
            type: 'string',
          },
        },
      };
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
      const release = (await this.httpService.get(`https://api.github.com/repos/${repo}/releases/latest`).toPromise()).data;
      return {
        name: release.name,
        changelog: release.body,
      };
    } catch (e) {
      throw new NotFoundException();
    }
  }

  /**
   * Attempt to extract the alias from a plugin
   */
  public async getPluginAlias(pluginName: string): Promise<PluginAlias> {
    if (!this.installedPlugins) await this.getInstalledPlugins();
    const plugin = this.installedPlugins.find(x => x.name === pluginName);

    if (!plugin) {
      throw new NotFoundException();
    }

    const fromCache: PluginAlias | undefined = this.pluginAliasCache.get(pluginName);
    if (fromCache as any) {
      return fromCache;
    }

    const output = {
      pluginAlias: null,
      pluginType: null,
    };

    if (plugin.settingsSchema) {
      const schema = await this.getPluginConfigSchema(pluginName);
      output.pluginAlias = schema.pluginAlias;
      output.pluginType = schema.pluginType;
    } else {
      try {
        await new Promise((resolve, reject) => {
          const child = child_process.fork(path.resolve(process.env.UIX_BASE_PATH, 'extract-plugin-alias.js'), {
            env: {
              UIX_EXTRACT_PLUGIN_PATH: path.resolve(plugin.installPath, plugin.name),
            },
            stdio: 'ignore',
          });

          child.once('message', (data: any) => {
            if (data.pluginAlias && data.pluginType) {
              output.pluginAlias = data.pluginAlias;
              output.pluginType = data.pluginType;
              resolve(null);
            } else {
              reject('Invalid Response');
            }
          });

          child.once('close', (code) => {
            if (code !== 0) {
              reject();
            }
          });
        });
      } catch (e) {
        this.logger.debug('Failed to extract plugin alias:', e);
      }
    }

    this.pluginAliasCache.set(pluginName, output);
    return output;
  }

  /**
   * Returns the custom ui path for a plugin
   */
  public async getPluginUiMetadata(pluginName: string): Promise<HomebridgePluginUiMetadata> {
    if (!this.installedPlugins) await this.getInstalledPlugins();
    const plugin = this.installedPlugins.find(x => x.name === pluginName);
    const fullPath = path.resolve(plugin.installPath, plugin.name);

    const schema = await fs.readJson(path.resolve(fullPath, 'config.schema.json'));
    const customUiPath = path.resolve(fullPath, schema.customUiPath || 'homebridge-ui');

    if (!customUiPath.startsWith(fullPath)) {
      throw new Error('Custom UI path is outside the plugin root.');
    }

    const publicPath = path.resolve(customUiPath, 'public');
    const serverPath = path.resolve(customUiPath, 'server.js');
    const devServer = plugin.private ? schema.customUiDevServer : null;

    if (await fs.pathExists(path.resolve(publicPath, 'index.html')) || devServer) {
      return {
        devServer,
        serverPath,
        publicPath,
        plugin,
      };
    }

    throw new Error('Plugin does not provide a custom UI');
  }

  /**
   * Return an array of disabled plugins
   */
  private async getDisabledPlugins(): Promise<string[]> {
    try {
      const config: HomebridgeConfig = await fs.readJson(this.configService.configPath);
      if (Array.isArray(config.disabledPlugins)) {
        return config.disabledPlugins;
      } else {
        return [];
      }
    } catch (e) {
      return [];
    }
  }

  /**
   * Load any @scoped homebridge modules
   */
  private async getInstalledScopedModules(requiredPath, scope): Promise<Array<{ name: string; path: string; installPath: string }>> {
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
      this.logger.log(e);
      return [];
    }
  }

  /**
   * Returns a list of modules installed
   */
  private async getInstalledModules(): Promise<Array<{ name: string; path: string; installPath: string }>> {
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
        path.join(process.env.NVM_SYMLINK || process.env.ProgramFiles + '/nodejs', 'npm.cmd'),
      ].filter(fs.existsSync);

      if (windowsNpmPath.length) {
        return [windowsNpmPath[0]];
      } else {
        this.logger.error('ERROR: Cannot find npm binary. You will not be able to manage plugins or update homebridge.');
        this.logger.error('ERROR: You might be able to fix this problem by running: npm install -g npm');
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
      private: pjson.private || false,
      displayName: pjson.displayName,
      description: (pjson.description) ?
        pjson.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim() : pjson.name,
      verifiedPlugin: this.verifiedPlugins.includes(pjson.name),
      installedVersion: installPath ? (pjson.version || '0.0.1') : null,
      globalInstall: (installPath !== this.configService.customPluginPath),
      settingsSchema: await fs.pathExists(path.resolve(installPath, pjson.name, 'config.schema.json')) || this.miscSchemas[pjson.name],
      installPath,
    };

    // only verified plugins can show donation links
    plugin.funding = plugin.verifiedPlugin ? pjson.funding : undefined;

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
        // see https://github.com/npm/registry-issue-archive/issues/34

        // attempt to load from cache
        const fromCache = this.npmPluginCache.get(plugin.name);

        // restore from cache, or load from npm
        const pkg: INpmRegistryModule = fromCache || (
          await this.httpService.get(`https://registry.npmjs.org/${plugin.name.replace('%40', '@')}`).toPromise()
        ).data;

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
        const pkg: IPackageJson = fromCache || (
          await this.httpService.get(`https://registry.npmjs.org/${encodeURIComponent(plugin.name).replace('%40', '@')}/latest`).toPromise()
        ).data;

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
      if (e.response?.status !== 404) {
        this.logger.log(`[${plugin.name}] Failed to check registry.npmjs.org for updates: "${e.message}" - see https://git.io/JJSz6 for help.`);
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
  private async runNpmCommand(command: Array<string>, cwd: string, client: EventEmitter) {
    // remove synology @eaDir folders from the node_modules
    await this.removeSynologyMetadata();

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
        client.emit('stdout', color.yellow('This may cause the operation to fail.\n\r'));
        client.emit('stdout', color.yellow('See the docs for details on how to enable sudo mode:\n\r'));
        client.emit('stdout', color.yellow('https://github.com/oznu/homebridge-config-ui-x#sudo-mode\n\r\n\r'));
      }
    }

    this.logger.log(`Running Command: ${command.join(' ')}`);

    if (!semver.satisfies(process.version, `>=${this.configService.minimumNodeVersion}`)) {
      client.emit('stdout', color.yellow(`Node.js v${this.configService.minimumNodeVersion} higher is required for ${this.configService.name}.\n\r`));
      client.emit('stdout', color.yellow(`You may experience issues while running on Node.js ${process.version}.\n\r\n\r`));
    }

    // setup the environment for the call
    const env = {};
    Object.assign(env, process.env);
    Object.assign(env, {
      npm_config_global_style: 'true',
      npm_config_unsafe_perm: 'true',
      npm_config_update_notifier: 'false',
      npm_config_prefer_online: 'true',
    });

    // set global prefix for unix based systems
    if (command.includes('-g') && path.basename(cwd) === 'lib') {
      cwd = path.dirname(cwd);
      Object.assign(env, {
        npm_config_prefix: cwd,
      });
    }

    // on windows we want to ensure the global prefix is the same as the install path
    if (os.platform() === 'win32') {
      Object.assign(env, {
        npm_config_prefix: cwd,
      });
    }

    client.emit('stdout', color.cyan(`USER: ${os.userInfo().username}\n\r`));
    client.emit('stdout', color.cyan(`DIR: ${cwd}\n\r`));
    client.emit('stdout', color.cyan(`CMD: ${command.join(' ')}\n\r\n\r`));

    await new Promise((resolve, reject) => {
      const term = this.nodePtyService.spawn(command.shift(), command, {
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
          client.emit('stdout', color.green('\n\rCommand succeeded!.\n\r'));
          resolve(null);
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
        this.logger.error('Failed to recreate custom plugin directory');
        this.logger.error(e.message);
      }
    }
  }

  /**
   * Remove the Synology @eaDir directories from the plugin folder
   */
  private async removeSynologyMetadata() {
    if (!this.configService.customPluginPath) {
      return;
    }

    const offendingPath = path.resolve(this.configService.customPluginPath, '@eaDir');

    try {
      if (!await fs.pathExists(offendingPath)) {
        await fs.remove(offendingPath);
      }
    } catch (e) {
      this.logger.error(`Failed to remove ${offendingPath}`, e.message);
      return;
    }
  }

  /**
   * Clean the npm cache
   * npm cache clean --force
   */
  private async cleanNpmCache() {
    const command: string[] = [...this.npm, 'cache', 'clean', '--force'];

    if (this.configService.ui.sudo) {
      command.unshift('sudo', '-E', '-n');
    }

    return new Promise((resolve) => {
      const child = child_process.spawn(command.shift(), command);

      child.on('exit', (code) => {
        this.logger.log('npm cache clear command executed with exit code', code);
        resolve(null);
      });

      child.on('error', () => {
        // do nothing
      });
    });
  }

  /**
   * Loads the list of verified plugins from github
   */
  private async loadVerifiedPluginsList() {
    clearTimeout(this.verifiedPluginsRetryTimeout);
    try {
      this.verifiedPlugins = (
        await this.httpService.get('https://raw.githubusercontent.com/homebridge/verified/master/verified-plugins.json', {
          httpsAgent: null,
        }).toPromise()
      ).data;
    } catch (e) {
      this.logger.debug('Error when trying to get verified plugin list:', e.message);
      // try again in 60 seconds
      this.verifiedPluginsRetryTimeout = setTimeout(() => {
        this.loadVerifiedPluginsList();
      }, 60000);
    }
  }

}
