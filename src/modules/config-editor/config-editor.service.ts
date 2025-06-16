import { resolve } from 'node:path'

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import dayjs from 'dayjs'
import {
  ensureDir,
  move,
  pathExists,
  readdir,
  readFile,
  readJson,
  remove,
  rename,
  unlink,
  writeJsonSync,
} from 'fs-extra'
import { gte } from 'semver'

import { ConfigService, HomebridgeConfig } from '../../core/config/config.service'
import { Logger } from '../../core/logger/logger.service'
import { SchedulerService } from '../../core/scheduler/scheduler.service'
import { PluginsService } from '../plugins/plugins.service'

@Injectable()
export class ConfigEditorService {
  constructor(
    private readonly logger: Logger,
    private readonly configService: ConfigService,
    private readonly schedulerService: SchedulerService,
    private readonly pluginsService: PluginsService,
  ) {
    this.start()
    this.scheduleConfigBackupCleanup()
  }

  /**
   * Executed when the UI starts
   */
  private async start() {
    await this.ensureBackupPathExists()
    await this.migrateConfigBackups()
  }

  /**
   * Schedule the job to clean up old config.json backup files
   */
  private scheduleConfigBackupCleanup() {
    const scheduleRule = new this.schedulerService.RecurrenceRule()
    scheduleRule.hour = 1
    scheduleRule.minute = 10
    scheduleRule.second = Math.floor(Math.random() * 59) + 1

    this.logger.debug(`Next config.json backup cleanup scheduled for ${scheduleRule.nextInvocationDate(new Date()).toString()}.`)

    this.schedulerService.scheduleJob('cleanup-config-backups', scheduleRule, () => {
      this.logger.log('Running job to cleanup config.json backup files older than 60 days...')
      this.cleanupConfigBackups()
    })
  }

  /**
   * Returns the config file
   */
  public async getConfigFile(): Promise<HomebridgeConfig> {
    const config = await readJson(this.configService.configPath)

    // Ensure bridge is an object
    if (!config.bridge || typeof config.bridge !== 'object') {
      config.bridge = {}
    }

    // Ensure accessories is an array
    if (!config.accessories || !Array.isArray(config.accessories)) {
      config.accessories = []
    }

    // Ensure platforms is an array
    if (!config.platforms || !Array.isArray(config.platforms)) {
      config.platforms = []
    }

    return config
  }

  /**
   * Updates the config file
   */
  public async updateConfigFile(config: HomebridgeConfig) {
    const now = new Date()

    if (!config) {
      config = {} as HomebridgeConfig
    }

    if (!config.bridge) {
      config.bridge = {} as HomebridgeConfig['bridge']
    }

    // If bridge.port is a string, try and convert to a number
    if (typeof config.bridge.port === 'string') {
      config.bridge.port = Number.parseInt(config.bridge.port, 10)
    }

    // Ensure the bridge.port is valid
    if (!config.bridge.port || typeof config.bridge.port !== 'number' || config.bridge.port > 65533 || config.bridge.port < 1025) {
      config.bridge.port = Math.floor(Math.random() * (52000 - 51000 + 1) + 51000)
    }

    // Ensure bridge.username exists
    if (!config.bridge.username) {
      config.bridge.username = this.generateUsername()
    }

    // Ensure the username matches the required pattern
    const usernamePattern = /^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/i
    if (!usernamePattern.test(config.bridge.username)) {
      if (usernamePattern.test(this.configService.homebridgeConfig.bridge.username)) {
        config.bridge.username = this.configService.homebridgeConfig.bridge.username
      } else {
        config.bridge.username = this.generateUsername()
      }
    }

    // Ensure bridge.pin exists
    if (!config.bridge.pin) {
      config.bridge.pin = this.generatePin()
    }

    // Ensure the pin matches the required pattern
    const pinPattern = /^\d{3}-\d{2}-\d{3}$/
    if (!pinPattern.test(config.bridge.pin)) {
      if (pinPattern.test(this.configService.homebridgeConfig.bridge.pin)) {
        config.bridge.pin = this.configService.homebridgeConfig.bridge.pin
      } else {
        config.bridge.pin = this.generatePin()
      }
    }

    // Ensure the bridge.name exists and is a string
    if (!config.bridge.name || typeof config.bridge.name !== 'string') {
      config.bridge.name = `Homebridge ${config.bridge.username.substring(config.bridge.username.length - 5).replace(/:/g, '')}`
    }

    // Ensure accessories is an array
    if (!config.accessories || !Array.isArray(config.accessories)) {
      config.accessories = []
    }

    // Ensure platforms is an array
    if (!config.platforms || !Array.isArray(config.platforms)) {
      config.platforms = []
    }

    // Ensure config.plugins is an array and not empty
    if (config.plugins && Array.isArray(config.plugins)) {
      if (!config.plugins.length) {
        delete config.plugins
      }
    } else if (config.plugins) {
      delete config.plugins
    }

    // Ensure config.mdns is valid
    if (config.mdns && typeof config.mdns !== 'object') {
      delete config.mdns
    }

    // Ensure config.disabledPlugins is an array
    if (config.disabledPlugins && !Array.isArray(config.disabledPlugins)) {
      delete config.disabledPlugins
    }

    // Create backup of existing config
    try {
      await rename(this.configService.configPath, resolve(this.configService.configBackupPath, `config.json.${now.getTime().toString()}`))
    } catch (e) {
      if (e.code === 'ENOENT') {
        await this.ensureBackupPathExists()
      } else {
        this.logger.warn(`Could not create a backup of the config.json file to ${this.configService.configBackupPath} as ${e.message}.`)
      }
    }

    // Save config file
    writeJsonSync(this.configService.configPath, config, { spaces: 4 })

    this.logger.log('Changes to config.json saved.')

    // Parse the config for ui settings
    const configCopy = JSON.parse(JSON.stringify(config))
    this.configService.parseConfig(configCopy)

    return config
  }

