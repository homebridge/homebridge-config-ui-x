/* global NodeJS */

import type { HomebridgeConfig } from '../../core/config/config.interfaces.js'
import type {
  HomebridgePlugin,
  HomebridgePluginUiMetadata,
  HomebridgePluginVersions,
  INpmRegistryModule,
  INpmSearchResults,
  IPackageJson,
  PluginAlias,
  PluginListData,
  PluginListItem,
  PluginListNewScopeItem,
} from './plugins.interfaces.js'

import { execSync, fork, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { constants, existsSync } from 'node:fs'
import { access, readdir, readFile, realpath, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { arch, cpus, platform, userInfo } from 'node:os'
import {
  basename,
  delimiter,
  dirname,
  join,
  resolve,
  sep,
} from 'node:path'
import process from 'node:process'

import { HttpService } from '@nestjs/axios'
import { BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import axios from 'axios'
import { cyan, green, red, yellow } from 'bash-color'
import { createFile, ensureDir, pathExists, pathExistsSync, readJson, remove } from 'fs-extra/esm'
import _ from 'lodash'
import NodeCache from 'node-cache'
import pLimit from 'p-limit'
import { firstValueFrom } from 'rxjs'
import { gt, lt, parse, satisfies } from 'semver'

import { ConfigService } from '../../core/config/config.service.js'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../../core/logger/logger.service.js'
import { NodePtyService } from '../../core/node-pty/node-pty.service.js'
import { ChildBridgesService } from '../child-bridges/child-bridges.service.js'
import { HomebridgeUpdateActionDto, PluginActionDto } from './plugins.dto.js'

const { orderBy, uniq } = _

// Create a require function for ESM compatibility
const require = createRequire(import.meta.url)
const module = require('node:module')

@Injectable()
export class PluginsService {
  private static readonly PLUGIN_IDENTIFIER_PATTERN = /^(@[\w-]+(\.[\w-]+)*\/)?homebridge-[\w-]+$/

  private _npm: Array<string> | undefined
  private _paths: Array<string> | undefined

  /**
   * Lazy getter for npm path - computed only when first accessed
   */
  private get npm(): Array<string> {
    if (!this._npm) {
      this._npm = this.getNpmPath()
    }
    return this._npm
  }

  /**
   * Lazy getter for base paths - computed only when first accessed
   */
  private get paths(): Array<string> {
    if (!this._paths) {
      this._paths = this.getBasePaths()
    }
    return this._paths
  }

  // Constants
  private static readonly UI_RESTART_DELAY_MS = 5000

  // Installed plugin cache
  private installedPlugins: HomebridgePlugin[]

  // NPM package cache
  private npmPackage: HomebridgePlugin

  // Plugin list cache
  private pluginListUrl = 'https://raw.githubusercontent.com/homebridge/plugins/latest/'
  private pluginListFile = `${this.pluginListUrl}assets/plugins-v2.min.json`
  private pluginListRetryTimeout: NodeJS.Timeout

  private hiddenPlugins: string[] = []
  private maintainedPlugins: string[] = []
  private pluginIcons: { [key: string]: string } = {}
  private pluginAuthors: { [key: string]: string } = {}
  private pluginNames: { [key: string]: string } = {}
  private pluginChangelogs: { [key: string]: string } = {}
  private newScopePlugins: { [key: string]: PluginListNewScopeItem } = {}
  private verifiedPlugins: string[] = []
  private verifiedPlusPlugins: string[] = []

  // Create a cache for storing plugin package.json from npm
  private npmPluginCache = new NodeCache({ stdTTL: 300 })

  // Create a cache for storing plugin alias
  private pluginAliasCache = new NodeCache({ stdTTL: 86400 })

  // Cache for installed plugins to avoid redundant file system operations
  private installedPluginsCache = new NodeCache({ stdTTL: 60 })

  /**
   * Define the alias / type some plugins without a schema where the extract method does not work
   */
  private pluginAliasHints = {
    'homebridge-broadlink-rm-pro': {
      pluginAlias: 'BroadlinkRM',
      pluginType: 'platform',
    },
  }

  constructor(
    @Inject(HttpService) private readonly httpService: HttpService,
    @Inject(NodePtyService) private readonly nodePtyService: NodePtyService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(HomebridgeIpcService) private readonly homebridgeIpcService: HomebridgeIpcService,
    @Inject(ChildBridgesService) private readonly childBridgesService: ChildBridgesService,
  ) {
    /**
     * The "timeout" option on axios is the response timeout
     * If the user has no internet, the dns lookup may take a long time to timeout
     * As the dns lookup timeout is not configurable in Node.js, this interceptor
     * will cancel the request after 35 seconds.
     */
    this.httpService.axiosRef.interceptors.request.use((config) => {
      const source = axios.CancelToken.source()
      config.cancelToken = source.token

      setTimeout(() => {
        source.cancel('Timeout: request took more than 35 seconds')
      }, 35000)

      return config
    })

    // Load the verified plugins list on init, then update every 12 hours
    this.loadPluginList().catch((err) => {
      this.logger.error('Failed to load plugin list during initialization:', err)
    })
    setInterval(this.loadPluginList.bind(this), 60000 * 60 * 12)
  }

  /**
   * Assign a display name to a plugin
   * @param plugin
   * @private
   */
  private fixDisplayName(plugin: HomebridgePlugin): HomebridgePlugin {
    plugin.displayName = plugin.displayName || (plugin.name.charAt(0) === '@' ? plugin.name.split('/')[1] : plugin.name)
      .replace(/-/g, ' ')
      .replace(/\w\S*/g, (txt: string) => txt.charAt(0).toUpperCase() + txt.substring(1).toLowerCase())
    return plugin
  }

  /**
   * Return an array of plugins currently installed
   */
  public async getInstalledPlugins(): Promise<HomebridgePlugin[]> {
    // Check cache first
    const cached = this.installedPluginsCache.get<HomebridgePlugin[]>('installed-plugins')
    if (cached) {
      this.installedPlugins = cached
      return cached
    }

    const plugins: HomebridgePlugin[] = []
    const modules = await this.getInstalledModules()
    const disabledPlugins = await this.getDisabledPlugins()

    // Filter out non-homebridge plugins by name
    const homebridgePlugins = modules.filter(module =>
      ((module.name.indexOf('homebridge-') === 0) || this.isScopedPlugin(module.name))
      && pathExistsSync(join(module.installPath, 'package.json')),
    )

    // Limit lookup concurrency to the number of cpu cores
    const limit = pLimit(cpus().length)

    await Promise.all(homebridgePlugins.map(async (pkg) => {
      return limit(async () => {
        try {
          const pkgJson: IPackageJson = await readJson(join(pkg.installPath, 'package.json'))
          // Check each plugin has the 'homebridge-plugin' keyword
          if (pkgJson.keywords && pkgJson.keywords.includes('homebridge-plugin')) {
            // Parse the package.json for each plugin
            const plugin = await this.parsePackageJson(pkgJson, pkg.path)

            // Check if the plugin has been disabled
            plugin.disabled = disabledPlugins.includes(plugin.name)

            // Filter out duplicate plugins and give preference to non-global plugins
            const existingPlugin = plugins.find(x => plugin.name === x.name)
            if (!existingPlugin) {
              plugins.push(plugin)
            } else if (!plugin.globalInstall && existingPlugin.globalInstall === true) {
              const index = plugins.indexOf(existingPlugin)
              plugins[index] = plugin
            }
          }
        } catch (e) {
          this.logger.error(`Failed to parse plugin ${pkg.name} as ${e.message}.`)
        }
      })
    }))

    this.installedPlugins = plugins.map(plugin => this.fixDisplayName(plugin))

    // Cache the result
    this.installedPluginsCache.set('installed-plugins', this.installedPlugins)

    return this.installedPlugins
  }

  /**
   * Returns an array of out-of-date plugins
   */
  public async getOutOfDatePlugins(): Promise<HomebridgePlugin[]> {
    const plugins = await this.getInstalledPlugins()
    return plugins.filter(x => x.updateAvailable)
  }

  /**
   * Look up a single plugin in the npm registry
   * @param pluginName
   */
  public async lookupPlugin(pluginName: string): Promise<HomebridgePlugin> {
    if (!PluginsService.PLUGIN_IDENTIFIER_PATTERN.test(pluginName)) {
      throw new BadRequestException('Invalid plugin name.')
    }

    const lookup = await this.searchNpmRegistrySingle(pluginName)

    if (!lookup.length) {
      throw new NotFoundException()
    }

    return lookup[0]
  }

  public async getAvailablePluginVersions(pluginName: string): Promise<HomebridgePluginVersions> {
    if (!PluginsService.PLUGIN_IDENTIFIER_PATTERN.test(pluginName) && pluginName !== 'homebridge') {
      throw new BadRequestException('Invalid plugin name.')
    }

    try {
      const fromCache = this.npmPluginCache.get(`lookup-${pluginName}`)

      const pkg: INpmRegistryModule = fromCache || (await firstValueFrom((
        this.httpService.get(`https://registry.npmjs.org/${encodeURIComponent(pluginName).replace(/%40/g, '@')}`, {
          headers: {
            accept: 'application/vnd.npm.install-v1+json', // only return minimal information
          },
        })),
      )).data

      if (!fromCache) {
        this.npmPluginCache.set(`lookup-${pluginName}`, pkg, 60)
      }

      return {
        tags: pkg['dist-tags'],
        versions: Object.keys(pkg.versions).reduce((acc, key) => {
          if (!pkg.versions[key].deprecated) {
            acc[key] = {
              version: pkg.versions[key].version,
              engines: pkg.versions[key].engines || null,
            }
          }
          return acc
        }, {}),
      }
    } catch (e) {
      throw new NotFoundException()
    }
  }

  private extractTerms(query: string, separator: RegExp): string[] {
    return query
      .toLowerCase()
      .split(separator)
      .map(term => term.trim())
      .filter(term => term && term !== 'homebridge' && term !== 'plugin')
  }

  private getPluginKeywords(plugin: any): string[] {
    return Array.isArray(plugin.keywords)
      ? plugin.keywords.map(k => k.toLowerCase())
      : []
  }

  private matchesPlugin(plugin: HomebridgePlugin, searchTerms: string[]): 'exactName' | 'exactKeyword' | 'partial' | null {
    const pluginName = plugin.name.toLowerCase()
    const pluginKeywords = this.getPluginKeywords(plugin)
    const pluginDescription = (plugin.description || '').toLowerCase()

    // Separator: '-' character, only get the terms from the plugin name, ignoring any scope
    const nameTerms = this.extractTerms(pluginName.substring(pluginName.lastIndexOf('/') + 1), /-/)

    // Convert arrays to Sets for faster lookup
    const searchTermsSet = new Set(searchTerms)
    const keywordsSet = new Set(pluginKeywords)
    const nameTermsSet = new Set(nameTerms)

    // The search terms contain all the parts of the name
    if (nameTerms.every(term => searchTermsSet.has(term))) {
      return 'exactName'
    }
    // The keywords or name contain all the search terms
    if (searchTerms.every(term => keywordsSet.has(term))
      || searchTerms.every(term => nameTermsSet.has(term))) {
      return 'exactKeyword'
    }
    if (
      searchTerms.some(term => pluginName.includes(term))
      || searchTerms.some(term => pluginKeywords.some(k => k.includes(term)))
      || searchTerms.some(term => pluginDescription.includes(term))
    ) {
      return 'partial'
    }
    return null
  }

  /**
   * Search the npm registry for homebridge plugins
   * @param query
   */
  public async searchNpmRegistry(query: string): Promise<HomebridgePlugin[]> {
    if (!this.installedPlugins) {
      await this.getInstalledPlugins()
    }

    const searchTerms = this.extractTerms(query, /\s+/) // Separator: whitespace (spaces, tabs and new lines) characters
    const normalizedQuery = searchTerms.length > 0 ? searchTerms.join(' ') : 'homebridge'

    if (
      (normalizedQuery.startsWith('homebridge-') || this.isScopedPlugin(normalizedQuery))
      && !this.hiddenPlugins.includes(normalizedQuery)
    ) {
      if (
        !this.installedPlugins.find(x => x.name === normalizedQuery)
        && Object.keys(this.newScopePlugins).includes(normalizedQuery)
      ) {
        return await this.searchNpmRegistrySingle(`@homebridge-plugins/${normalizedQuery}`)
      }
      return await this.searchNpmRegistrySingle(normalizedQuery)
    }

    // There seems to be a new 64-character limit on the text query (which allows for 15 characters of a query)
    // Get the top 99 plugins now, later we filter down to the top 30
    const q = `${normalizedQuery.substring(0, 15)}+keywords:homebridge-plugin+not:deprecated&size=99`
    let searchResults: INpmSearchResults
    try {
      searchResults = (await firstValueFrom(this.httpService.get(`https://registry.npmjs.org/-/v1/search?text=${q}`))).data
    } catch (e) {
      this.logger.error(`Failed to search the npm registry (see https://homebridge.io/w/JJSz6 for help) as ${e.message}.`)
      throw new InternalServerErrorException(`Failed to search the npm registry as ${e.message}, see logs.`)
    }

    const hiddenPluginsSet = new Set(this.hiddenPlugins)

    const plugins: HomebridgePlugin[] = searchResults.objects
      .filter(x =>
        (x.package.name.startsWith('homebridge-') || this.isScopedPlugin(x.package.name))
        && !hiddenPluginsSet.has(x.package.name),
      )
      .map((pkg) => {
        const isInstalled = this.installedPlugins.find(x => x.name === pkg.package.name)

        // See if the plugin is already installed
        if (isInstalled) {
          return {
            ...isInstalled,
            lastUpdated: pkg.package.date,
            keywords: pkg.package.keywords || [],
          }
        }

        // It's not installed; finish building the response
        return {
          name: pkg.package.name,
          displayName: this.pluginNames[pkg.package.name],
          private: false,
          publicPackage: true,
          installedVersion: null,
          latestVersion: pkg.package.version,
          lastUpdated: pkg.package.date,
          description: (pkg.package.description || pkg.package.name).replace(/\(?(?:https?|ftp):\/\/[\n\S]+/g, '').trim(),
          keywords: pkg.package.keywords || [],
          links: pkg.package.links,
          author: this.pluginAuthors[pkg.package.name] || (pkg.package.publisher ? pkg.package.publisher.username : null),
          verifiedPlugin: this.verifiedPlugins.includes(pkg.package.name),
          verifiedPlusPlugin: this.verifiedPlusPlugins.includes(pkg.package.name),
          icon: this.pluginIcons[pkg.package.name] ? `${this.pluginListUrl}${this.pluginIcons[pkg.package.name]}` : null,
          isHbScoped: pkg.package.name.startsWith('@homebridge-plugins/'),
          newHbScope: this.newScopePlugins[pkg.package.name],
          isHbMaintained: this.maintainedPlugins.includes(pkg.package.name),
        }
      })

    const matchGroups = {
      exactName: [] as HomebridgePlugin[],
      exactKeyword: [] as HomebridgePlugin[],
      partial: [] as HomebridgePlugin[],
    }

    for (const plugin of plugins) {
      const matchType = this.matchesPlugin(plugin, searchTerms)
      if (matchType) {
        matchGroups[matchType].push(plugin)
      }
    }

    const orderPlugins = (arr: HomebridgePlugin[]) =>
      orderBy(arr, ['isHbScoped', 'verifiedPlusPlugin', 'verifiedPlugin', 'lastUpdated'], ['desc', 'desc', 'desc'])

    return [
      ...orderPlugins(matchGroups.exactName),
      ...orderPlugins(matchGroups.exactKeyword),
      ...orderPlugins(matchGroups.partial),
    ]
      .slice(0, 30)
      .map(plugin => this.fixDisplayName(plugin))
  }

  /**
   * Get a single plugin from the registry using its exact name
   * Used as a fallback if the search queries are not finding the desired plugin
   * @param query
   */
  async searchNpmRegistrySingle(query: string): Promise<HomebridgePlugin[]> {
    try {
      const fromCache = this.npmPluginCache.get(`lookup-${query}`)

      const pkg: INpmRegistryModule = fromCache || (await firstValueFrom((
        this.httpService.get(`https://registry.npmjs.org/${encodeURIComponent(query).replace(/%40/g, '@')}`)),
      )).data

      if (!fromCache) {
        this.npmPluginCache.set(`lookup-${query}`, pkg, 60)
      }

      if (!pkg.keywords || !pkg.keywords.includes('homebridge-plugin')) {
        return []
      }

      let plugin: HomebridgePlugin

      // See if the plugin is already installed
      if (!this.installedPlugins) {
        await this.getInstalledPlugins()
      }
      const isInstalled = this.installedPlugins.find(x => x.name === pkg.name)
      if (isInstalled) {
        plugin = isInstalled
        plugin.lastUpdated = pkg.time.modified
        return [plugin]
      }

      plugin = {
        name: pkg.name,
        private: false,
        description: (pkg.description)
          ? pkg.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim()
          : pkg.name,
        verifiedPlugin: this.verifiedPlugins.includes(pkg.name),
        verifiedPlusPlugin: this.verifiedPlusPlugins.includes(pkg.name),
        icon: this.pluginIcons[pkg.name],
        isHbScoped: pkg.name.startsWith('@homebridge-plugins/'),
        newHbScope: this.newScopePlugins[pkg.name],
        isHbMaintained: this.maintainedPlugins.includes(pkg.name),
      } as HomebridgePlugin

      // It's not installed; finish building the response
      plugin.displayName = this.pluginNames[pkg.name]
      plugin.publicPackage = true
      plugin.latestVersion = pkg['dist-tags'] ? pkg['dist-tags'].latest : undefined
      plugin.lastUpdated = pkg.time.modified
      plugin.updateAvailable = false
      plugin.updateTag = null
      plugin.links = {
        npm: `https://www.npmjs.com/package/${plugin.name}`,
        homepage: pkg.homepage,
        bugs: typeof pkg.bugs === 'object' && pkg.bugs?.url ? pkg.bugs.url : null,
      }
      plugin.author = this.pluginAuthors[pkg.name]
        || ((pkg.maintainers && pkg.maintainers.length) ? pkg.maintainers[0].name : null)
      plugin.verifiedPlugin = this.verifiedPlugins.includes(pkg.name)
      plugin.verifiedPlusPlugin = this.verifiedPlusPlugins.includes(pkg.name)
      plugin.icon = this.pluginIcons[pkg.name]
        ? `${this.pluginListUrl}${this.pluginIcons[pkg.name]}`
        : null
      plugin.isHbScoped = pkg.name.startsWith('@homebridge-plugins/')
      plugin.newHbScope = this.newScopePlugins[pkg.name]
      plugin.isHbMaintained = this.maintainedPlugins.includes(pkg.name)

      return [this.fixDisplayName(plugin)]
    } catch (e) {
      if (e.response?.status !== 404) {
        this.logger.error(`Failed to search the npm registry (see https://homebridge.io/w/JJSz6 for help) as ${e.message}.`)
      }
      return []
    }
  }

  /**
   * Update the UI
   * @param action
   * @param pluginAction
   * @param client
   */
  async manageUi(action: 'install' | 'uninstall', pluginAction: PluginActionDto, client: EventEmitter) {
    // Prevent uninstalling self
    if (action === 'uninstall') {
      throw new Error('Cannot uninstall the Homebridge UI.')
    }

    // Legacy support for offline docker updates
    if (this.configService.dockerOfflineUpdate && pluginAction.version === 'latest') {
      await this.updateSelfOffline(client)
      return true
    }

    // Convert 'latest' into a real version
    if (action === 'install' && pluginAction.version === 'latest') {
      pluginAction.version = await this.getNpmModuleLatestVersion(pluginAction.name)
    }

    const userPlatform = platform()

    // Set the default install path
    let installPath = this.configService.customPluginPath
      ? this.configService.customPluginPath
      : this.installedPlugins.find(x => x.name === this.configService.name).installPath

    // Check if the plugin is already installed
    await this.getInstalledPlugins()

    // Check if the plugin is currently installed
    const existingPlugin = this.installedPlugins.find(x => x.name === pluginAction.name)

    // If the plugin is already installed, match the installation path
    if (existingPlugin) {
      installPath = existingPlugin.installPath
    }

    const githubReleaseName = await this.isUiUpdateBundleAvailable(pluginAction)
    if (githubReleaseName) {
      try {
        await this.doUiBundleUpdate(pluginAction, client, githubReleaseName)
        return true
      } catch (e) {
        client.emit('stdout', yellow('\r\nBundled update failed. Trying regular update using npm.\r\n\r\n'))
      }
    }

    // Show a warning if updating homebridge-config-ui-x on Raspberry Pi 1 / Zero
    if (cpus().length === 1 && arch() === 'arm') {
      client.emit('stdout', yellow('***************************************************************\r\n'))
      client.emit('stdout', yellow(`Please be patient while ${this.configService.name} updates.\r\n`))
      client.emit('stdout', yellow('This process may take 5-15 minutes to complete on your device.\r\n'))
      client.emit('stdout', yellow('***************************************************************\r\n\r\n'))
    }

    // Prepare flags for npm command
    const installOptions: Array<string> = []

    // Check to see if the custom plugin path is using a package.json file
    if (installPath === this.configService.customPluginPath && await pathExists(resolve(installPath, '../package.json'))) {
      installOptions.push('--save')
    }

    // Install path is one level up
    installPath = resolve(installPath, '../')

    // Set global flag
    if (!this.configService.customPluginPath || userPlatform === 'win32' || existingPlugin?.globalInstall === true) {
      installOptions.push('-g')
    }

    // If installing, set --omit=dev to prevent installing devDependencies
    installOptions.push('--omit=dev')
    const npmPluginLabel = `${pluginAction.name}@${pluginAction.version}`

    // Clean up the npm cache before any installation
    await this.cleanNpmCache()

    // Run the npm command
    await this.runNpmCommand(
      [...this.npm, action, ...installOptions, npmPluginLabel],
      installPath,
      client,
      pluginAction.termCols,
      pluginAction.termRows,
    )

    // Ensure the custom plugin dir was not deleted
    await this.ensureCustomPluginDirExists()

    return true
  }

  /**
   * Manage a plugin, install, update or uninstall it
   * @param action
   * @param pluginAction
   * @param client
   */
  async managePlugin(action: 'install' | 'uninstall', pluginAction: PluginActionDto, client: EventEmitter) {
    pluginAction.version = pluginAction.version || 'latest'

    // Use a different route for the ui
    if (pluginAction.name === this.configService.name) {
      return await this.manageUi(action, pluginAction, client)
    }

    // Convert 'latest' into a real version
    if (action === 'install' && pluginAction.version === 'latest') {
      pluginAction.version = await this.getNpmModuleLatestVersion(pluginAction.name)
    }

    // Set the default install path
    let installPath = this.configService.customPluginPath
      ? this.configService.customPluginPath
      : this.installedPlugins.find(x => x.name === this.configService.name).installPath

    // Check if the plugin is already installed
    await this.getInstalledPlugins()

    // Check if the plugin is currently installed
    const existingPlugin = this.installedPlugins.find(x => x.name === pluginAction.name)

    // If the plugin is already installed, match the installation path
    if (existingPlugin) {
      installPath = existingPlugin.installPath
    }

    // If the plugin is verified, check to see if we can do a bundled update
    if (action === 'install' && await this.isPluginBundleAvailable(pluginAction)) {
      try {
        await this.doPluginBundleUpdate(pluginAction, client)
        return true
      } catch (e) {
        client.emit('stdout', yellow('\r\nBundled install / update could not complete. Trying regular install / update using npm.\r\n\r\n'))
      }
    }

    // Prepare flags for npm command
    const installOptions: Array<string> = []
    let npmPluginLabel = pluginAction.name

    // Check to see if the custom plugin path is using a package.json file
    if (installPath === this.configService.customPluginPath && await pathExists(resolve(installPath, '../package.json'))) {
      installOptions.push('--save')
    }

    // Install path is one level up
    installPath = resolve(installPath, '../')

    // Set global flag
    if (!this.configService.customPluginPath || platform() === 'win32' || existingPlugin?.globalInstall === true) {
      installOptions.push('-g')
    }

    if (action === 'install') {
      // If installing, set --omit=dev to prevent installing devDependencies
      installOptions.push('--omit=dev')
      npmPluginLabel = `${pluginAction.name}@${pluginAction.version}`
    }

    // Clean up the npm cache before any installation or uninstallation
    await this.cleanNpmCache()

    // Run the npm command
    await this.runNpmCommand(
      [...this.npm, action, ...installOptions, npmPluginLabel],
      installPath,
      client,
      pluginAction.termCols,
      pluginAction.termRows,
    )

    // Ensure the custom plugin dir was not deleted
    await this.ensureCustomPluginDirExists()

    return true
  }

  /**
   * Gets the Homebridge package details
   */
  public async getHomebridgePackage() {
    // Try a load from the "homebridgePackagePath" option first
    if (this.configService.ui.homebridgePackagePath) {
      const pkgJsonPath = join(this.configService.ui.homebridgePackagePath, 'package.json')
      if (await pathExists(pkgJsonPath)) {
        return await this.parsePackageJson(await readJson(pkgJsonPath), this.configService.ui.homebridgePackagePath)
      } else {
        this.logger.error(`The Homebridge path ${this.configService.ui.homebridgePackagePath} does not exist.`)
      }
    }

    const modules = await this.getInstalledModules()

    const homebridgeInstalls = modules.filter(x => x.name === 'homebridge')

    if (homebridgeInstalls.length > 1) {
      this.logger.warn('Multiple instances of Homebridge were found, see https://homebridge.io/w/JJSgm for help.')
      homebridgeInstalls.forEach((instance) => {
        this.logger.warn(instance.installPath)
      })
    }

    if (!homebridgeInstalls.length) {
      this.configService.hbServiceUiRestartRequired = true
      this.logger.error('Unable to find Homebridge installation, see https://homebridge.io/w/JJSgZ for help.')
      throw new Error('Unable To Find Homebridge Installation.')
    }

    const homebridgeModule = homebridgeInstalls[0]
    const pkgJson: IPackageJson = await readJson(join(homebridgeModule.installPath, 'package.json'))
    const homebridge = await this.parsePackageJson(pkgJson, homebridgeModule.path)

    if (!homebridge.latestVersion) {
      return homebridge
    }

    // Check for beta updates using Homebridge-specific preference
    await this.checkForBetaUpdates(
      homebridge,
      'homebridge',
      this.configService.ui.homebridgeAlwaysShowBetas || false,
    )

    this.configService.homebridgeVersion = homebridge.installedVersion

    return homebridge
  }

  /**
   * Updates the Homebridge package
   */
  public async updateHomebridgePackage(homebridgeUpdateAction: HomebridgeUpdateActionDto, client: EventEmitter) {
    const homebridge = await this.getHomebridgePackage()

    homebridgeUpdateAction.version = homebridgeUpdateAction.version || 'latest'
    if (homebridgeUpdateAction.version === 'latest' && homebridge.latestVersion) {
      homebridgeUpdateAction.version = homebridge.latestVersion
    }

    // Get the currently installed
    let installPath = homebridge.installPath

    // Prepare flags for npm command
    const installOptions: Array<string> = []
    installOptions.push('--omit=dev')

    // Check to see if the custom plugin path is using a package.json file
    if (installPath === this.configService.customPluginPath && await pathExists(resolve(installPath, '../package.json'))) {
      installOptions.push('--save')
    }

    installPath = resolve(installPath, '../')

    // Set global flag
    if (homebridge.globalInstall || platform() === 'win32') {
      installOptions.push('-g')
    }

    await this.runNpmCommand(
      [...this.npm, 'install', ...installOptions, `${homebridge.name}@${homebridgeUpdateAction.version}`],
      installPath,
      client,
      homebridgeUpdateAction.termCols,
      homebridgeUpdateAction.termRows,
    )

    return true
  }

  /**
   * Trigger an update for Homebridge, homebridge-config-ui-x, or any plugin
   * This method queues the update to be performed asynchronously
   * @param name - The package name (homebridge, homebridge-config-ui-x, or a plugin name)
   * @param version - Optional version to install (defaults to latest)
   * @returns Object containing operation status, package name, and version
   */
  public async triggerUpdate(name: string, version?: string): Promise<{ ok: boolean, name: string, version: string }> {
    // Get package information to validate it exists
    let targetVersion = version || 'latest'

    try {
      switch (name) {
        case 'homebridge': {
          const homebridge = await this.getHomebridgePackage()
          if (targetVersion === 'latest' && homebridge.latestVersion) {
            targetVersion = homebridge.latestVersion
          }
          break
        }
        case 'homebridge-config-ui-x': {
          const uiPackage = await this.getHomebridgeUiPackage()
          if (!uiPackage) {
            throw new NotFoundException(`Package ${name} is not installed.`)
          }
          if (targetVersion === 'latest' && uiPackage.latestVersion) {
            targetVersion = uiPackage.latestVersion
          }
          break
        }
        default: {
          if (!PluginsService.PLUGIN_IDENTIFIER_PATTERN.test(name)) {
            throw new BadRequestException('Invalid package name. Must be "homebridge", "homebridge-config-ui-x", or a valid Homebridge plugin name.')
          }

          // It's a plugin
          const plugins = await this.getInstalledPlugins()
          const plugin = plugins.find(p => p.name === name)
          if (!plugin) {
            throw new NotFoundException(`Plugin ${name} is not installed.`)
          }
          if (targetVersion === 'latest' && plugin.latestVersion) {
            targetVersion = plugin.latestVersion
          }
        }
      }
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw e
      }
      this.logger.error(`Failed to validate package ${name} for update: ${e.message}`)
      throw new BadRequestException(`Failed to validate package ${name} for update.`)
    }

    // Schedule the update to run asynchronously
    setImmediate(async () => {
      try {
        this.logger.log(`Starting scheduled update for ${name} to version ${targetVersion}`)

        // Create a mock client for capturing output
        const mockClient = new EventEmitter()
        mockClient.on('stdout', (data) => {
          this.logger.log(`[${name} update] ${data.toString().trim()}`)
        })

        // Perform the update based on package type
        if (name === 'homebridge') {
          await this.updateHomebridgePackage({ version: targetVersion }, mockClient)
          this.logger.log(`Successfully updated Homebridge to version ${targetVersion}. Performing quick restart of Homebridge process...`)
          this.homebridgeIpcService.restartHomebridge()
        } else if (name === this.configService.name) {
          await this.managePlugin('install', { name, version: targetVersion }, mockClient)
          this.logger.warn(`homebridge-config-ui-x has been updated, server will restart in ${PluginsService.UI_RESTART_DELAY_MS / 1000} seconds...`)
          setTimeout(() => {
            process.exit(0)
          }, PluginsService.UI_RESTART_DELAY_MS)
        } else {
          // It's a regular plugin - install it then check where it's running
          await this.managePlugin('install', { name, version: targetVersion }, mockClient)
          this.logger.log(`Successfully updated ${name} to version ${targetVersion}.`)

          // Check if the plugin is running in child bridges
          const childBridgeUsernames = await this.getPluginChildBridgeUsernames(name)

          if (childBridgeUsernames.length > 0) {
            // Plugin is running in one or more child bridges - restart each child bridge
            this.logger.log(`${name} is running in ${childBridgeUsernames.length} child bridge(s). Restarting child bridges: ${childBridgeUsernames.join(', ')}`)
            for (const username of childBridgeUsernames) {
              this.logger.log(`Restarting child bridge ${username}...`)
              this.childBridgesService.restartChildBridge(username)
            }
          } else {
            // Plugin is not running in a child bridge - do a quick restart of Homebridge
            this.logger.log(`${name} is not running in a child bridge. Performing quick restart of Homebridge process...`)
            this.homebridgeIpcService.restartHomebridge()
          }
        }
      } catch (error) {
        this.logger.error(`Failed to update ${name}: ${error.message}`)
        // Fallback to restarting Homebridge if anything goes wrong
        try {
          this.logger.warn('Attempting fallback restart of Homebridge process...')
          this.homebridgeIpcService.restartHomebridge()
        } catch (restartError) {
          this.logger.error(`Failed to restart Homebridge: ${restartError.message}`)
        }
      }
    })

    return {
      ok: true,
      name,
      version: targetVersion,
    }
  }

  /**
   * Clear the installed plugins cache
   * Used when beta preferences change to force refresh
   */
  public clearInstalledPluginsCache() {
    this.installedPluginsCache.del('installed-plugins')
  }

  /**
   * Gets the Homebridge UI package details
   * Special-cased like getHomebridgePackage() to avoid double beta checking
   */
  public async getHomebridgeUiPackage(): Promise<HomebridgePlugin> {
    const modules = await this.getInstalledModules()
    const uiModule = modules.find(x => x.name === this.configService.name)

    if (!uiModule) {
      throw new Error('Unable to find Homebridge UI installation.')
    }

    const pkgJson: IPackageJson = await readJson(join(uiModule.installPath, 'package.json'))

    // Build the plugin object manually (like parsePackageJson but inline to control the flow)
    const uiPackage: HomebridgePlugin = {
      name: pkgJson.name,
      displayName: pkgJson.displayName || this.pluginNames[pkgJson.name],
      private: pkgJson.private || false,
      description: (pkgJson.description)
        ? pkgJson.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim()
        : pkgJson.name,
      verifiedPlugin: this.verifiedPlugins.includes(pkgJson.name),
      verifiedPlusPlugin: this.verifiedPlusPlugins.includes(pkgJson.name),
      icon: this.pluginIcons[pkgJson.name]
        ? `${this.pluginListUrl}${this.pluginIcons[pkgJson.name]}`
        : null,
      isHbScoped: pkgJson.name.startsWith('@homebridge-plugins/'),
      newHbScope: this.newScopePlugins[pkgJson.name],
      isHbMaintained: this.maintainedPlugins.includes(pkgJson.name),
      installedVersion: pkgJson.version || '0.0.1',
      globalInstall: (uiModule.path !== this.configService.customPluginPath),
      settingsSchema: await pathExists(resolve(uiModule.path, pkgJson.name, 'config.schema.json')),
      engines: pkgJson.engines,
      installPath: uiModule.path,
      funding: (this.verifiedPlugins.includes(pkgJson.name) || this.verifiedPlusPlugins.includes(pkgJson.name))
        ? pkgJson.funding
        : undefined,
      directories: pkgJson.directories,
      publicPackage: false,
      latestVersion: null,
      updateAvailable: false,
      links: {},
    }

    // Get npm data but skip the beta check (we'll do it separately with the correct preference)
    await this.getPluginFromNpm(uiPackage, true)

    if (!uiPackage.latestVersion) {
      return uiPackage
    }

    // Check for beta updates using Homebridge UI-specific preference
    await this.checkForBetaUpdates(
      uiPackage,
      this.configService.name,
      this.configService.ui.homebridgeUiAlwaysShowBetas || false,
    )

    return uiPackage
  }

  /**
   * Gets the npm module details
   */
  public async getNpmPackage() {
    if (this.npmPackage) {
      return this.npmPackage
    } else {
      const modules = await this.getInstalledModules()

      const npmPkg = modules.find(x => x.name === 'npm')

      if (!npmPkg) {
        throw new Error('Could not find npm package')
      }

      const pkgJson: IPackageJson = await readJson(join(npmPkg.installPath, 'package.json'))
      const npm = await this.parsePackageJson(pkgJson, npmPkg.path) as HomebridgePlugin & { showUpdateWarning?: boolean }

      // Show the update warning if the installed version is below the minimum recommended
      // I set this to 9.5.0 to match a minimum node version of 18.15.0 (bwp91)
      npm.showUpdateWarning = lt(npm.installedVersion, '9.5.0')

      this.npmPackage = npm
      return npm
    }
  }

  /**
   * Check to see if a plugin update bundle is available
   * @param pluginAction
   */
  public async isPluginBundleAvailable(pluginAction: PluginActionDto) {
    if (
      this.configService.usePluginBundles === true
      && this.configService.customPluginPath
      && this.configService.strictPluginResolution
      && pluginAction.name !== this.configService.name
      && pluginAction.version !== 'latest'
    ) {
      try {
        const repoVersion = pluginAction.name.startsWith('@') ? 'v1.0.0-1' : 'v1.0.0'
        await firstValueFrom(this.httpService.head(`https://github.com/homebridge/plugins/releases/download/${repoVersion}/${pluginAction.name.replace('/', '@')}-${pluginAction.version}.sha256`))
        return true
      } catch (e) {
        return false
      }
    } else {
      return false
    }
  }

  /**
   * Update a plugin using the bundle
   * @param pluginAction
   * @param client
   */
  public async doPluginBundleUpdate(pluginAction: PluginActionDto, client: EventEmitter) {
    const pluginUpgradeInstallScriptPath = join(process.env.UIX_BASE_PATH, 'scripts/upgrade-install-plugin.sh')
    await this.runNpmCommand(
      [pluginUpgradeInstallScriptPath, pluginAction.name, pluginAction.version, this.configService.customPluginPath],
      this.configService.storagePath,
      client,
      pluginAction.termCols,
      pluginAction.termRows,
    )
    return true
  }

  /**
   * Check if a UI Update bundle is available for the given version
   */
  public async isUiUpdateBundleAvailable(pluginAction: PluginActionDto): Promise<string> {
    if (
      [
        '/usr/local/lib/node_modules',
        '/usr/lib/node_modules',
        '/opt/homebridge/lib/node_modules',
        '/var/packages/homebridge/target/app/lib/node_modules',
      ].includes(dirname(process.env.UIX_BASE_PATH))
      && pluginAction.name === this.configService.name
      && !['latest', 'alpha', 'beta'].includes(pluginAction.version)
    ) {
      try {
        try {
          const withV = `v${pluginAction.version}`
          await firstValueFrom(this.httpService.head(`https://github.com/homebridge/homebridge-config-ui-x/releases/download/${withV}/homebridge-config-ui-x-${pluginAction.version}.tar.gz`))
          return withV
        } catch (e2) {
          const withoutV = pluginAction.version
          await firstValueFrom(this.httpService.head(`https://github.com/homebridge/homebridge-config-ui-x/releases/download/${withoutV}/homebridge-config-ui-x-${pluginAction.version}.tar.gz`))
          return withoutV
        }
      } catch (e) {
        this.logger.error(`Failed to check for bundled update: ${e.message}.`)
        return ''
      }
    } else {
      return ''
    }
  }

  /**
   * Do a UI update from the bundle
   * @param pluginAction
   * @param client
   * @param githubReleaseName
   */
  public async doUiBundleUpdate(pluginAction: PluginActionDto, client: EventEmitter, githubReleaseName: string) {
    const prefix = dirname(dirname(dirname(process.env.UIX_BASE_PATH)))
    const upgradeInstallScriptPath = join(process.env.UIX_BASE_PATH, 'scripts/upgrade-install.sh')
    await this.runNpmCommand(
      this.configService.ui.sudo ? ['npm', 'run', 'upgrade-install', '--', pluginAction.version, prefix, githubReleaseName] : [upgradeInstallScriptPath, pluginAction.version, prefix, githubReleaseName],
      process.env.UIX_BASE_PATH,
      client,
      pluginAction.termCols,
      pluginAction.termRows,
    )
  }

  /**
   * Sets a flag telling the system to update the package next time the UI is restarted
   * Dependent on OS support - currently only supported by the homebridge/homebridge docker image
   */
  public async updateSelfOffline(client: EventEmitter) {
    client.emit('stdout', yellow(`${this.configService.name} has been scheduled to update on the next container restart.\n\r\n\r`))
    await new Promise(res => setTimeout(res, 800))

    client.emit('stdout', yellow('The Docker container will now try and restart.\n\r\n\r'))
    await new Promise(res => setTimeout(res, 800))

    client.emit('stdout', yellow('If you have not started the Docker container with ')
    + red('--restart=always') + yellow(' you may\n\rneed to manually start the container again.\n\r\n\r'))
    await new Promise(res => setTimeout(res, 800))

    client.emit('stdout', yellow('This process may take several minutes. Please be patient.\n\r'))
    await new Promise(res => setTimeout(res, 10000))

    await createFile('/homebridge/.uix-upgrade-on-restart')
  }

  /**
   * Returns the config.schema.json for the plugin
   * @param pluginName
   */
  public async getPluginConfigSchema(pluginName: string) {
    if (!this.installedPlugins) {
      await this.getInstalledPlugins()
    }
    const plugin = this.installedPlugins.find(x => x.name === pluginName)
    if (!plugin) {
      throw new NotFoundException()
    }

    if (!plugin.settingsSchema) {
      throw new NotFoundException()
    }

    let schemaPath: string

    const i18nPath = plugin.directories?.schemas
    if (i18nPath) {
      const lang = this.configService.ui.lang === 'auto' ? 'en' : this.configService.ui.lang

      if (lang && lang !== 'en' && lang !== 'auto') {
        const i18nSchemaPath = resolve(plugin.installPath, pluginName, i18nPath, `config.schema.${lang}.json`)
        if (existsSync(i18nSchemaPath)) {
          schemaPath = i18nSchemaPath
        }
      }
    }

    schemaPath ??= resolve(plugin.installPath, pluginName, 'config.schema.json')

    let configSchema = await readJson(schemaPath)

    // check to see if this plugin implements dynamic schemas
    if (configSchema.dynamicSchemaVersion) {
      const dynamicSchemaPath = resolve(this.configService.storagePath, `.${pluginName}-v${configSchema.dynamicSchemaVersion}.schema.json`)
      this.logger.log(`[${pluginName}] dynamic schema path: ${dynamicSchemaPath}.`)
      if (existsSync(dynamicSchemaPath)) {
        try {
          configSchema = await readJson(dynamicSchemaPath)
          this.logger.log(`[${pluginName}] dynamic schema loaded from ${dynamicSchemaPath}.`)
        } catch (e) {
          this.logger.error(`[${pluginName}] failed to load dynamic schema from ${dynamicSchemaPath} as ${e.message}.`)
        }
      }
    }

    // Modify this plugins schema to set the default port number
    if (pluginName === this.configService.name) {
      configSchema.schema.properties.port.default = this.configService.ui.port
    }

    // Modify homebridge-alexa to set the default pin
    if (pluginName === 'homebridge-alexa') {
      configSchema.schema.properties.pin.default = this.configService.homebridgeConfig.bridge.pin
    }

    // Add the display name from the config.json
    if (plugin.displayName) {
      configSchema.displayName = plugin.displayName
    }

    // Inject schema for _bridge child bridge setting (this is hidden, but prevents it getting removed)
    const childBridgeSchema = {
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
        firmwareRevision: {
          type: 'string',
        },
        model: {
          type: 'string',
        },
        debugModeEnabled: {
          type: 'boolean',
        },
        env: {
          type: 'object',
          properties: {
            DEBUG: {
              type: 'string',
            },
            NODE_OPTIONS: {
              type: 'string',
            },
          },
        },
      },
    }

    if (configSchema.schema && typeof configSchema.schema.properties === 'object') {
      configSchema.schema.properties._bridge = childBridgeSchema
    } else if (typeof configSchema.schema === 'object') {
      configSchema.schema._bridge = childBridgeSchema
    }

    return configSchema
  }

  /**
   * Returns the changelog from the npm package for a plugin
   * @param pluginName
   */
  public async getPluginChangeLog(pluginName: string) {
    await this.getInstalledPlugins()
    const plugin = this.installedPlugins.find(x => x.name === pluginName)
    if (!plugin) {
      throw new NotFoundException()
    }

    const changeLog = resolve(plugin.installPath, plugin.name, 'CHANGELOG.md')

    if (await pathExists(changeLog)) {
      return {
        changelog: await readFile(changeLog, 'utf8'),
      }
    } else {
      throw new NotFoundException()
    }
  }

  /**
   * Get the latest release notes from GitHub for a plugin
   * @param pluginName
   */
  public async getPluginRelease(pluginName: string) {
    let latestVersion: string | null = null
    try {
      const pkg: INpmRegistryModule = (await firstValueFrom((
        this.httpService.get(`https://registry.npmjs.org/${encodeURIComponent(pluginName).replace(/%40/g, '@')}`)),
      )).data

      latestVersion = pkg['dist-tags'] ? pkg['dist-tags'].latest : null
    } catch (e) {
      throw new NotFoundException()
    }

    switch (pluginName) {
      case 'homebridge':
      case 'homebridge-config-ui-x': {
        try {
          const release = await firstValueFrom(this.httpService.get(`https://api.github.com/repos/homebridge/${pluginName}/releases/latest`))
          const tags = await firstValueFrom(this.httpService.get(`https://api.github.com/repos/homebridge/${pluginName}/tags`))
          const changelog = await firstValueFrom(this.httpService.get(`https://raw.githubusercontent.com/homebridge/${pluginName}/refs/tags/${tags.data[0].name}/CHANGELOG.md`))
          return {
            name: release.data.name,
            notes: release.data.body,
            changelog: changelog.data,
            latestVersion,
          }
        } catch {
          return {
            name: null,
            notes: null,
            changelog: null,
            latestVersion,
          }
        }
      }
      default: {
        await this.getInstalledPlugins()
        const plugin = this.installedPlugins.find(x => x.name === pluginName)
        if (!plugin) {
          throw new NotFoundException()
        }

        // Plugin must have a homepage to work out Git Repo
        // Some plugins have a custom homepage, so often we can also use the bugs link too
        if (!plugin.links.homepage && !plugin.links.bugs) {
          throw new NotFoundException()
        }

        // Make sure the repo is GitHub
        const repoMatch = plugin.links.homepage?.match(/https:\/\/github.com\/([^/]+)\/([^/#]+)/)
        const bugsMatch = plugin.links.bugs?.match(/https:\/\/github.com\/([^/]+)\/([^/#]+)/)
        let match: RegExpMatchArray | null = repoMatch
        if (!repoMatch) {
          if (!bugsMatch) {
            throw new NotFoundException()
          }
          match = bugsMatch
        }

        try {
          const release = await firstValueFrom(this.httpService.get(`https://api.github.com/repos/${match[1]}/${match[2]}/releases/latest`))
          const latestTag = release.data.tag_name

          // The latest npm version may not match the latest GitHub release
          const isReleaseMatch = latestVersion?.replace(/[^0-9.]/g, '').includes(release.data.tag_name?.replace(/[^0-9.]/g, ''))

          // The plugin may have a custom changelog path from this.pluginChangelogs[pkg.package.name]
          const changelogPath = this.pluginChangelogs[pluginName] || ''
          let changelogData = null

          try {
            const changelog = await firstValueFrom(this.httpService.get(`https://raw.githubusercontent.com/${match[1]}/${match[2]}/refs/tags/${latestTag}/${changelogPath}CHANGELOG.md`))
            changelogData = changelog.data
          } catch {
            try {
              const changelog = (await firstValueFrom(this.httpService.get(`https://raw.githubusercontent.com/${match[1]}/${match[2]}/refs/tags/${latestTag}/${changelogPath}changelog.md`))).data
              changelogData = changelog.data
            } catch {}
          }

          return {
            name: isReleaseMatch && release.data.tag_name ? release.data.tag_name : null,
            notes: isReleaseMatch && release.data.body ? release.data.body : null,
            changelog: changelogData,
            latestVersion,
          }
        } catch (e) {
          throw new NotFoundException()
        }
      }
    }
  }

  /**
   * Attempt to extract the alias from a plugin
   */
  public async getPluginAlias(pluginName: string): Promise<PluginAlias> {
    if (!this.installedPlugins) {
      await this.getInstalledPlugins()
    }
    const plugin = this.installedPlugins.find(x => x.name === pluginName)

    if (!plugin) {
      throw new NotFoundException()
    }

    const fromCache: PluginAlias | undefined = this.pluginAliasCache.get(pluginName)
    if (fromCache as any) {
      return fromCache
    }

    const output = {
      pluginAlias: null,
      pluginType: null,
    }

    if (plugin.settingsSchema) {
      const schema = await this.getPluginConfigSchema(pluginName)
      output.pluginAlias = schema.pluginAlias
      output.pluginType = schema.pluginType
    } else {
      try {
        await new Promise((res, rej) => {
          const child = fork(resolve(process.env.UIX_BASE_PATH, 'scripts/extract-plugin-alias.js'), {
            env: {
              UIX_EXTRACT_PLUGIN_PATH: resolve(plugin.installPath, plugin.name),
            },
            stdio: 'ignore',
          })

          child.once('message', (data: any) => {
            if (data.pluginAlias && data.pluginType) {
              output.pluginAlias = data.pluginAlias
              output.pluginType = data.pluginType
              res(null)
            } else {
              rej(new Error('Invalid Response'))
            }
          })

          child.once('close', (code) => {
            if (code !== 0) {
              // eslint-disable-next-line unicorn/error-message
              rej(new Error())
            }
          })
        })
      } catch (e) {
        this.logger.debug(`Failed to extract ${pluginName} plugin alias as ${e.message}.`)
        // Fallback to the manual list, if defined for this plugin
        if (this.pluginAliasHints[pluginName]) {
          output.pluginAlias = this.pluginAliasHints[pluginName].pluginAlias
          output.pluginType = this.pluginAliasHints[pluginName].pluginType
        }
      }
    }

    this.pluginAliasCache.set(pluginName, output)
    return output
  }

  /**
   * Get the child bridge username(s) for a plugin if it's running in a child bridge
   * Returns an empty array if the plugin is not running in a child bridge
   * @param pluginName - The name of the plugin to check
   * @returns Array of unique child bridge usernames
   */
  public async getPluginChildBridgeUsernames(pluginName: string): Promise<string[]> {
    try {
      // Get plugin alias information
      const plugin = await this.getPluginAlias(pluginName)
      if (!plugin.pluginAlias) {
        return []
      }

      // Read the config file
      const config: HomebridgeConfig = await readJson(this.configService.configPath)

      const arrayKey = plugin.pluginType === 'accessory' ? 'accessories' : 'platforms'
      const usernamesSet = new Set<string>()

      // Find all config blocks for this plugin that have a _bridge property
      const pluginBlocks = config[arrayKey]?.filter((block) => {
        const matchesPlugin = block[plugin.pluginType] === plugin.pluginAlias
          || block[plugin.pluginType] === `${pluginName}.${plugin.pluginAlias}`
        return matchesPlugin && block._bridge?.username
      }) || []

      // Extract unique usernames
      for (const block of pluginBlocks) {
        if (block._bridge?.username) {
          usernamesSet.add(block._bridge.username)
        }
      }

      return Array.from(usernamesSet)
    } catch (e) {
      this.logger.error(`Failed to get child bridge usernames for ${pluginName}: ${e.message}`)
      return []
    }
  }

  /**
   * Returns the custom ui path for a plugin
   */
  public async getPluginUiMetadata(pluginName: string): Promise<HomebridgePluginUiMetadata> {
    if (!this.installedPlugins) {
      await this.getInstalledPlugins()
    }
    const plugin = this.installedPlugins.find(x => x.name === pluginName)
    const fullPath = resolve(plugin.installPath, plugin.name)

    const schema = await readJson(resolve(fullPath, 'config.schema.json'))
    const customUiPath = resolve(fullPath, schema.customUiPath || 'homebridge-ui')

    const publicPath = resolve(customUiPath, 'public')
    const serverPath = resolve(customUiPath, 'server.js')
    const devServer = plugin.private ? schema.customUiDevServer : null

    if (!devServer && !await pathExists(customUiPath)) {
      throw new Error(`Plugin does not provide a custom UI at expected location: ${customUiPath}`)
    }

    if (!devServer && !(await realpath(customUiPath)).startsWith(await realpath(fullPath))) {
      throw new Error(`Custom UI path is outside the plugin root: ${await realpath(customUiPath)}`)
    }

    if (await pathExists(resolve(publicPath, 'index.html')) || devServer) {
      return {
        devServer,
        serverPath,
        publicPath,
        plugin,
      }
    }

    throw new Error('Plugin does not provide a custom UI')
  }

  /**
   * Return an array of disabled plugins
   */
  private async getDisabledPlugins(): Promise<string[]> {
    try {
      const config: HomebridgeConfig = await readJson(this.configService.configPath)
      if (Array.isArray(config.disabledPlugins)) {
        return config.disabledPlugins
      } else {
        return []
      }
    } catch (e) {
      return []
    }
  }

  /**
   * Load any @scoped homebridge modules
   */
  private async getInstalledScopedModules(requiredPath: string, scope: string): Promise<Array<{ name: string, path: string, installPath: string }>> {
    try {
      if ((await stat(join(requiredPath, scope))).isDirectory()) {
        const scopedModules = await readdir(join(requiredPath, scope))
        return scopedModules
          .filter(x => x.startsWith('homebridge-'))
          .map((x) => {
            return {
              name: join(scope, x).split(sep).join('/'),
              installPath: join(requiredPath, scope, x),
              path: requiredPath,
            }
          })
      } else {
        return []
      }
    } catch (e) {
      this.logger.log(e)
      return []
    }
  }

  /**
   * Returns a list of modules installed
   */
  private async getInstalledModules(): Promise<Array<{ name: string, path: string, installPath: string }>> {
    const allModules = []
    // Loop over each possible path to find installed plugins
    for (const requiredPath of this.paths) {
      const modules: string[] = await readdir(requiredPath)
      for (const module of modules) {
        try {
          if (module.charAt(0) === '@') {
            allModules.push(...await this.getInstalledScopedModules(requiredPath, module))
          } else {
            allModules.push({
              name: module,
              installPath: join(requiredPath, module),
              path: requiredPath,
            })
          }
        } catch (e) {
          this.logger.log(`Failed to parse ${module} in ${requiredPath} as ${e.message}.`)
        }
      }
    }

    // If homebridge-config-ui-x not found in default locations
    if (allModules.findIndex(x => x.name === 'homebridge-config-ui-x') === -1) {
      allModules.push({
        name: 'homebridge-config-ui-x',
        installPath: process.env.UIX_BASE_PATH,
        path: dirname(process.env.UIX_BASE_PATH),
      })
    }

    // If homebridge not found in default locations, check the folder above
    if (allModules.findIndex(x => x.name === 'homebridge') === -1) {
      if (existsSync(join(process.env.UIX_BASE_PATH, '..', 'homebridge'))) {
        allModules.push({
          name: 'homebridge',
          installPath: join(process.env.UIX_BASE_PATH, '..', 'homebridge'),
          path: dirname(join(process.env.UIX_BASE_PATH, '..', 'homebridge')),
        })
      }
    }

    return allModules
  }

  /**
   * Return a boolean if the plugin is a @scoped/homebridge plugin
   */
  private isScopedPlugin(name: string): boolean {
    return (name.charAt(0) === '@' && name.split('/').length > 0 && name.split('/')[1].indexOf('homebridge-') === 0)
  }

  /**
   * Helper function to work out where npm is
   */
  private getNpmPath() {
    if (platform() === 'win32') {
      // If running on windows find the full path to npm
      const windowsNpmPath = [
        join(process.env.APPDATA, 'npm/npm.cmd'),
        join(process.env.ProgramFiles, 'nodejs/npm.cmd'),
        join(process.env.NVM_SYMLINK || `${process.env.ProgramFiles}/nodejs`, 'npm.cmd'),
      ].filter(existsSync)

      if (windowsNpmPath.length) {
        return [windowsNpmPath[0]]
      } else {
        this.logger.error('Cannot find npm binary, you will not be able to manage plugins or update Homebridge. You might be able to fix this problem by running:')
        this.logger.error('npm install -g npm')
      }
    }
    // Linux and macOS don't require the full path to npm
    return ['npm']
  }

  /**
   * Get the paths used by Homebridge to load plugins
   * this is the same code used by homebridge to find plugins
   * https://github.com/nfarina/homebridge/blob/c73a2885d62531925ea439b9ad6d149a285f6daa/lib/plugin.js#L105-L134
   */
  private getBasePaths(): string[] {
    let paths = []

    if (this.configService.customPluginPath) {
      paths.unshift(this.configService.customPluginPath)
    }

    if (this.configService.strictPluginResolution) {
      if (!paths.length) {
        paths.push(...this.getNpmPrefixToSearchPaths())
      }
    } else {
      // In ESM, require.main is not available, so we use Module._nodeModulePaths instead
      paths = paths.concat(module._nodeModulePaths(dirname(require.resolve.paths('.')?.[0] || process.cwd())))

      if (process.env.NODE_PATH) {
        paths = process.env.NODE_PATH.split(delimiter).filter(p => !!p).concat(paths)
      } else {
        // Default paths for non-windows systems
        if ((platform() !== 'win32')) {
          paths.push('/usr/local/lib/node_modules')
          paths.push('/usr/lib/node_modules')
        }
        paths.push(...this.getNpmPrefixToSearchPaths())
      }

      // Don't look at homebridge-config-ui-x's own modules
      paths = paths.filter(x => x !== join(process.env.UIX_BASE_PATH, 'node_modules'))
    }
    // Filter out duplicates and non-existent paths
    return uniq(paths).filter((requiredPath) => {
      return existsSync(requiredPath)
    })
  }

  /**
   * Get path from the npm prefix, e.g. /usr/local/lib/node_modules
   */
  private getNpmPrefixToSearchPaths(): string[] {
    const paths = []
    if ((platform() === 'win32')) {
      paths.push(join(process.env.APPDATA, 'npm/node_modules'))
    } else {
      paths.push(execSync('/bin/echo -n "$(npm -g prefix)/lib/node_modules"', {
        env: Object.assign({
          npm_config_loglevel: 'silent',
          npm_update_notifier: 'false',
        }, process.env),
      }).toString('utf8'))
    }
    return paths
  }

  /**
   * Convert the package.json into a HomebridgePlugin
   * @param pkgJson
   * @param installPath
   */
  /**
   * Shared method to check for beta version updates
   * Modifies the plugin object in place if a beta update is found
   * @param plugin - The plugin object to check and update
   * @param packageName - The package name to query for versions
   * @param preferBetas - Whether to prefer beta versions for this package
   */
  private async checkForBetaUpdates(
    plugin: HomebridgePlugin,
    packageName: string,
    preferBetas: boolean,
  ): Promise<void> {
    if (plugin.updateAvailable) {
      return // Already has an update available
    }

    const pluginVersion = parse(plugin.installedVersion)
    const installedTag = pluginVersion.prerelease[0]?.toString()

    // Check for beta updates if:
    // - Currently on a beta/alpha/test version AND current > latest stable
    // - OR preferBetas setting is enabled for this package
    const shouldCheckBetas = (
      installedTag
      && ['alpha', 'beta', 'test'].includes(installedTag)
      && gt(plugin.installedVersion, plugin.latestVersion)
    ) || preferBetas

    if (shouldCheckBetas) {
      const versions = await this.getAvailablePluginVersions(packageName)
      const targetTag = preferBetas && !installedTag ? 'beta' : installedTag

      if (versions.tags[targetTag] && gt(versions.tags[targetTag], plugin.installedVersion)) {
        plugin.latestVersion = versions.tags[targetTag]
        plugin.updateAvailable = true
        plugin.updateEngines = versions.versions?.[plugin.latestVersion]?.engines || null
        plugin.updateTag = targetTag
      }
    }
  }

  private async parsePackageJson(pkgJson: IPackageJson, installPath: string): Promise<HomebridgePlugin> {
    const plugin: HomebridgePlugin = {
      name: pkgJson.name,
      displayName: pkgJson.displayName || this.pluginNames[pkgJson.name],
      private: pkgJson.private || false,
      description: (pkgJson.description)
        ? pkgJson.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim()
        : pkgJson.name,
      verifiedPlugin: this.verifiedPlugins.includes(pkgJson.name),
      verifiedPlusPlugin: this.verifiedPlusPlugins.includes(pkgJson.name),
      icon: this.pluginIcons[pkgJson.name]
        ? `${this.pluginListUrl}${this.pluginIcons[pkgJson.name]}`
        : null,
      isHbScoped: pkgJson.name.startsWith('@homebridge-plugins/'),
      newHbScope: this.newScopePlugins[pkgJson.name],
      isHbMaintained: this.maintainedPlugins.includes(pkgJson.name),
      installedVersion: installPath ? (pkgJson.version || '0.0.1') : null,
      globalInstall: (installPath !== this.configService.customPluginPath),
      settingsSchema: await pathExists(resolve(installPath, pkgJson.name, 'config.schema.json')),
      engines: pkgJson.engines,
      installPath,
    }

    // Only verified plugins can show donation links
    plugin.funding = (plugin.verifiedPlugin || plugin.verifiedPlusPlugin) ? pkgJson.funding : undefined

    // Add directories for i18n schema support
    plugin.directories = pkgJson.directories

    // If the plugin is private, do not attempt to query npm
    if (pkgJson.private) {
      plugin.publicPackage = false
      plugin.latestVersion = null
      plugin.updateAvailable = false
      plugin.links = {}
      return plugin
    }

    return this.getPluginFromNpm(plugin)
  }

  /**
   * Accepts a HomebridgePlugin and adds data from npm
   * @param plugin
   * @param skipBetaCheck - Skip beta checking (used when beta check is done separately)
   */
  private async getPluginFromNpm(plugin: HomebridgePlugin, skipBetaCheck = false): Promise<HomebridgePlugin> {
    try {
      // Attempt to load from cache
      const fromCache = this.npmPluginCache.get(plugin.name)
      plugin.updateAvailable = false
      plugin.updateTag = null

      // Restore from cache, or load from npm
      const pkg: IPackageJson = fromCache || (
        await firstValueFrom(this.httpService.get(`https://registry.npmjs.org/${encodeURIComponent(plugin.name).replace(/%40/g, '@')}/latest`))
      ).data

      plugin.latestVersion = pkg.version
      plugin.updateAvailable = gt(pkg.version, plugin.installedVersion)
      plugin.updateEngines = plugin.updateAvailable ? pkg.engines : null

      // Check for beta updates using plugin-specific preference (unless skipped)
      if (!skipBetaCheck) {
        const preferBetas = this.configService.ui.plugins?.alwaysShowBetasFor?.includes(plugin.name) || false

        await this.checkForBetaUpdates(
          plugin,
          plugin.name,
          preferBetas,
        )
      }

      // Store in cache if it was not there already
      if (!fromCache) {
        this.npmPluginCache.set(plugin.name, pkg)
      }

      plugin.publicPackage = true
      plugin.links = {
        npm: `https://www.npmjs.com/package/${plugin.name}`,
        homepage: pkg.homepage,
        bugs: typeof pkg.bugs === 'object' && pkg.bugs?.url ? pkg.bugs.url : null,
      }
      plugin.author = this.pluginAuthors[pkg.name]
        || ((pkg.maintainers && pkg.maintainers.length) ? pkg.maintainers[0].name : null)
    } catch (e) {
      if (e.response?.status !== 404) {
        this.logger.log(`[${plugin.name}] failed to check registry.npmjs.org for updates (see https://homebridge.io/w/JJSz6 for help) as ${e.message}.`)
      }
      plugin.publicPackage = false
      plugin.latestVersion = null
      plugin.updateAvailable = false
      plugin.updateTag = null
      plugin.links = {}
    }
    return plugin
  }

  /**
   * Returns the "latest" version for the provided module
   * @param npmModuleName
   */
  public async getNpmModuleLatestVersion(npmModuleName: string): Promise<string> {
    try {
      const response = await firstValueFrom(this.httpService.get<IPackageJson>(`https://registry.npmjs.org/${npmModuleName}/latest`))
      return response.data.version
    } catch (e) {
      return 'latest'
    }
  }

  /**
   * Executes an NPM command
   * @param command
   * @param cwd
   * @param client
   * @param cols
   * @param rows
   */
  private async runNpmCommand(command: Array<string>, cwd: string, client: EventEmitter, cols?: number, rows?: number) {
    // Remove synology @eaDir folders from the node_modules
    await this.removeSynologyMetadata()

    let timeoutTimer: NodeJS.Timeout
    command = command.filter(x => x.length)

    // Sudo mode is requested in plugin config
    if (this.configService.ui.sudo) {
      command.unshift('sudo', '-E', '-n')
    } else {
      // Do a pre-check to test for write access when not using sudo mode
      let npmInstallPath: string
      try {
        npmInstallPath = execSync('npm root -g').toString().trim()
      } catch (e) {
        npmInstallPath = resolve(cwd, 'node_modules')
      }
      try {
        await access(npmInstallPath, constants.W_OK)
      } catch (e) {
        client.emit('stdout', yellow(`The user "${userInfo().username}" does not have write access to the target directory:\n\r\n\r`))
        client.emit('stdout', `${npmInstallPath}\n\r\n\r`)
        client.emit('stdout', yellow('This may cause the operation to fail.\n\r'))
        client.emit('stdout', yellow('See the docs for details on how to enable sudo mode:\n\r'))
        client.emit('stdout', yellow('https://github.com/homebridge/homebridge-config-ui-x/wiki/Manual-Configuration#sudo-mode\n\r\n\r'))
      }
    }

    this.logger.log(`Running command ${command.join(' ')}.`)

    if (!satisfies(process.version, `>=${this.configService.minimumNodeVersion}`)) {
      client.emit('stdout', yellow(`Node.js v${this.configService.minimumNodeVersion} higher is required for ${this.configService.name}.\n\r`))
      client.emit('stdout', yellow(`You may experience issues while running on Node.js ${process.version}.\n\r\n\r`))
    }

    // Set up the environment for the call
    const env = {}
    Object.assign(env, process.env)
    Object.assign(env, {
      npm_config_global_style: 'true',
      npm_config_unsafe_perm: 'true',
      npm_config_update_notifier: 'false',
      npm_config_prefer_online: 'true',
      npm_config_foreground_scripts: 'true',
      npm_config_loglevel: 'error',
    })

    // Set global prefix for unix based systems
    if (command.includes('-g') && basename(cwd) === 'lib') {
      cwd = dirname(cwd)
      Object.assign(env, {
        npm_config_prefix: cwd,
      })
    }

    // On windows, we want to ensure the global prefix is the same as the installation path
    if (platform() === 'win32') {
      Object.assign(env, {
        npm_config_prefix: cwd,
      })
    }

    client.emit('stdout', cyan(`USER: ${userInfo().username}\n\r`))
    client.emit('stdout', cyan(`DIR: ${cwd}\n\r`))
    client.emit('stdout', cyan(`CMD: ${command.join(' ')}\n\r\n\r`))

    // Clear the installed plugins cache
    this.installedPluginsCache.del('installed-plugins')

    await new Promise((res, rej) => {
      const term = this.nodePtyService.spawn(command.shift(), command, {
        name: 'xterm-color',
        cols: cols || 80,
        rows: rows || 30,
        cwd,
        env,
      })

      // Send stdout data from the process to all clients
      term.onData((data) => {
        client.emit('stdout', data)
      })

      // Send an error message to the client if the command does not exit with code 0
      term.onExit(({ exitCode }) => {
        if (exitCode === 0) {
          clearTimeout(timeoutTimer)
          client.emit('stdout', green('\n\rOperation succeeded!.\n\r'))
          res(null)
        } else {
          clearTimeout(timeoutTimer)
          rej(new Error(`Operation failed with code ${exitCode}.\n\rYou can download this log file for future reference.\n\rSee https://github.com/homebridge/homebridge-config-ui-x/wiki/Troubleshooting for help.`))
        }
      })

      // If the command spends to long trying to execute kill it after 5 minutes
      timeoutTimer = setTimeout(() => {
        term.kill('SIGTERM')
      }, 300000)
    })
  }

  /**
   * When npm removes the last plugin in a custom node_modules location it may delete this location
   * which will cause errors. This function ensures the plugin directory is recreated if it was removed.
   */
  private async ensureCustomPluginDirExists() {
    if (!this.configService.customPluginPath) {
      return
    }

    if (!await pathExists(this.configService.customPluginPath)) {
      this.logger.warn(`Custom plugin directory was removed, re-creating ${this.configService.customPluginPath}.`)
      try {
        await ensureDir(this.configService.customPluginPath)
      } catch (e) {
        this.logger.error(`Failed to re-create custom plugin directory as ${e.message}.`)
      }
    }
  }

  /**
   * Remove the Synology @eaDir directories from the plugin folder
   */
  private async removeSynologyMetadata() {
    if (!this.configService.customPluginPath) {
      return
    }

    const offendingPath = resolve(this.configService.customPluginPath, '@eaDir')

    try {
      if (!await pathExists(offendingPath)) {
        await remove(offendingPath)
      }
    } catch (e) {
      this.logger.error(`Failed to remove ${offendingPath} as ${e.message}.`)
    }
  }

  /**
   * Clean the npm cache
   * npm cache clean --force
   */
  private async cleanNpmCache() {
    const command: string[] = [...this.npm, 'cache', 'clean', '--force']

    if (this.configService.ui.sudo) {
      command.unshift('sudo', '-E', '-n')
    }

    return new Promise((res) => {
      // Join command and args into a single string to avoid DEP0190 deprecation warning
      const fullCommand = command.join(' ')
      const child = spawn(fullCommand, { shell: true })

      child.on('exit', (code) => {
        this.logger.log(`Executed npm cache clear command with exit code ${code}.`)
        res(null)
      })

      child.on('error', () => {
        // Do nothing
      })
    })
  }

  /**
   * Loads the list of plugins from GitHub
   * This is verified plugins, verified plus plugins, plugin icons and hidden plugins
   */
  private async loadPluginList() {
    clearTimeout(this.pluginListRetryTimeout)
    try {
      const pluginList: PluginListData = (
        await firstValueFrom(this.httpService.get(this.pluginListFile, {
          httpsAgent: null,
        }))
      )
      const pluginListData = pluginList.data

      this.verifiedPlugins = []
      this.verifiedPlusPlugins = []
      this.pluginIcons = {}
      this.hiddenPlugins = []
      this.maintainedPlugins = []
      this.pluginAuthors = {}
      this.pluginNames = {}
      this.pluginChangelogs = {}
      this.newScopePlugins = {}

      Object.keys(pluginListData).forEach((key) => {
        const plugin: PluginListItem = pluginListData[key]
        if (plugin.i) {
          this.pluginIcons[key] = `icons/${plugin.i}.png`
        }
        if (plugin.h) {
          this.hiddenPlugins.push(key)
        }
        if (plugin.m) {
          this.maintainedPlugins.push(key)
        }
        if (plugin.a) {
          this.pluginAuthors[key] = plugin.a
        }
        if (plugin.n) {
          this.pluginNames[key] = plugin.n
        }
        if (plugin.s) {
          this.newScopePlugins[key] = plugin.s
        }
        if (plugin.v) {
          this.verifiedPlugins.push(key)
        }
        if (plugin.p) {
          this.verifiedPlusPlugins.push(key)
        }
        if (plugin.c) {
          this.pluginChangelogs[key] = plugin.c
        }
      })
    } catch (e) {
      // Try again in 60 seconds
      this.pluginListRetryTimeout = setTimeout(() => this.loadPluginList(), 60000)
      this.logger.debug(`Could not obtain plugin list from plugins repo as ${e.message}.`)
    }
  }
}
