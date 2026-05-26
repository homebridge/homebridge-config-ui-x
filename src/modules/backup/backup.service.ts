import type { MultipartFile } from '@fastify/multipart'
import type { FastifyReply } from 'fastify'

import type { HomebridgePlugin } from '../plugins/plugins.interfaces.js'

import { EventEmitter } from 'node:events'
import { constants, createReadStream, createWriteStream, statSync } from 'node:fs'
import { access, lstat, mkdir, mkdtemp, readdir, realpath } from 'node:fs/promises'
import { platform, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream'
import { promisify } from 'node:util'

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common'
import { cyan, green, red, yellow } from 'bash-color'
import dayjs from 'dayjs'
import { copy, ensureDir, pathExists, readJson, remove, writeJson } from 'fs-extra/esm'
import { networkInterfaces } from 'systeminformation'
import { create, extract, ReadEntry } from 'tar'
import { Parse } from 'unzipper'

import { HomebridgeConfig } from '../../core/config/config.interfaces.js'
import { ConfigService } from '../../core/config/config.service.js'
import { JsonFileStoreService } from '../../core/fs/json-file-store.service.js'
import { HomebridgeIpcService } from '../../core/homebridge-ipc/homebridge-ipc.service.js'
import { Logger } from '../../core/logger/logger.service.js'
import { RE_BACKUP_FILENAME, RE_BACKUP_ID, RE_COLON } from '../../core/regex.constants.js'
import { SchedulerService } from '../../core/scheduler/scheduler.service.js'
import { PluginsService } from '../plugins/plugins.service.js'

const pump = promisify(pipeline)

// Sentinel value placed in `restoreDirectory` between the moment an upload
// reserves the slot and the moment the temp dir is actually created. Lets
// concurrent requests detect a pending upload before `mkdtemp` resolves.
const RESTORE_PENDING = '__pending__'

@Injectable()
export class BackupService {
  private restoreDirectory: string

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PluginsService) private readonly pluginsService: PluginsService,
    @Inject(SchedulerService) private readonly schedulerService: SchedulerService,
    @Inject(HomebridgeIpcService) private readonly homebridgeIpcService: HomebridgeIpcService,
    @Inject(Logger) private readonly logger: Logger,
    @Inject(JsonFileStoreService) private readonly jsonStore: JsonFileStoreService,
  ) {
    this.scheduleInstanceBackups()
  }

  /**
   * Tar `extract` filter that skips absolute paths, `..` segments, symlink
   * and hardlink entries, and device/FIFO entries. Pairs with
   * `strict: true, preservePaths: false` to keep crafted backups from
   * writing outside the temp restore dir or diverting a later `copy`
   * through a link onto the host.
   */
  private readonly tarSafeFilter = (path: string, entry: ReadEntry | import('node:fs').Stats): boolean => {
    const type = (entry as ReadEntry).type
    if (
      type === 'SymbolicLink'
      || type === 'Link'
      || type === 'CharacterDevice'
      || type === 'BlockDevice'
      || type === 'FIFO'
    ) {
      return false
    }
    if (path.startsWith('/') || path.startsWith('..') || path.includes(`..${sep}`) || path.includes('../')) {
      return false
    }
    return true
  }

  /**
   * Stream-based zip extractor with per-entry path validation. Rejects any
   * entry whose resolved path escapes the destination directory (Zip Slip,
   * CVE-2024-22363 / CVE-2024-43374).
   */
  private async extractZipSafely(source: import('node:stream').Readable, destDir: string): Promise<void> {
    const normalisedDest = resolve(destDir)
    return new Promise<void>((res, rej) => {
      let pending = 1
      let aborted = false
      let firstError: Error | undefined

      const done = (err?: Error) => {
        if (err && !firstError) {
          firstError = err
          aborted = true
        }
        pending--
        if (pending === 0) {
          firstError ? rej(firstError) : res()
        }
      }

      source.pipe(Parse())
        .on('entry', (entry: any) => {
          if (aborted) {
            entry.autodrain()
            return
          }
          const entryPath = resolve(normalisedDest, entry.path)
          const rel = relative(normalisedDest, entryPath)
          if (rel.startsWith('..') || isAbsolute(rel)) {
            entry.autodrain()
            done(new Error(`Zip entry escapes destination: ${entry.path}`))
            return
          }
          if (entry.type === 'Directory') {
            pending++
            mkdir(entryPath, { recursive: true })
              .then(() => done())
              .catch(done)
            entry.autodrain()
            return
          }
          pending++
          mkdir(dirname(entryPath), { recursive: true })
            .then(() => {
              entry.pipe(createWriteStream(entryPath))
                .on('finish', () => done())
                .on('error', done)
            })
            .catch(done)
        })
        .on('error', done)
        .on('close', () => done())
    })
  }

  /**
   * Atomic check-and-set for the singleton restore slot. If another restore
   * already holds it (or is mid-upload), throw `ConflictException`. The set
   * happens synchronously before any `await`, so two concurrent uploads
   * cannot both pass this gate.
   */
  private reserveRestoreSlot(): void {
    if (this.restoreDirectory !== undefined) {
      throw new ConflictException('Another restore is already pending. Trigger or cancel it first.')
    }
    this.restoreDirectory = RESTORE_PENDING
  }

  /**
   * Defence-in-depth — walk an extracted archive and refuse to proceed if any
   * entry is a symbolic link. `tarSafeFilter` and `extractZipSafely` already
   * block symlink entries; this catches anything that slipped through.
   */
  private async assertNoSymlinks(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = join(dir, entry.name)
      const stats = await lstat(entryPath)
      if (stats.isSymbolicLink()) {
        throw new Error(`Archive contains symlink at ${entryPath} — refusing to restore.`)
      }
      if (entry.isDirectory()) {
        await this.assertNoSymlinks(entryPath)
      }
    }
  }

  /**
   * Schedule the job to create an instance backup at recurring intervals
   */
  public scheduleInstanceBackups() {
    // Always cancel any existing job first so this method is safe to
    // call from a runtime toggle. Without this, toggling
    // scheduledBackupDisable to true at runtime would leave the
    // previously scheduled job firing until the next UI restart.
    this.schedulerService.cancelJob('instance-backup')

    if (this.configService.ui.scheduledBackupDisable === true) {
      this.logger.debug('Scheduled backups disabled.')
      return
    }

    const scheduleRule = new this.schedulerService.RecurrenceRule()
    scheduleRule.hour = Math.floor(Math.random() * 7)
    scheduleRule.minute = Math.floor(Math.random() * 59)
    scheduleRule.second = Math.floor(Math.random() * 59)

    this.schedulerService.scheduleJob('instance-backup', scheduleRule, () => {
      this.logger.log('Running scheduled instance backup...')
      this.runScheduledBackupJob().catch((e) => {
        this.logger.error(`Scheduled instance backup failed as ${e?.message || e}.`)
      })
    })
  }

  /**
   * Re-register the scheduled-backup job — call after the
   * `scheduledBackupDisable` flag is mutated at runtime so the schedule
   * reflects the new setting without waiting for a UI restart.
   */
  public refreshBackupSchedule() {
    this.scheduleInstanceBackups()
  }

  /**
   * Creates the .tar.gz instance backup of the current Homebridge instance
   */
  private async createBackup() {
    // Prepare a temp working directory
    const instanceId = this.configService.homebridgeConfig.bridge.username.replace(RE_COLON, '')
    const backupDir = await mkdtemp(join(tmpdir(), 'homebridge-backup-'))
    const backupFileName = `homebridge-backup-${instanceId}.${Date.now().toString()}.tar.gz`
    const backupPath = resolve(backupDir, backupFileName)

    this.logger.log(`Creating temporary backup archive at ${backupPath}.`)

    try {
      // Resolve the real path of the storage directory (in case it's a symbolic link)
      const storagePath = await realpath(this.configService.storagePath)

      // Create a copy of the storage directory in the temp path
      await copy(storagePath, resolve(backupDir, 'storage'), {
        filter: async (filePath) => {
          // List of files not to include in the archive
          if (
            [
              'instance-backups', // scheduled backups
              'nssm.exe', // windows hb-service
              'homebridge.log', // hb-service
              'logs', // docker
              'node_modules', // docker
              'startup.sh', // docker
              '.docker.env', // docker
              'docker-compose.yml', // docker
              'pnpm-lock.yaml', // pnpm
              'package.json', // npm
              'package-lock.json', // npm
              '.npmrc', // npm
              '.npm', // npm
              'FFmpeg', // ffmpeg
              'fdk-aac', // ffmpeg
              '.git', // git
              'recordings', // homebridge-camera-ui recordings path
              '.homebridge.sock', // homebridge ipc socket
              '#recycle', // synology dsm recycle bin
              '@eaDir', // synology dsm metadata
              '.venv', // python venv
              '.cache', // cache
            ].includes(basename(filePath))
          ) {
            return false
          }

          // Check each item is a real directory or real file (no symlinks, pipes, unix sockets etc.)
          try {
            const stat = await lstat(filePath)
            return (stat.isDirectory() || stat.isFile())
          } catch (e) {
            return false
          }
        },
      })

      // Get full list of installed plugins
      const installedPlugins = await this.pluginsService.getInstalledPlugins()
      await writeJson(resolve(backupDir, 'plugins.json'), installedPlugins)

      // Create an info.json
      await writeJson(resolve(backupDir, 'info.json'), {
        timestamp: new Date().toISOString(),
        platform: platform(),
        uix: this.configService.package.version,
        node: process.version,
      })

      // Create a tarball of storage and plugins list
      await create({
        portable: true,
        gzip: true,
        file: backupPath,
        cwd: backupDir,
        filter: (filePath, stat) => {
          if (stat.size > globalThis.backup.maxBackupFileSize) {
            this.logger.warn(`Backup is skipping ${filePath} because it is larger than ${globalThis.backup.maxBackupFileSizeText}.`)
            return false
          }
          return true
        },
      }, [
        'storage',
        'plugins.json',
        'info.json',
      ])
      if (statSync(backupPath).size > globalThis.backup.maxBackupSize) {
        this.logger.error(`Backup file exceeds maximum restore file size (${globalThis.backup.maxBackupSizeText}) ${(statSync(backupPath).size / (1024 * 1024)).toFixed(1)}MB.`)
      }
    } catch (e) {
      this.logger.log(`Backup failed, removing ${backupDir}.`)
      await remove(resolve(backupDir))
      throw e
    }

    return {
      instanceId,
      backupDir,
      backupPath,
      backupFileName,
    }
  }

  /**
   * Ensures the scheduled backup path exists and is writable
   */
  async ensureScheduledBackupPath() {
    if (this.configService.ui.scheduledBackupPath) {
      // If using a custom backup path, check it exists
      if (!await pathExists(this.configService.instanceBackupPath)) {
        throw new Error('Custom instance backup path does not exist')
      }

      try {
        await access(this.configService.instanceBackupPath, constants.W_OK | constants.R_OK)
      } catch (e) {
        throw new Error(`Custom instance backup path is not writable / readable by service: ${e.message}`)
      }
    } else {
      // When not using a custom backup path, just ensure it exists
      return await ensureDir(this.configService.instanceBackupPath)
    }
  }

  /**
   * Runs the job to create a scheduled backup
   */
  async runScheduledBackupJob() {
    // Ensure backup path exists
    try {
      await this.ensureScheduledBackupPath()
    } catch (e) {
      this.logger.warn(`Could not run scheduled backup as ${e.message}.`)
      return
    }

    // Create the backup
    try {
      const { backupDir, backupPath, instanceId } = await this.createBackup()
      await copy(backupPath, resolve(
        this.configService.instanceBackupPath,
        `homebridge-backup-${instanceId}.${Date.now().toString()}.tar.gz`,
      ))
      await remove(resolve(backupDir))
    } catch (e) {
      this.logger.warn(`Failed to create scheduled instance backup as ${e.message}.`)
    }

    // Remove backups older than 7 days
    try {
      const backups = await this.listScheduledBackups()

      for (const backup of backups) {
        if (dayjs().diff(dayjs(backup.timestamp), 'day') >= 7) {
          await remove(resolve(this.configService.instanceBackupPath, backup.fileName))
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to remove old backups as ${e.message}.`)
    }
  }

  /**
   * Get the time the next backup will run
   */
  async getNextBackupTime() {
    if (this.configService.ui.scheduledBackupDisable === true) {
      return {
        next: false,
      }
    } else {
      return {
        next: this.schedulerService.scheduledJobs['instance-backup']?.nextInvocation() || false,
      }
    }
  }

  /**
   * List the instance backups saved on disk
   */
  async listScheduledBackups() {
    // Ensure backup path exists
    try {
      await this.ensureScheduledBackupPath()

      const dirContents = await readdir(this.configService.instanceBackupPath, { withFileTypes: true })
      return dirContents
        .filter(x => x.isFile() && x.name.match(RE_BACKUP_FILENAME))
        .map((x) => {
          const split = x.name.split('.')
          const instanceId = split[0].split('-')[2]
          if (split.length === 4 && !Number.isNaN(split[1] as any)) {
            return {
              id: `${instanceId}.${split[1]}`,
              instanceId: split[0].split('-')[2],
              timestamp: new Date(Number.parseInt(split[1], 10)),
              fileName: x.name,
              size: (statSync(`${this.configService.instanceBackupPath}/${x.name}`).size / (1024 * 1024)).toFixed(1),
              maxBackupSize: globalThis.backup.maxBackupSize / (1024 * 1024),
              maxBackupSizeText: globalThis.backup.maxBackupSizeText,
            }
          } else {
            return null
          }
        })
        .filter(x => x !== null)
        .sort((a, b) => {
          if (a.id > b.id) {
            return -1
          } else if (a.id < b.id) {
            return -2
          } else {
            return 0
          }
        })
    } catch (e) {
      this.logger.warn(`Could not get scheduled backups as ${e.message}.`)
      throw new InternalServerErrorException(e.message)
    }
  }

  /**
   * Downloads a scheduled backup .tar.gz
   */
  async getScheduledBackup(backupId: string): Promise<StreamableFile> {
    if (!RE_BACKUP_ID.test(backupId)) {
      throw new BadRequestException('Invalid backup ID.')
    }

    const backupPath = resolve(this.configService.instanceBackupPath, `homebridge-backup-${backupId}.tar.gz`)
    if (!backupPath.startsWith(this.configService.instanceBackupPath)) {
      throw new BadRequestException('Invalid backup ID.')
    }

    // Check the file exists
    if (!await pathExists(backupPath)) {
      throw new NotFoundException()
    }

    return new StreamableFile(createReadStream(backupPath))
  }

  /**
   * Removes a scheduled backup .tar.gz
   */
  async deleteScheduledBackup(backupId: string): Promise<void> {
    if (!RE_BACKUP_ID.test(backupId)) {
      throw new BadRequestException('Invalid backup ID.')
    }

    const backupPath = resolve(this.configService.instanceBackupPath, `homebridge-backup-${backupId}.tar.gz`)
    if (!backupPath.startsWith(this.configService.instanceBackupPath)) {
      throw new BadRequestException('Invalid backup ID.')
    }

    // Check the file exists
    if (!await pathExists(backupPath)) {
      throw new NotFoundException()
    }

    try {
      await remove(backupPath)
      this.logger.warn(`Scheduled backup ${backupId} deleted by request.`)
    } catch (e) {
      this.logger.warn(`Failed to delete scheduled backup by request as ${e.message}.`)
      throw new InternalServerErrorException(e.message)
    }
  }

  /**
   * Restore a scheduled backup .tar.gz
   */
  async restoreScheduledBackup(backupId: string): Promise<void> {
    if (!RE_BACKUP_ID.test(backupId)) {
      throw new BadRequestException('Invalid backup ID.')
    }

    const backupPath = resolve(this.configService.instanceBackupPath, `homebridge-backup-${backupId}.tar.gz`)
    if (!backupPath.startsWith(this.configService.instanceBackupPath)) {
      throw new BadRequestException('Invalid backup ID.')
    }

    // Check the file exists
    if (!await pathExists(backupPath)) {
      throw new NotFoundException()
    }

    // Reserve the singleton restore slot synchronously — concurrent uploads
    // must lose the race and 409.
    this.reserveRestoreSlot()

    try {
      // Prepare a temp working directory
      const restoreDir = await mkdtemp(join(tmpdir(), 'homebridge-backup-'))

      // Pipe the data to the temp directory
      await pump(createReadStream(backupPath), extract({
        cwd: restoreDir,
        strict: true,
        preservePaths: false,
        filter: this.tarSafeFilter,
      }))

      this.restoreDirectory = restoreDir
    } catch (err) {
      this.restoreDirectory = undefined
      throw err
    }
  }

  /**
   * Create and download backup archive of the current homebridge instance
   */
  async downloadBackup(reply: FastifyReply): Promise<StreamableFile> {
    const { backupDir, backupPath, backupFileName } = await this.createBackup()

    // Set download headers
    reply.raw.setHeader('Content-type', 'application/octet-stream')
    reply.raw.setHeader('Content-disposition', `attachment; filename=${backupFileName}`)
    reply.raw.setHeader('File-Name', backupFileName)

    // For dev only
    if (reply.request.hostname === 'localhost:8080') {
      reply.raw.setHeader('access-control-allow-origin', 'http://localhost:4200')
    }

    return new StreamableFile(createReadStream(backupPath).on('close', () => remove(resolve(backupDir))))
  }

  /**
   * Create a backup file and save it in the backup directory
   */
  async createBackupInDirectory(): Promise<void> {
    // Ensure backup path exists
    try {
      await this.ensureScheduledBackupPath()
    } catch (error) {
      this.logger.error(`Create backup failed: ${error.message}`)
      throw new NotFoundException()
    }

    try {
      const { backupDir, backupPath, instanceId } = await this.createBackup()

      await copy(backupPath, resolve(
        this.configService.instanceBackupPath,
        `homebridge-backup-${instanceId}.${Date.now().toString()}.tar.gz`,
      ))

      await remove(resolve(backupDir))
    } catch (error) {
      this.logger.error(`Create backup failed: ${error.message}`)
      throw new InternalServerErrorException(error.message)
    }
  }

  /**
   * Restore a backup file
   * File upload handler
   */
  async uploadBackupRestore(data: MultipartFile) {
    // Reserve the singleton restore slot before any await so a concurrent
    // upload loses the race and 409s.
    this.reserveRestoreSlot()

    try {
      // Prepare a temp working directory
      const backupDir = await mkdtemp(join(tmpdir(), 'homebridge-backup-'))

      // Pipe the data to the temp directory
      await pump(data.file, extract({
        cwd: backupDir,
        strict: true,
        preservePaths: false,
        filter: this.tarSafeFilter,
      }))

      this.restoreDirectory = backupDir
    } catch (err) {
      this.restoreDirectory = undefined
      throw err
    }
  }

  /**
   * Removes the temporary directory used for the restore and releases the
   * singleton restore slot so a subsequent upload can succeed.
   */
  async removeRestoreDirectory() {
    const dir = this.restoreDirectory
    this.restoreDirectory = undefined
    if (dir && dir !== RESTORE_PENDING) {
      return await remove(dir)
    }
  }

  /**
   * Do an offline restore
   */
  async triggerHeadlessRestore() {
    if (
      !this.restoreDirectory
      || this.restoreDirectory === RESTORE_PENDING
      || !await pathExists(this.restoreDirectory)
    ) {
      throw new BadRequestException('No backup file uploaded')
    }

    const client = new EventEmitter()

    client.on('stdout', (data) => {
      this.logger.log(data)
    })
    client.on('stderr', (data) => {
      this.logger.log(data)
    })

    await this.restoreFromBackup(client, true)

    return { status: 0 }
  }

  /**
   * Restores the uploaded backup
   */
  async restoreFromBackup(client: EventEmitter, autoRestart = false) {
    if (!this.restoreDirectory || this.restoreDirectory === RESTORE_PENDING) {
      throw new BadRequestException()
    }

    // Check info.json exists
    if (!await pathExists(resolve(this.restoreDirectory, 'info.json'))) {
      await this.removeRestoreDirectory()
      throw new Error('Uploaded file is not a valid Homebridge Backup Archive.')
    }

    // Check plugins.json exists
    if (!await pathExists(resolve(this.restoreDirectory, 'plugins.json'))) {
      await this.removeRestoreDirectory()
      throw new Error('Uploaded file is not a valid Homebridge Backup Archive.')
    }

    // Check storage exists
    if (!await pathExists(resolve(this.restoreDirectory, 'storage'))) {
      await this.removeRestoreDirectory()
      throw new Error('Uploaded file is not a valid Homebridge Backup Archive.')
    }

    // Reject the whole archive up front if any extracted entry is a symlink.
    // tarSafeFilter already blocks symlink *entries* during extraction; this
    // catches anything that slipped through (e.g. fs-extra dereferencing a
    // dir entry whose contents are symlinks).
    try {
      await this.assertNoSymlinks(this.restoreDirectory)
    } catch (err) {
      await this.removeRestoreDirectory()
      throw err
    }

    // Load info.json
    const backupInfo = await readJson(resolve(this.restoreDirectory, 'info.json'))

    // Display backup archive information
    client.emit('stdout', cyan('Backup Archive Information\r\n'))
    client.emit('stdout', `Source Node.js Version: ${backupInfo.node}\r\n`)
    client.emit('stdout', `Source Homebridge UI Version: v${backupInfo.uix}\r\n`)
    client.emit('stdout', `Source Platform: ${backupInfo.platform}\r\n`)
    client.emit('stdout', `Created: ${backupInfo.timestamp}\r\n`)

    // Start restore
    this.logger.warn('Starting backup restore...')
    client.emit('stdout', cyan('\r\nRestoring backup...\r\n\r\n'))
    await new Promise(res => setTimeout(res, 1000))

    // Files that should not be restored (but may exist in older backup archives)
    const restoreFilter = [
      join(this.restoreDirectory, 'storage', 'package.json'),
      join(this.restoreDirectory, 'storage', 'package-lock.json'),
      join(this.restoreDirectory, 'storage', '.npmrc'),
      join(this.restoreDirectory, 'storage', 'docker-compose.yml'),
    ]

    // Resolve the real path of the storage directory (in case it's a symbolic link)
    const storagePath = await realpath(this.configService.storagePath)

    // Restore files
    client.emit('stdout', yellow(`Restoring Homebridge storage to ${storagePath}\r\n`))
    await new Promise(res => setTimeout(res, 100))
    await copy(resolve(this.restoreDirectory, 'storage'), storagePath, {
      filter: async (filePath) => {
        if (restoreFilter.includes(filePath)) {
          client.emit('stdout', `Skipping ${basename(filePath)}\r\n`)
          return false
        }

        // Check each item is a real directory or real file (no symlinks, pipes, unix sockets etc.)
        try {
          const stat = await lstat(filePath)
          if (stat.isDirectory() || stat.isFile()) {
            client.emit('stdout', `Restoring ${basename(filePath)}\r\n`)
            return true
          } else {
            client.emit('stdout', `Skipping ${basename(filePath)}\r\n`)
            return false
          }
        } catch (e) {
          client.emit('stdout', `Skipping ${basename(filePath)}\r\n`)
          return false
        }
      },
    })
    client.emit('stdout', yellow('File restore complete.\r\n'))
    await new Promise(res => setTimeout(res, 1000))

    // Restore plugins
    client.emit('stdout', cyan('\r\nRestoring plugins...\r\n'))
    const plugins: HomebridgePlugin[] = (await readJson(resolve(this.restoreDirectory, 'plugins.json')))
      .filter((x: HomebridgePlugin) => ![
        'homebridge-config-ui-x',
      ].includes(x.name) && x.publicPackage) // list of plugins not to restore

    for (const plugin of plugins) {
      try {
        client.emit('stdout', yellow(`\r\nInstalling ${plugin.name}...\r\n`))
        await this.pluginsService.managePlugin('install', { name: plugin.name, version: plugin.installedVersion }, client)
      } catch (e) {
        client.emit('stdout', red(`Failed to install ${plugin.name}.\r\n`))
      }
    }

    // Load restored config
    const restoredConfig: HomebridgeConfig = await readJson(this.configService.configPath)

    // Ensure the bridge port does not change
    if (restoredConfig.bridge) {
      restoredConfig.bridge.port = this.configService.homebridgeConfig.bridge.port
    }

    // Check the bridge.bind config contains valid interface names
    if (restoredConfig.bridge.bind) {
      await this.checkBridgeBindConfig(restoredConfig)
    }

    // Ensure platforms in an array
    if (!Array.isArray(restoredConfig.platforms)) {
      restoredConfig.platforms = []
    }

    // Load the ui config block
    const uiConfigBlock = restoredConfig.platforms.find(x => x.platform === 'config')

    if (uiConfigBlock) {
      uiConfigBlock.port = this.configService.ui.port
    } else {
      restoredConfig.platforms.push({
        name: 'Config',
        port: this.configService.ui.port,
        platform: 'config',
      })
    }

    // Save the config (atomic write under the JSON store lock so a
    // crash mid-write doesn't leave config.json half-truncated).
    await this.jsonStore.write(this.configService.configPath, restoredConfig)

    // Remove temp files
    await this.removeRestoreDirectory()

    client.emit('stdout', green('\r\nRestore Complete!\r\n'))

    // Ensure ui is restarted on next restart
    this.configService.hbServiceUiRestartRequired = true

    // Auto restart if told to
    if (autoRestart) {
      this.postBackupRestoreRestart()
    }

    return { status: 0 }
  }

  /**
   * Upload a .hbfx backup file
   */
  async uploadHbfxRestore(data: MultipartFile) {
    // Reserve the singleton restore slot before any await so a concurrent
    // upload loses the race and 409s.
    this.reserveRestoreSlot()

    try {
      // Prepare a temp working directory
      const backupDir = await mkdtemp(join(tmpdir(), 'homebridge-backup-'))

      this.logger.log(`Extracting .hbfx file to ${backupDir}.`)

      // Pipe the data through a path-validating extractor so a crafted .hbfx
      // can't write outside backupDir (Zip Slip).
      await this.extractZipSafely(data.file, backupDir)

      this.restoreDirectory = backupDir
    } catch (err) {
      this.restoreDirectory = undefined
      throw err
    }
  }

  /**
   * Restore .hbfx backup file
   */
  async restoreHbfxBackup(client: EventEmitter) {
    if (!this.restoreDirectory || this.restoreDirectory === RESTORE_PENDING) {
      throw new BadRequestException()
    }

    // Check package.json exists
    if (!await pathExists(resolve(this.restoreDirectory, 'package.json'))) {
      await this.removeRestoreDirectory()
      throw new Error('Uploaded file is not a valid HBFX Backup Archive.')
    }

    // Check config.json exists
    if (!await pathExists(resolve(this.restoreDirectory, 'etc', 'config.json'))) {
      await this.removeRestoreDirectory()
      throw new Error('Uploaded file is not a valid HBFX Backup Archive.')
    }

    // Defence-in-depth — reject the archive if any extracted entry is a
    // symlink.
    try {
      await this.assertNoSymlinks(this.restoreDirectory)
    } catch (err) {
      await this.removeRestoreDirectory()
      throw err
    }

    // Load package.json
    const backupInfo = await readJson(resolve(this.restoreDirectory, 'package.json'))

    // Display backup archive information
    client.emit('stdout', cyan('Backup Archive Information\r\n'))
    client.emit('stdout', `Backup Source: ${backupInfo.name}\r\n`)
    client.emit('stdout', `Version: v${backupInfo.version}\r\n`)

    // Start restore
    this.logger.warn('Starting hbfx restore...')
    client.emit('stdout', cyan('\r\nRestoring hbfx backup...\r\n\r\n'))
    await new Promise(res => setTimeout(res, 1000))

    // Resolve the real path of the storage directory (in case it's a symbolic link)
    const storagePath = await realpath(this.configService.storagePath)

    // Restore files
    client.emit('stdout', yellow(`Restoring Homebridge storage to ${storagePath}\r\n`))
    await copy(resolve(this.restoreDirectory, 'etc'), resolve(storagePath), {
      filter: (filePath) => {
        if (
          [
            'access.json',
            'dashboard.json',
            'layout.json',
            'config.json',
          ].includes(basename(filePath))
        ) {
          return false
        }
        client.emit('stdout', `Restoring ${basename(filePath)}\r\n`)
        return true
      },
    })

    // Restore accessories
    const sourceAccessoriesPath = resolve(this.restoreDirectory, 'etc', 'accessories')
    const targetAccessoriesPath = resolve(storagePath, 'accessories')
    if (await pathExists(sourceAccessoriesPath)) {
      await copy(sourceAccessoriesPath, targetAccessoriesPath, {
        filter: (filePath) => {
          client.emit('stdout', `Restoring ${basename(filePath)}\r\n`)
          return true
        },
      })
    }

    // Load source config.json
    const sourceConfig = await readJson(resolve(this.restoreDirectory, 'etc', 'config.json'))

    // Map hbfx plugins to homebridge plugins
    const pluginMap = {
      'hue': 'homebridge-hue',
      'chamberlain': 'homebridge-chamberlain',
      'google-home': 'homebridge-gsh',
      'ikea-tradfri': 'homebridge-ikea-tradfri-gateway',
      'nest': 'homebridge-nest',
      'ring': 'homebridge-ring',
      'roborock': 'homebridge-roborock',
      'shelly': 'homebridge-shelly',
      'wink': 'homebridge-wink3',
      'homebridge-tuya-web': '@milo526/homebridge-tuya-web',
    }

    // Install plugins
    if (sourceConfig.plugins?.length) {
      for (let plugin of sourceConfig.plugins) {
        if (plugin in pluginMap) {
          plugin = pluginMap[plugin]
        }
        try {
          client.emit('stdout', yellow(`\r\nInstalling ${plugin}...\r\n`))
          await this.pluginsService.managePlugin('install', { name: plugin, version: 'latest' }, client)
        } catch (e) {
          client.emit('stdout', red(`Failed to install ${plugin}.\r\n`))
        }
      }
    }

    // Clone elements from the source config that we care about
    const targetConfig: HomebridgeConfig = JSON.parse(JSON.stringify({
      bridge: sourceConfig.bridge,
      accessories: sourceConfig.accessories?.map((x: any) => {
        delete x.plugin_map
        return x
      }) || [],
      platforms: sourceConfig.platforms?.map((x: any) => {
        if (x.platform === 'google-home') {
          x.platform = 'google-smarthome'
          x.notice = 'Keep your token a secret!'
        }
        delete x.plugin_map
        return x
      }) || [],
    }))

    // Correct bridge name
    targetConfig.bridge.name = `Homebridge ${targetConfig.bridge.username.substring(targetConfig.bridge.username.length - 5).replace(RE_COLON, '')}`

    // Check the bridge.bind config contains valid interface names
    if (targetConfig.bridge.bind) {
      await this.checkBridgeBindConfig(targetConfig)
    }

    // Add config ui platform
    targetConfig.platforms.push({
      ...this.configService.ui,
      platform: 'config',
    })

    // Save the config (atomic write under the JSON store lock).
    await this.jsonStore.write(this.configService.configPath, targetConfig)

    // Remove temp files
    await this.removeRestoreDirectory()

    client.emit('stdout', green('\r\nRestore Complete!\r\n'))

    // Ensure ui is restarted on next restart
    this.configService.hbServiceUiRestartRequired = true

    return { status: 0 }
  }

  /**
   * Send SIGKILL to Homebridge to prevent accessory cache being re-generated on shutdown
   */
  postBackupRestoreRestart() {
    setTimeout(async () => {
      // Kill homebridge first. If `kill()` returns false the signal
      // didn't land — Homebridge is still running. Self-killing the
      // UI from that state would leave Homebridge alive on the OLD
      // pre-restore config and the service supervisor would bring the
      // UI back up to a mismatched setup.
      const delivered = await this.homebridgeIpcService.killHomebridge()
      if (!delivered) {
        this.logger.error('Skipping UI self-kill: Homebridge SIGKILL was not delivered.')
        return
      }

      // Kill self
      setTimeout(() => {
        process.kill(process.pid, 'SIGKILL')
      }, 500)
    }, 500)

    return { status: 0 }
  }

  /**
   * Checks the 'bridge.bind' options are valid for the current system when restoring.
   */
  private async checkBridgeBindConfig(restoredConfig: HomebridgeConfig) {
    if (restoredConfig.bridge.bind) {
      // If it's a string, convert to an array
      if (typeof restoredConfig.bridge.bind === 'string') {
        restoredConfig.bridge.bind = [restoredConfig.bridge.bind]
      }

      // If it's still not an array, delete it
      if (!Array.isArray(restoredConfig.bridge.bind)) {
        delete restoredConfig.bridge.bind
        return
      }

      // Check each interface exists on the new host
      const interfaces = await networkInterfaces()
      const ifaceNames = interfaces.map(i => i.iface)
      restoredConfig.bridge.bind = restoredConfig.bridge.bind.filter(x => ifaceNames.includes(x))

      // If empty delete
      if (!restoredConfig.bridge.bind.length) {
        delete restoredConfig.bridge.bind
      }
    }
  }
}