  /**
   * Return the config for a specific plugin
   */
  public async getConfigForPlugin(pluginName: string) {
    const [plugin, config] = await Promise.all([
      await this.pluginsService.getPluginAlias(pluginName),
      await this.getConfigFile(),
    ])

    if (!plugin.pluginAlias) {
      return new BadRequestException('Plugin alias could not be determined.')
    }

    const arrayKey = plugin.pluginType === 'accessory' ? 'accessories' : 'platforms'

    return config[arrayKey].filter((block) => {
      return block[plugin.pluginType] === plugin.pluginAlias
        || block[plugin.pluginType] === `${pluginName}.${plugin.pluginAlias}`
    })
  }

  /**
   * Update the config for a specific plugin
   */
  public async updateConfigForPlugin(pluginName: string, pluginConfig: Record<string, any>[]) {
    const [plugin, config] = await Promise.all([
      await this.pluginsService.getPluginAlias(pluginName),
      await this.getConfigFile(),
    ])

    if (!plugin.pluginAlias) {
      return new BadRequestException('Plugin alias could not be determined.')
    }

    const arrayKey = plugin.pluginType === 'accessory' ? 'accessories' : 'platforms'

    // Ensure the update contains an array
    if (!Array.isArray(pluginConfig)) {
      throw new BadRequestException('Plugin Config must be an array.')
    }

    // Validate each block in the array
    for (const block of pluginConfig) {
      if (typeof block !== 'object' || Array.isArray(block)) {
        throw new BadRequestException('Plugin config must be an array of objects.')
      }
      block[plugin.pluginType] = plugin.pluginAlias
    }

    let positionIndices: number

    // Remove the existing config blocks
    config[arrayKey] = config[arrayKey].filter((block, index) => {
      if (block[plugin.pluginType] === plugin.pluginAlias || block[plugin.pluginType] === `${pluginName}.${plugin.pluginAlias}`) {
        positionIndices = index
        return false
      } else {
        return true
      }
    })

    // Try and keep any _bridge object 'clean'
    pluginConfig.forEach((block) => {
      if (block._bridge) {
        // The env object is only compatible with homebridge 1.8.0 and above
        const isEnvObjAllowed = gte(this.configService.homebridgeVersion, '1.8.0')

        Object.keys(block._bridge).forEach((key) => {
          if (key === 'env' && isEnvObjAllowed) {
            Object.keys(block._bridge.env).forEach((envKey) => {
              if (block._bridge.env[envKey] === undefined || typeof block._bridge.env[envKey] !== 'string' || block._bridge.env[envKey].trim() === '') {
                delete block._bridge.env[envKey]
              }
            })

            // If the result of env is an empty object, remove it
            if (Object.keys(block._bridge.env).length === 0) {
              delete block._bridge.env
            }
          } else {
            if (block._bridge[key] === undefined || (typeof block._bridge[key] === 'string' && block._bridge[key].trim() === '')) {
              delete block._bridge[key]
            }
          }
        })
      }
    })

    // Replace with the provided config, trying to put it back in the same location
    if (positionIndices !== undefined) {
      config[arrayKey].splice(positionIndices, 0, ...pluginConfig)
    } else {
      config[arrayKey].push(...pluginConfig)
    }

    // Save the config file
    await this.updateConfigFile(config)
    return pluginConfig
  }

  /**
   * Set a specific property for the Homebridge UI
   */
  public async setPropertyForUi(property: string, value: any) {
    // Cannot update the platform property
    if (property === 'platform') {
      throw new BadRequestException('Cannot update the platform property.')
    }

    // 1. Get the current config for the Homebridge UI
    const config = await this.getConfigFile()
    const pluginConfig = config.platforms.find(x => x.platform === 'config')

    // 2. Calculate the property, split dots into nested properties
    const forbiddenKeys = ['__proto__', 'constructor', 'prototype']
    if (property.includes('.')) {
      const properties = property.split('.')
      let current = pluginConfig

      for (let i = 0; i < properties.length - 1; i++) {
        if (!forbiddenKeys.includes(properties[i])) {
          if (!current[properties[i]]) {
            current[properties[i]] = {}
          }
          current = current[properties[i]]
        }
      }

      const finalProperty = properties[properties.length - 1]
      if (!forbiddenKeys.includes(finalProperty)) {
        // 3. Update the final property
        current[finalProperty] = value
      }
    } else {
      if (!forbiddenKeys.includes(property)) {
        pluginConfig[property] = value
      }
    }

    // 4. Clean and save the UI config block
    config.platforms[config.platforms.findIndex(x => x.platform === 'config')] = this.cleanUpUiConfig(pluginConfig)
    await this.updateConfigFile(config)
  }

  /**
   * Set the accessory control blacklist (this request is not partial)
   */
  public async setAccessoryControlInstanceBlacklist(value: string[]) {
    // 1. Get the current config for the Homebridge UI
    const config = await this.getConfigFile()
    const pluginConfig = config.platforms.find(x => x.platform === 'config')

    // 2. Ensure the accessoryControl block exists and set the instanceBlacklist
    if (!pluginConfig.accessoryControl) {
      pluginConfig.accessoryControl = {}
    }
    pluginConfig.accessoryControl.instanceBlacklist = (value || [])
      .filter(x => typeof x === 'string' && x.trim() !== '' && /^(?:[A-F0-9]{2}:){5}[A-F0-9]{2}$/i.test(x.trim()))
      .map(x => x.trim().toUpperCase())

    // 3. Clean and save the UI config block
    config.platforms[config.platforms.findIndex(x => x.platform === 'config')] = this.cleanUpUiConfig(pluginConfig)
    await this.updateConfigFile(config)
  }

  /**
   * Mark a plugin as disabled
   */
  public async disablePlugin(pluginName: string) {
    if (pluginName === this.configService.name) {
      throw new BadRequestException('Disabling this plugin is now allowed.')
    }

    const config = await this.getConfigFile()

    if (!Array.isArray(config.disabledPlugins)) {
      config.disabledPlugins = []
    }

    config.disabledPlugins.push(pluginName)

    await this.updateConfigFile(config)
    return config.disabledPlugins
  }

  /**
   * Mark a plugin as enabled
   */
  public async enablePlugin(pluginName: string) {
    const config = await this.getConfigFile()

    if (!Array.isArray(config.disabledPlugins)) {
      config.disabledPlugins = []
    }

    const idx = config.disabledPlugins.findIndex(x => x === pluginName)

    // Check plugin is in the list
    if (idx > -1) {
      config.disabledPlugins.splice(idx, 1)
      await this.updateConfigFile(config)
    }

    return config.disabledPlugins
  }

  /**
   * List config backups
   */
  public async listConfigBackups() {
    const dirContents = await readdir(this.configService.configBackupPath)

    return dirContents
      .filter(x => x.match(/^config.json.\d{09,15}/))
      .sort()
      .reverse()
      .map((x) => {
        const ext = x.split('.')
        if (ext.length === 3 && !Number.isNaN(ext[2] as any)) {
          return {
            id: ext[2],
            timestamp: new Date(Number.parseInt(ext[2], 10)),
            file: x,
          }
        } else {
          return null
        }
      })
      .filter(x => x && !Number.isNaN(x.timestamp.getTime()))
  }

  /**
   * Returns a config backup
   * @param backupId
   */
  public async getConfigBackup(backupId: number) {
    const requestedBackupPath = resolve(this.configService.configBackupPath, `config.json.${backupId}`)

    // Check backup file exists
    if (!await pathExists(requestedBackupPath)) {
      throw new NotFoundException(`Backup ${backupId} Not Found`)
    }

    // Read source backup
    return await readFile(requestedBackupPath)
  }

  /**
   * Delete all config backups
   */
  public async deleteAllConfigBackups() {
    const backups = await this.listConfigBackups()

    // Delete each backup file
    for (const backupFile of backups) {
      await unlink(resolve(this.configService.configBackupPath, backupFile.file))
    }
  }

  /**
   * Ensure the backup file path exists
   */
  private async ensureBackupPathExists() {
    try {
      await ensureDir(this.configService.configBackupPath)
    } catch (e) {
      this.logger.error(`Could not create directory for config backups ${this.configService.configBackupPath} as ${e.message}.`)
      this.logger.error(`Config backups will continue to use ${this.configService.storagePath}.`)
      this.configService.configBackupPath = this.configService.storagePath
    }
  }

  /**
   * Remove config.json backup files older than 60 days
   */
  public async cleanupConfigBackups() {
    try {
      const backups = await this.listConfigBackups()

      for (const backup of backups) {
        if (dayjs().diff(dayjs(backup.timestamp), 'day') >= 60) {
          await remove(resolve(this.configService.configBackupPath, backup.file))
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to cleanup old config.json backup files as ${e.message}`)
    }
  }

  /**
   * This is a one-time script to move config.json.xxxxx backup files to the new location ./backups/config
   */
  private async migrateConfigBackups() {
    try {
      if (this.configService.configBackupPath === this.configService.storagePath) {
        this.logger.error('Skipping migration of existing config.json backups...')
        return
      }

      const dirContents = await readdir(this.configService.storagePath)

      const backups = dirContents
        .filter(x => x.match(/^config.json.\d{09,15}/))
        .sort()
        .reverse()

      // Move the last 100 to the new location
      for (const backupFileName of backups.splice(0, 100)) {
        const sourcePath = resolve(this.configService.storagePath, backupFileName)
        const targetPath = resolve(this.configService.configBackupPath, backupFileName)
        await move(sourcePath, targetPath, { overwrite: true })
      }

      // Delete the rest
      for (const backupFileName of backups) {
        const sourcePath = resolve(this.configService.storagePath, backupFileName)
        await remove(sourcePath)
      }
    } catch (e) {
      this.logger.warn(`Migrating config.json backups to new location failed as ${e.message}.`)
    }
  }

  /**
   * Generates a new random pin
   */
  public generatePin() {
    let code: string | Array<any> = `${Math.floor(10000000 + Math.random() * 90000000)}`
    code = code.split('')
    code.splice(3, 0, '-')
    code.splice(6, 0, '-')
    code = code.join('')
    return code
  }

  /**
   * Generates a new random username
   */
  public generateUsername() {
    const hexDigits = '0123456789ABCDEF'
    let username = '0E:'
    for (let i = 0; i < 5; i++) {
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      username += hexDigits.charAt(Math.round(Math.random() * 15))
      if (i !== 4) {
        username += ':'
      }
    }
    return username
  }

  /**
   * Removes empty objects and arrays from the provided object
   * Warning: This will modify the object in place, so use with caution.
   * @param {Record<string, any>} obj
   * @return {void}
   * @private
   */
  private removeEmpty(obj: Record<string, any>): void {
    Object.keys(obj).forEach((key) => {
      const value = obj[key]
      if (value === '' || value === null || value === undefined || value === false || (Array.isArray(value) && value.length === 0)) {
        // Checking for 'false' is okay for the UI as all defaults are false
        delete obj[key]
      } else if (typeof value === 'object') {
        this.removeEmpty(value)
        if (Object.keys(value).length === 0) {
          delete obj[key]
        }
      }
    })
  }

  /**
   * Cleans up the UI config object
   * - Removes empty objects and arrays
   * - Ensures the name key is first and platform key is last
   * @param {Record<string, any>} uiConfig
   * @return {Record<string, any>}
   * @private
   */
  private cleanUpUiConfig(uiConfig: Record<string, any>): Record<string, any> {
    // Name key first, platform key last
    const { name, platform, ...rest } = uiConfig
    const cleanedUiConfig = {
      name,
      ...rest,
      platform,
    }
    this.removeEmpty(cleanedUiConfig)
    return cleanedUiConfig
  }
}
