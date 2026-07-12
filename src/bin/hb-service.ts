#!/usr/bin/env node
/* global NodeJS */
/* eslint-disable no-console */
/**
 * The purpose of this file is to run and install homebridge and homebridge-config-ui-x as a service
 */

import type { ChildProcessWithoutNullStreams, ForkOptions } from 'node:child_process'
import type { PathLike, WriteStream } from 'node:fs'
import type { TarOptionsWithAliases } from 'tar'

import type { HomebridgeIpcService } from '../core/homebridge-ipc/homebridge-ipc.service.js'
import type { BasePlatform } from './base-platform.js'

import { Buffer } from 'node:buffer'
import { execFileSync, execSync, fork } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { chownSync, createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdtemp, open, readFile, rename, stat } from 'node:fs/promises'
import { arch, cpus, homedir, platform, release, tmpdir, type } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'

import axios from 'axios'
import { program } from 'commander'
import { mkdirp, pathExists, pathExistsSync, readJson, readJsonSync, remove, writeJson } from 'fs-extra/esm'
import ora from 'ora'
import { gt, gte, parse } from 'semver'
import { networkInterfaceDefault, networkInterfaces } from 'systeminformation'
import { Tail } from 'tail'
import { extract } from 'tar'
import { check as tcpCheck } from 'tcp-port-used'

import { RE_COLON, RE_NON_SCOPED, RE_PLUGIN_NAME, RE_SCOPED, RE_SERVICE_NAME } from '../core/regex.constants.js'
import { DarwinInstaller } from './platforms/darwin.js'
import { FreeBSDInstaller } from './platforms/freebsd.js'
import { LinuxInstaller } from './platforms/linux.js'
import { Win32Installer } from './platforms/win32.js'

process.title = 'hb-service'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

type Action = 'install' | 'uninstall' | 'start' | 'stop' | 'restart' | 'rebuild' | 'run' | 'add' | 'remove' | 'logs' | 'view' | 'update-node' | 'update-homebridge' | 'before-start' | 'status'

class Logger {
  constructor(
    private readonly action: Action,
    private readonly logFile: WriteStream | NodeJS.WriteStream,
  ) { }

  log(msg: string) {
    this._log(msg, 'info')
  }

  success(msg: string) {
    this._log(msg, 'success')
  }

  error(msg: string) {
    this._log(msg, 'error')
  }

  warn(msg: string) {
    this._log(msg, 'warn')
  }

  debug(msg: string) {
    this._log(msg, 'debug')
  }

  verbose(msg: string) {
    this._log(msg, 'verbose')
  }

  private _log(msg: string, level: 'info' | 'success' | 'error' | 'warn' | 'debug' | 'verbose') {
    if (this.action === 'run') {
      msg = `\x1B[37m[${new Date().toLocaleString()}]\x1B[0m `
        + `\x1B[36m[HB Supervisor]\x1B[0m [${level.toUpperCase()}] ${msg}`

      if (this.logFile) {
        this.logFile.write(`${msg}\n`)
      } else {
        console.log(msg)
      }
    } else {
      let oraLevel: 'info' | 'succeed' | 'fail' | 'warn'
      switch (level) {
        case 'info':
        case 'debug':
        case 'verbose':
          oraLevel = 'info'
          break
        case 'success':
          oraLevel = 'succeed'
          break
        case 'error':
          oraLevel = 'fail'
          break
        case 'warn':
          oraLevel = 'warn'
          break
      }

      ora()[oraLevel](msg)
    }
  }
}

export class HomebridgeServiceHelper {
  public action: Action
  public selfPath = __filename
  public serviceName = 'Homebridge'
  public storagePath: string
  public usingCustomStoragePath = false
  public allowRunRoot = false
  public enableHbServicePluginManagement = false
  public asUser: string
  public addGroup: string
  public _logger: Logger
  private logFile: WriteStream | NodeJS.WriteStream
  private homebridgeModulePath: string
  private homebridgePackage: { version: string, bin: { homebridge: string } }
  private homebridgeBinary: string
  private homebridge: ChildProcessWithoutNullStreams
  private homebridgeOpts = ['-I']
  private homebridgeCustomEnv = {}
  private uiBinary: string

  // Send logs to stdout instead of the homebridge.log
  private stdout: boolean

  // homebridge/docker-homebridge options
  public docker: boolean
  private uid: number
  private gid: number

  public uiPort = 8581

  private installer: BasePlatform

  // UI services
  private ipcService: HomebridgeIpcService

  get logPath(): string {
    return resolve(this.storagePath, 'homebridge.log')
  }

  get logger(): Logger {
    if (!this._logger) {
      this._logger = new Logger(this.action, this.logFile)
    }
    return this._logger
  }

  constructor() {
    // Check the node.js version
    this.nodeVersionCheck()

    // Select the installer for the current platform
    switch (platform()) {
      case 'linux':
        this.installer = new LinuxInstaller(this)
        break
      case 'win32':
        this.installer = new Win32Installer(this)
        break
      case 'darwin':
        this.installer = new DarwinInstaller(this)
        break
      case 'freebsd':
        this.installer = new FreeBSDInstaller(this)
        break
      default:
        this.logger.error(`ERROR: This command is not supported on ${platform()}.`)
        process.exit(1)
    }

    program
      .allowUnknownOption()
      .allowExcessArguments()
      .storeOptionsAsProperties(true)
      .arguments('[install|uninstall|start|stop|restart|rebuild|run|logs|view|add|remove]')
      .option('-P, --plugin-path <path>', '', (p) => {
        process.env.UIX_CUSTOM_PLUGIN_PATH = p
        this.homebridgeOpts.push('-P', p)
      })
      .option('-U, --user-storage-path <path>', '', (p) => {
        this.storagePath = p
        this.usingCustomStoragePath = true
      })
      .option('-S, --service-name <service name>', 'The name of the homebridge service to install or control', p => this.serviceName = p)
      .option('-T, --no-timestamp', '', () => this.homebridgeOpts.push('-T'))
      .option('--strict-plugin-resolution', '', () => {
        process.env.UIX_STRICT_PLUGIN_RESOLUTION = '1'
      })
      .option('--port <port>', 'The port to set to the Homebridge UI when installing as a service', p => this.uiPort = Number.parseInt(p, 10))
      .option('--user <user>', 'The user account the Homebridge service will be installed as (Linux, FreeBSD, macOS only)', p => this.asUser = p)
      .option('--group <group>', 'The group the Homebridge service will be added to (Linux, FreeBSD, macOS only)', p => this.addGroup = p)
      .option('--stdout', '', () => this.stdout = true)
      .option('--allow-root', '', () => this.allowRunRoot = true)
      .option('--docker', '', () => this.docker = true)
      .option('--uid <number>', '', i => this.uid = Number.parseInt(i, 10))
      .option('--gid <number>', '', i => this.gid = Number.parseInt(i, 10))
      .option('-v, --version', 'output the version number', () => this.showVersion())
      .action((cmd) => {
        this.action = cmd
      })
      .parse(process.argv)

    this.setEnv()

    switch (this.action) {
      case 'install': {
        this.nvmCheck()
        this.logger.log(`Installing ${this.serviceName} service...`)
        this.installer.install()
        break
      }
      case 'uninstall': {
        this.logger.log(`Removing ${this.serviceName} service...`)
        this.installer.uninstall()
        break
      }
      case 'start': {
        this.installer.start()
        break
      }
      case 'stop': {
        this.installer.stop()
        break
      }
      case 'restart': {
        this.logger.log(`Restarting ${this.serviceName} service...`)
        this.installer.restart()
        break
      }
      case 'rebuild': {
        this.logger.log(`Rebuilding for Node.js ${process.version}...`)
        this.installer.rebuild(program.args.includes('--all'))
        break
      }
      case 'run': {
        this.launch()
        break
      }
      case 'logs': {
        this.tailLogs()
        break
      }
      case 'view': {
        this.viewLogs()
        break
      }
      case 'add': {
        this.npmPluginManagement(program.args)
        break
      }
      case 'remove': {
        this.npmPluginManagement(program.args)
        break
      }
      case 'update-node': {
        this.checkForNodejsUpdates(program.args.length === 2 ? program.args[1] : null)
        break
      }
      case 'update-homebridge': {
        this.installer.updateHomebridgePackage()
        break
      }
      case 'before-start': {
        this.installer.beforeStart()
        break
      }
      case 'status': {
        this.checkStatus()
        break
      }
      default: {
        program.outputHelp()

        console.log('\nThe hb-service command is provided by homebridge-config-ui-x\n')
        console.log('Please provide a command:')
        console.log('    install                          install homebridge as a service')
        console.log('    uninstall                        remove the homebridge service')
        console.log('    start                            start the homebridge service')
        console.log('    stop                             stop the homebridge service')
        console.log('    restart                          restart the homebridge service')
        if (this.enableHbServicePluginManagement) {
          console.log('    add <plugin>@<version>           install a plugin')
          console.log('    remove <plugin>@<version>        remove a plugin')
        }
        console.log('    rebuild                          rebuild ui')
        console.log('    rebuild --all                    rebuild all npm modules (use after updating Node.js)')
        console.log('    run                              run homebridge daemon')
        console.log('    logs                             tails the homebridge service logs')
        console.log('    view                             views the homebridge service logs for 30 seconds')
        console.log('    update-node [version]            update Node.js')
        console.log('    update-homebridge                update Homebridge apt package')
        console.log('\nSee the wiki for help with hb-service: https://homebridge.io/w/JTtHK \n')

        process.exit(1)
      }
    }
  }

  /**
   * Sets the required environment variables passed on to the child processes
   */
  private setEnv() {
    // Ensure service name is valid
    if (!RE_SERVICE_NAME.test(this.serviceName)) {
      this.logger.error('Service name must not contain spaces or special characters.')
      process.exit(1)
    }

    // Setup default storage path
    if (!this.storagePath) {
      if (platform() === 'linux' || platform() === 'freebsd') {
        this.storagePath = resolve('/var/lib', this.serviceName.toLowerCase())
      } else {
        this.storagePath = resolve(homedir(), `.${this.serviceName.toLowerCase()}`)
      }
    }

    // Certain commands are not supported when running in Docker
    if (process.env.CONFIG_UI_VERSION && process.env.HOMEBRIDGE_VERSION && process.env.QEMU_ARCH) {
      if (platform() === 'linux' && ['install', 'uninstall', 'start', 'stop', 'restart', 'logs'].includes(this.action)) {
        this.logger.error(`Sorry, the ${this.action} command is not supported in Docker.`)
        process.exit(1)
      }
    }

    // Plugin management (install / uninstall) is only available when running as a package
    this.enableHbServicePluginManagement = (
      process.env.UIX_CUSTOM_PLUGIN_PATH
      && (Boolean(process.env.HOMEBRIDGE_SYNOLOGY_PACKAGE === '1') || Boolean(process.env.HOMEBRIDGE_APT_PACKAGE === '1'))
    )

    // Set Env Vars
    process.env.UIX_STORAGE_PATH = this.storagePath
    process.env.UIX_CONFIG_PATH = resolve(this.storagePath, 'config.json')
    process.env.UIX_BASE_PATH = process.env.UIX_BASE_PATH_OVERRIDE || resolve(__dirname, '../../')
    process.env.UIX_SERVICE_MODE = '1'
    process.env.UIX_INSECURE_MODE = '1'
  }

  /**
   * Outputs the package version number
   */
  private showVersion() {
    const pjson = readJsonSync(resolve(__dirname, '../../', 'package.json'))
    console.log(`v${pjson.version}`)
    process.exit(0)
  }

  /**
   * Opens the log file stream
   */
  private async startLog() {
    if (this.stdout === true) {
      this.logFile = process.stdout
      return
    }

    // Work out the log path
    this.logger.log(`Logging to ${this.logPath}.`)

    // Redirect all stdout to the log file
    this.logFile = createWriteStream(this.logPath, { flags: 'a' })
    process.stdout.write = process.stderr.write = this.logFile.write.bind(this.logFile)
  }

  private async readConfig() {
    return readJson(process.env.UIX_CONFIG_PATH)
  }

  /**
   * Truncate the log file to prevent large log files
   */
  private async truncateLog() {
    if (!(await pathExists(this.logPath))) {
      return
    }

    try {
      const currentConfig = await this.readConfig()
      const uiConfigBlock = currentConfig.platforms?.find(
        (x: any) => x.platform === 'config',
      )
      const maxSize = uiConfigBlock?.log?.maxSize ?? 1000000 // ~1 MB
      const truncateSize = uiConfigBlock?.log?.truncateSize ?? 200000 // ~0.2 MB

      if (maxSize < 0) {
        return
      }

      const logStats = await stat(this.logPath)

      if (logStats.size < maxSize) {
        return // log file does not need truncating
      }

      // Read out the last `truncatedSize` bytes to a buffer
      const logStartPosition = logStats.size - truncateSize
      const logBuffer = Buffer.alloc(truncateSize)
      const logFileHandle = await open(this.logPath, 'a+')

      // Cork the WriteStream `this.log` (the FD that process.stdout /
      // process.stderr are routed through) so concurrent log lines
      // don't interleave with the truncate-then-rewrite sequence.
      // Without the cork, lines emitted between truncate() and the
      // final write() land out of order — and on some filesystems
      // leave sparse \0 bytes between the truncated tail and the new
      // content.
      const corked = this.logFile && typeof (this.logFile as any).cork === 'function'
      if (corked) {
        (this.logFile as any).cork()
      }
      try {
        await logFileHandle.read(logBuffer, 0, truncateSize, logStartPosition)
        await logFileHandle.truncate()
        await logFileHandle.write(logBuffer)
      } finally {
        await logFileHandle.close()
        if (corked) {
          (this.logFile as any).uncork()
        }
      }
    } catch (e) {
      this.logger.error(`Failed to truncate log file: ${e.message}.`)
    }
  }

  /**
   * Launch script, starts homebridge and homebridge-config-ui-x
   */
  private async launch() {
    if (platform() !== 'win32' && process.getuid() === 0 && !this.allowRunRoot) {
      this.logger.log('The hb-service run command should not be executed as root.')
      this.logger.log('Use the --allow-root flag to force the service to run as the root user.')
      process.exit(0)
    }

    this.logger.log(`Homebridge storage path: ${this.storagePath}.`)
    this.logger.log(`Homebridge config path: ${process.env.UIX_CONFIG_PATH}.`)

    // Start the interval to truncate the logs every two hours
    setInterval(() => {
      this.truncateLog()
    }, (1000 * 60 * 60) * 2)

    // Pre-start
    try {
      // Check storage path exists
      await this.storagePathCheck()

      // Start logging to file
      await this.startLog()

      // Verify the config
      await this.configCheck()

      // Log os info
      this.logger.log(`OS: ${type()} ${release()} ${arch()}.`)
      this.logger.log(`Node.js ${process.version} ${process.execPath}.`)

      // Work out the homebridge binary path
      this.homebridgeBinary = await this.findHomebridgePath()
      this.logger.log(`Homebridge path: ${this.homebridgeBinary}.`)

      // Load startup options if they exist
      await this.loadHomebridgeStartupOptions()

      // Get the standalone ui binary on this system
      this.uiBinary = resolve(process.env.UIX_BASE_PATH, 'dist', 'bin', 'standalone.js')
      this.logger.log(`UI path: ${this.uiBinary}.`)
    } catch (e) {
      this.logger.log(e.message)
      process.exit(1)
    }

    // Start homebridge
    this.startExitHandler()

    // Start the ui
    await this.runUi()

    // Tell the ui what homebridge we are running initially (this is refreshed when Homebridge is restarted)
    if (this.ipcService && this.homebridgePackage) {
      this.ipcService.setHomebridgeVersion(this.homebridgePackage.version)
    }

    // Delay the launch of homebridge on Raspberry Pi 1/Zero by 20 seconds
    if (cpus().length === 1 && arch() === 'arm') {
      this.logger.log('Delaying Homebridge startup by 20 seconds on low powered server.')
      setTimeout(() => {
        this.runHomebridge()
      }, 20000)
    } else {
      this.runHomebridge()
    }
  }

  /**
   * Handles exit event
   */
  private startExitHandler() {
    const exitHandler = () => {
      this.logger.log('Stopping services...')
      try {
        this.homebridge.kill()
      } catch (e) {}

      setTimeout(() => {
        try {
          this.homebridge.kill('SIGKILL')
        } catch (e) {}
        process.exit(1282)
      }, 7000)
    }

    process.on('SIGTERM', exitHandler)
    process.on('SIGINT', exitHandler)
  }

  /**
   * Starts homebridge as a child process, sending the log output to the homebridge.log
   */
  private runHomebridge() {
    if (!this.homebridgeBinary || !pathExistsSync(this.homebridgeBinary)) {
      this.logger.error('Could not find Homebridge. Make sure you have installed Homebridge using the -g flag then restart.')
      this.logger.error('npm install -g --unsafe-perm homebridge')
      return
    }

    if (process.env.UIX_STRICT_PLUGIN_RESOLUTION === '1') {
      if (!this.homebridgeOpts.includes('--strict-plugin-resolution')) {
        this.homebridgeOpts.push('--strict-plugin-resolution')
      }
    }

    if (this.homebridgeOpts.length) {
      this.logger.log(`Starting Homebridge with extra flags: ${this.homebridgeOpts.join(' ')}.`)
    }

    if (Object.keys(this.homebridgeCustomEnv).length) {
      this.logger.log(`Starting Homebridge with custom env: ${JSON.stringify(this.homebridgeCustomEnv)}.`)
    }

    // Env setup
    const env = {}
    Object.assign(env, process.env)
    Object.assign(env, this.homebridgeCustomEnv)

    // Child process spawn options
    const childProcessOpts: ForkOptions = {
      env,
      silent: true,
    }

    // Spawn homebridge as a different user (probably for docker)
    if (this.allowRunRoot && this.uid && this.gid) {
      childProcessOpts.uid = this.uid
      childProcessOpts.gid = this.gid
    }

    // Fix docker permission if running on docker
    if (this.docker) {
      this.fixDockerPermissions()
    }

    // Launch the homebridge process
    this.homebridge = fork(this.homebridgeBinary, [
      '-C',
      '-Q',
      '-U',
      this.storagePath,
      ...this.homebridgeOpts,
    ], childProcessOpts)

    // Let the ipc service know of the new process
    if (this.ipcService) {
      this.ipcService.setHomebridgeProcess(this.homebridge)
      this.ipcService.setHomebridgeVersion(this.homebridgePackage.version)
    }

    this.logger.log(`Started Homebridge v${this.homebridgePackage.version} with PID: ${this.homebridge.pid}.`)

    // Buffer per-stream output and flush whole lines so concurrent
    // stdout/stderr writes don't interleave mid-line in the log file.
    const outDecoder = new StringDecoder('utf8')
    const errDecoder = new StringDecoder('utf8')
    let outBuf = ''
    let errBuf = ''
    const flushLines = (key: 'out' | 'err') => {
      const buf = key === 'out' ? outBuf : errBuf
      let consumed = 0
      let idx = buf.indexOf('\n', consumed)
      while (idx !== -1) {
        this.logFile.write(buf.slice(consumed, idx + 1))
        consumed = idx + 1
        idx = buf.indexOf('\n', consumed)
      }
      const remainder = buf.slice(consumed)
      if (key === 'out') {
        outBuf = remainder
      } else {
        errBuf = remainder
      }
    }

    this.homebridge.stdout.on('data', (data) => {
      outBuf += outDecoder.write(data)
      flushLines('out')
    })

    this.homebridge.stderr.on('data', (data) => {
      errBuf += errDecoder.write(data)
      flushLines('err')
    })

    this.homebridge.on('close', (code, signal) => {
      outBuf += outDecoder.end()
      errBuf += errDecoder.end()
      if (outBuf) {
        this.logFile.write(outBuf.endsWith('\n') ? outBuf : `${outBuf}\n`)
        outBuf = ''
      }
      if (errBuf) {
        this.logFile.write(errBuf.endsWith('\n') ? errBuf : `${errBuf}\n`)
        errBuf = ''
      }
      this.handleHomebridgeClose(code, signal)
    })
  }

  /**
   * Ensures homebridge is restarted automatically if it crashed or was stopped
   * @param code
   * @param signal
   */
  private handleHomebridgeClose(code: number, signal: string) {
    this.logger.log(`Homebridge process ended. Code: ${code}, signal: ${signal}.`)

    this.checkForStaleHomebridgeProcess()
    this.refreshHomebridgePackage()

    setTimeout(() => {
      this.logger.log('Restarting Homebridge...')
      this.runHomebridge()
    }, 5000)
  }

  /**
   * Start the user interface
   */
  private async runUi() {
    try {
      // Import main module
      const main = await import('../main.js')

      // Load the nest js instance
      const ui = await main.app

      // Extract services
      this.ipcService = ui.get(main.HomebridgeIpcService)
    } catch (e) {
      this.logger.log('The user interface threw an unhandled error.')
      console.error(e)

      setTimeout(() => {
        process.exit(1)
      }, 4500)

      if (this.homebridge) {
        this.homebridge.kill()
      }
    }
  }

  /**
   * Get the global npm directory
   */
  private async getNpmGlobalModulesDirectory() {
    try {
      const npmPrefix = execSync('npm -g prefix', {
        env: {
          npm_config_loglevel: 'silent',
          npm_update_notifier: 'false',
          ...process.env,
        },
      }).toString('utf8').trim()
      return platform() === 'win32' ? join(npmPrefix, 'node_modules') : join(npmPrefix, 'lib', 'node_modules')
    } catch (e) {
      return null
    }
  }

  /**
   * Finds the homebridge binary
   */
  private async findHomebridgePath() {
    // Check the folder directly above
    const nodeModules = resolve(process.env.UIX_BASE_PATH, '..')
    if (await pathExists(resolve(nodeModules, 'homebridge', 'package.json'))) {
      this.homebridgeModulePath = resolve(nodeModules, 'homebridge')
    }

    // Check the global npm modules directory
    if (!this.homebridgeModulePath && !(process.env.UIX_STRICT_PLUGIN_RESOLUTION === '1' && process.env.UIX_CUSTOM_PLUGIN_PATH)) {
      const globalModules = await this.getNpmGlobalModulesDirectory()
      if (globalModules && await pathExists(resolve(globalModules, 'homebridge'))) {
        this.homebridgeModulePath = resolve(globalModules, 'homebridge')
      }
    }

    // Check the custom plugins path
    if (!this.homebridgeModulePath && process.env.UIX_CUSTOM_PLUGIN_PATH) {
      if (await pathExists(resolve(process.env.UIX_CUSTOM_PLUGIN_PATH, 'homebridge', 'package.json'))) {
        this.homebridgeModulePath = resolve(process.env.UIX_CUSTOM_PLUGIN_PATH, 'homebridge')
      }
    }

    if (this.homebridgeModulePath) {
      try {
        await this.refreshHomebridgePackage()
        return resolve(this.homebridgeModulePath, this.homebridgePackage.bin.homebridge)
      } catch (e) {
        console.log(e)
      }
    }

    return null
  }

  /**
   * Refresh the homebridge package.json
   */
  private async refreshHomebridgePackage() {
    try {
      if (await pathExists(this.homebridgeModulePath)) {
        this.homebridgePackage = await readJson(join(this.homebridgeModulePath, 'package.json'))
      } else {
        this.logger.error(`Homebridge not longer found at ${this.homebridgeModulePath}.`)
        this.homebridgeModulePath = undefined
        this.homebridgeBinary = await this.findHomebridgePath()
        this.logger.log(`Found new Homebridge path: ${this.homebridgeBinary}.`)
      }
    } catch (e) {
      console.log(e)
    }
  }

  /**
   * Checks the current Node.js version is > 10
   */
  private nodeVersionCheck() {
    // 64 = v10;
    if (Number.parseInt(process.versions.modules, 10) < 64) {
      this.logger.error(`Node.js v10.13.0 or greater is required, current: ${process.version}.`)
      process.exit(1)
    }
  }

  /**
   * Show a warning if the user is trying to install with NVM on Linux
   */
  private nvmCheck() {
    if (process.execPath.includes('nvm') && platform() === 'linux') {
      this.logger.warn(
        'WARNING: It looks like you are running Node.js via NVM (Node Version Manager).\n'
        + '  Using hb-service with NVM may not work unless you have configured NVM for the\n'
        + '  user this service will run as. See https://homebridge.io/w/JUZ2g for instructions on how\n'
        + '  to remove NVM, then follow the wiki instructions to install Node.js and Homebridge.',
      )
    }
  }

  /**
   * Prints usage information to the screen after installations
   */
  public async printPostInstallInstructions() {
    const defaultAdapter = await networkInterfaceDefault()
    const defaultInterface = (await networkInterfaces()).find((x: any) => x.iface === defaultAdapter)

    console.log('\nManage Homebridge by going to one of the following in your browser:\n')

    console.log(`* http://localhost:${this.uiPort}`)

    if (defaultInterface && defaultInterface.ip4) {
      console.log(`* http://${defaultInterface.ip4}:${this.uiPort}`)
    }

    if (defaultInterface && defaultInterface.ip6) {
      console.log(`* http://[${defaultInterface.ip6}]:${this.uiPort}`)
    }

    console.log('')

    this.logger.success('Homebridge setup complete.')
  }

  /**
   * Checks if the port is currently in use by another process
   */
  public async portCheck() {
    const inUse = await tcpCheck(this.uiPort)
    if (inUse) {
      this.logger.error(`Port ${this.uiPort} is already in use by another process on this host.`)
      this.logger.error('You can specify another port using the --port flag, e.g.:')
      this.logger.error(`hb-service ${this.action} --port 8581`)
      process.exit(1)
    }
  }

  /**
   * Ensures the storage path defined exists
   */
  public async storagePathCheck() {
    if (platform() === 'darwin' && !await pathExists(dirname(this.storagePath))) {
      this.logger.error(`Cannot create Homebridge storage directory, base path does not exist: ${dirname(this.storagePath)}.`)
      process.exit(1)
    }

    if (!await pathExists(this.storagePath)) {
      this.logger.log(`Creating Homebridge directory: ${this.storagePath}.`)
      await mkdirp(this.storagePath)
      await this.chownPath(this.storagePath)
    }
  }

  /**
   * Ensures the config.json exists and is valid.
   * If the config is not valid json it will be backed up and replaced with the default.
   */
  public async configCheck() {
    let saveRequired = false
    let restartRequired = false

    if (!await pathExists(process.env.UIX_CONFIG_PATH)) {
      this.logger.log(`Creating default config.json: ${process.env.UIX_CONFIG_PATH}.`)
      await this.createDefaultConfig()
      restartRequired = true
    }

    try {
      const currentConfig = await this.readConfig()

      // Extract ui config
      if (!Array.isArray(currentConfig.platforms)) {
        currentConfig.platforms = []
      }
      let uiConfigBlock = currentConfig.platforms.find((x: any) => x.platform === 'config')

      // If the config block does not exist, then create it
      if (!uiConfigBlock) {
        this.logger.log(`Adding missing UI platform block to ${process.env.UIX_CONFIG_PATH}.`)
        uiConfigBlock = await this.createDefaultUiConfig()
        currentConfig.platforms.push(uiConfigBlock)
        saveRequired = true
        restartRequired = true
      }

      // Ensure the port is set
      if (this.action !== 'install' && typeof uiConfigBlock.port !== 'number') {
        uiConfigBlock.port = await this.getLastKnownUiPort()
        this.logger.log(`Added missing port number to UI config: ${uiConfigBlock.port}.`)
        saveRequired = true
        restartRequired = true
      }

      // If doing an installation, make sure the port number matches the value passed in by the user
      if (this.action === 'install') {
        // Correct the port
        if (uiConfigBlock.port !== this.uiPort) {
          uiConfigBlock.port = this.uiPort
          this.logger.warn(`Homebridge UI port in ${process.env.UIX_CONFIG_PATH} changed to: ${this.uiPort}.`)
        }
        // Delete unnecessary config
        delete uiConfigBlock.restart
        delete uiConfigBlock.sudo
        delete uiConfigBlock.log
        saveRequired = true
      }

      // Ensure the ui port is defined and is a number
      if (typeof uiConfigBlock.port !== 'number') {
        uiConfigBlock.port = await this.getLastKnownUiPort()
        this.logger.log(`Added missing port number to UI config: ${uiConfigBlock.port}.`)
        saveRequired = true
        restartRequired = true
      }

      // Check the bridge section exists
      if (!currentConfig.bridge) {
        currentConfig.bridge = await this.generateBridgeConfig()
        this.logger.log('Added missing Homebridge bridge section to the config.json.')
        saveRequired = true
      }

      // Ensure port is set in bridge config
      if (!currentConfig.bridge.port) {
        currentConfig.bridge.port = await this.generatePort()
        this.logger.log(`Added port to the Homebridge bridge section of the config.json: ${currentConfig.bridge.port}.`)
        saveRequired = true
      }

      // Ensure bridge port is not the same as the UI port
      if ((uiConfigBlock && currentConfig.bridge.port === uiConfigBlock.port) || currentConfig.bridge.port === 8080) {
        currentConfig.bridge.port = await this.generatePort()
        this.logger.log(`Bridge port must not be the same as the UI port. Changing bridge port to: ${currentConfig.bridge.port}.`)
        saveRequired = true
      }

      // Ensure homebridge-config-ui-x is enabled if the plugins array is set
      if (currentConfig.plugins && Array.isArray(currentConfig.plugins)) {
        if (!currentConfig.plugins.includes('homebridge-config-ui-x')) {
          currentConfig.plugins.push('homebridge-config-ui-x')
          this.logger.log('Added Homebridge UI to the plugins array in the config.json.')
          saveRequired = true
        }
      }

      if (saveRequired) {
        await writeJson(process.env.UIX_CONFIG_PATH, currentConfig, { spaces: 4 })
      }
    } catch (e) {
      const backupFile = resolve(this.storagePath, `config.json.invalid.${Date.now().toString()}`)
      this.logger.warn(`${process.env.UIX_CONFIG_PATH} does not contain valid JSON.`)
      this.logger.warn(`Invalid config.json file has been backed up to ${backupFile}.`)
      await rename(process.env.UIX_CONFIG_PATH, backupFile)
      await this.createDefaultConfig()
      restartRequired = true
    }

    // If the port number potentially changed, we need to restart here when running the
    // Raspbian image so the nginx config will be updated
    if (restartRequired && this.action === 'run' && await this.isRaspbianImage()) {
      this.logger.log('Restarting process after port number update.')
      process.exit(1)
    }
  }

  /**
   * Creates the default config.json
   */
  public async createDefaultConfig() {
    await writeJson(process.env.UIX_CONFIG_PATH, {
      bridge: await this.generateBridgeConfig(),
      accessories: [],
      platforms: [
        await this.createDefaultUiConfig(),
      ],
    }, { spaces: 4 })
    await this.chownPath(process.env.UIX_CONFIG_PATH)
  }

  /**
   * Create a default Homebridge bridge config
   */
  private async generateBridgeConfig() {
    const username = this.generateUsername()
    const port = await this.generatePort()
    const name = `Homebridge ${username.substring(username.length - 5).replace(RE_COLON, '')}`
    const pin = this.generatePin()
    const advertiser = await this.isAvahiDaemonRunning() ? 'avahi' : 'bonjour-hap'

    return {
      name,
      username,
      port,
      pin,
      advertiser,
    }
  }

  /**
   * Create the default ui config
   */
  private async createDefaultUiConfig() {
    return {
      name: 'Config',
      port: this.action === 'install' ? this.uiPort : await this.getLastKnownUiPort(),
      platform: 'config',
    }
  }

  /**
   * Returns true if running on the Homebridge Raspbian Image
   */
  private async isRaspbianImage(): Promise<boolean> {
    return platform() === 'linux' && await pathExists('/etc/hb-ui-port')
  }

  /**
   * Check what the last known UI port was
   * Used when the ui config block is deleted and needs to be recreated
   */
  private async getLastKnownUiPort() {
    // Check if we are running the raspbian image, the port will be stored in /etc/hb-ui-port
    if (await this.isRaspbianImage()) {
      const lastPort = Number.parseInt((await readFile('/etc/hb-ui-port', 'utf8')), 10)
      if (!Number.isNaN(lastPort) && lastPort <= 65535) {
        return lastPort
      }
    }

    // Check if the port is defined in an env var (docker)
    const envPort = Number.parseInt(process.env.HOMEBRIDGE_CONFIG_UI_PORT, 10)
    if (!Number.isNaN(envPort) && envPort <= 65535) {
      return envPort
    }

    // Otherwise return the default port
    return this.uiPort
  }

  /**
   * Generates a new random pin
   */
  private generatePin() {
    let code: string | Array<any> = `${randomInt(10000000, 100000000)}`
    code = code.split('')
    code.splice(3, 0, '-')
    code.splice(6, 0, '-')
    code = code.join('')
    return code
  }

  /**
   * Generates a new random username
   */
  private generateUsername() {
    const hexDigits = '0123456789ABCDEF'
    let username = '0E:'
    for (let i = 0; i < 5; i += 1) {
      username += hexDigits.charAt(randomInt(0, 16))
      username += hexDigits.charAt(randomInt(0, 16))
      if (i !== 4) {
        username += ':'
      }
    }
    return username
  }

  /**
   * Generate a random port for Homebridge
   */
  private async generatePort() {
    const randomPort = () => randomInt(51000, 52001)

    let port = randomPort()
    while (await tcpCheck(port)) {
      port = randomPort()
    }

    return port
  }

  private avahiDaemonRunning: boolean | undefined

  /**
   * Test to see if the avahi-daemon service is running
   * @returns boolean true if the avahi-daemon service is running
   */
  private async isAvahiDaemonRunning(): Promise<boolean> {
    if (this.avahiDaemonRunning !== undefined) {
      return this.avahiDaemonRunning
    }
    if (platform() !== 'linux') {
      this.avahiDaemonRunning = false
      return false
    }
    if (!await pathExists('/etc/avahi/avahi-daemon.conf') || !await pathExists('/usr/bin/systemctl')) {
      this.avahiDaemonRunning = false
      return false
    }
    try {
      if (await pathExists('/usr/lib/systemd/system/avahi.service')) {
        execSync('systemctl is-active --quiet avahi 2> /dev/null')
        this.avahiDaemonRunning = true
        return true
      } else if (await pathExists('/lib/systemd/system/avahi-daemon.service')) {
        execSync('systemctl is-active --quiet avahi-daemon 2> /dev/null')
        this.avahiDaemonRunning = true
        return true
      } else {
        this.avahiDaemonRunning = false
        return false
      }
    } catch (e) {
      this.avahiDaemonRunning = false
      return false
    }
  }

  /**
   * Corrects the permissions on files when running the hb-service command using sudo
   */
  private async chownPath(pathToChown: PathLike) {
    if (platform() !== 'win32' && process.getuid() === 0) {
      const { uid, gid } = await this.installer.getId()
      chownSync(pathToChown, uid, gid)
    }
  }

  /**
   * Checks to see if there are stale homebridge processes running on the same port
   */
  private async checkForStaleHomebridgeProcess() {
    if (platform() === 'win32') {
      return
    }
    try {
      // Load the config to get the homebridge port
      const currentConfig = await this.readConfig()
      if (!currentConfig.bridge || !currentConfig.bridge.port) {
        return
      }

      // Check if port is still in use
      if (!await tcpCheck(Number.parseInt(currentConfig.bridge.port.toString(), 10))) {
        return
      }

      // Find the pid of the process using the port
      const pid = Number.parseInt(this.installer.getPidOfPort(Number.parseInt(currentConfig.bridge.port.toString(), 10)), 10)
      if (!pid) {
        return
      }

      // Kill the stale Homebridge process
      this.logger.log(`Found stale Homebridge process running on port: ${currentConfig.bridge.port}, with PID: ${pid}, killing...`)
      process.kill(pid, 'SIGKILL')
    } catch (e) {
      // Do nothing
    }
  }

  /**
   * Tails the Homebridge service log and outputs the results to the console
   */
  private async tailLogs() {
    if (!existsSync(this.logPath)) {
      this.logger.error(`Log file does not exist at expected location: ${this.logPath}.`)
      process.exit(1)
    }

    const logStats = await stat(this.logPath)
    const logStartPosition = logStats.size <= 200000 ? 0 : logStats.size - 200000
    const logStream = createReadStream(this.logPath, { start: logStartPosition })

    logStream.on('data', (buffer) => {
      process.stdout.write(buffer)
    })

    logStream.on('end', () => {
      logStream.close()
    })

    const tail = new Tail(this.logPath, {
      fromBeginning: false,
      useWatchFile: true,
      fsWatchOptions: {
        interval: 200,
      },
    })

    tail.on('line', console.log)
  }

  /**
   * Tails the Homebridge service log for 30 seconds and outputs the results to the console
   */
  private async viewLogs() {
    this.installer.viewLogs()
    if (!existsSync(this.logPath)) {
      this.logger.error(`Log file does not exist at expected location: ${this.logPath}.`)
      process.exit(1)
    }

    const logStats = await stat(this.logPath)
    const logStartPosition = logStats.size <= 200000 ? 0 : logStats.size - 200000
    const logStream = createReadStream(this.logPath, { start: logStartPosition })

    logStream.on('data', (buffer) => {
      process.stdout.write(buffer)
    })

    logStream.on('end', () => {
      logStream.close()
    })

    const tail = new Tail(this.logPath, {
      fromBeginning: false,
      useWatchFile: true,
      fsWatchOptions: {
        interval: 200,
      },
    })

    tail.on('line', console.log)

    setTimeout(() => {
      tail.unwatch()
    }, 30000)
  }

  /**
   * Returns the path of the homebridge startup settings file
   */
  get homebridgeStartupOptionsPath() {
    return resolve(this.storagePath, '.uix-hb-service-homebridge-startup.json')
  }

  /**
   * Get the Homebridge startup options defined in the UI
   */
  private async loadHomebridgeStartupOptions() {
    try {
      if (await pathExists(this.homebridgeStartupOptionsPath)) {
        const homebridgeStartupOptions = await readJson(this.homebridgeStartupOptionsPath)

        // Check if debug should be enabled
        if (homebridgeStartupOptions.debugMode && !this.homebridgeOpts.includes('-D')) {
          this.homebridgeOpts.push('-D')
        }

        // Check if keep orphans should be enabled
        if (homebridgeStartupOptions.keepOrphans && !this.homebridgeOpts.includes('-K')) {
          this.homebridgeOpts.push('-K')
        }

        // Insecure mode is enabled by default, allow it to be removed if set to false
        if (homebridgeStartupOptions.insecureMode === false && this.homebridgeOpts.includes('-I')) {
          this.homebridgeOpts.splice(this.homebridgeOpts.findIndex(x => x === '-I'), 1)
          process.env.UIX_INSECURE_MODE = '0'
        }

        // Copy any custom env vars in
        Object.assign(this.homebridgeCustomEnv, homebridgeStartupOptions.env)
      } else if (this.docker) {
        // Check old docker flag for debug mode
        if (process.env.HOMEBRIDGE_DEBUG === '1' && !this.homebridgeOpts.includes('-D')) {
          this.homebridgeOpts.push('-D')
        }

        // Check old docker flag for insecure mode
        if (process.env.HOMEBRIDGE_INSECURE !== '1' && this.homebridgeOpts.includes('-I')) {
          this.homebridgeOpts.splice(this.homebridgeOpts.findIndex(x => x === '-I'), 1)
          process.env.UIX_INSECURE_MODE = '0'
        }
      }
    } catch (e) {
      this.logger.log(`Failed to load startup options as ${e.message}.`)
    }
  }

  /**
   * Fix the permission on the docker storage directory
   * This is only used when running in the homebridge/docker-homebridge docker container
   */
  private fixDockerPermissions() {
    try {
      execSync(`chown -R ${this.uid}:${this.gid} "${this.storagePath}"`)
    } catch (e) {
      // Do nothing
    }
  }

  /**
   * Check to see if Node.js version updates are available.
   * Prefer LTS versions
   * If current version is > LTS, update to the latest version while retaining the major version number
   */
  private async checkForNodejsUpdates(requestedVersion: string) {
    const versionList = (await axios.get('https://nodejs.org/dist/index.json')).data

    // Check response is valid array
    if (!Array.isArray(versionList)) {
      this.logger.error('Failed to check for Node.js updates.')
      return { update: false }
    }

    // Filter out non-LTS versions and find the latest LTS version
    const currentLts = versionList.filter(x => x.lts)[0]

    if (requestedVersion) {
      const wantedVersion = versionList.find(x => x.version.startsWith(`v${requestedVersion}`))
      if (wantedVersion) {
        // Check the requested version is greater than v22.12.0
        if (!gte(wantedVersion.version, '22.12.0')) {
          this.logger.error('Refusing to install Node.js version lower than v22.12.0.')
          return { update: false }
        }
        this.logger.log(`Installing Node.js ${wantedVersion.version} over ${process.version}...`)
        return this.installer.updateNodejs({
          target: wantedVersion.version,
          rebuild: wantedVersion.modules !== process.versions.modules,
        })
      } else {
        this.logger.log(`v${requestedVersion} is not a valid Node.js version.`)
        return { update: false }
      }
    }

    if (gt(currentLts.version, process.version)) {
      this.logger.log(`Updating Node.js from ${process.version} to ${currentLts.version}...`)
      return this.installer.updateNodejs({
        target: currentLts.version,
        rebuild: currentLts.modules !== process.versions.modules,
      })
    }

    const currentMajor = parse(process.version).major
    const latestVersion = versionList.filter(x => parse(x.version).major === currentMajor)[0]

    if (gt(latestVersion.version, process.version)) {
      this.logger.log(`Updating Node.js from ${process.version} to ${latestVersion.version}...`)
      return this.installer.updateNodejs({
        target: latestVersion.version,
        rebuild: latestVersion.modules !== process.versions.modules,
      })
    }

    this.logger.log(`Node.js ${process.version} already up-to-date.`)

    return { update: false }
  }

  /**
   * Download the Node.js binary to a temp file
   */
  public async downloadNodejs(downloadUrl: string): Promise<string> {
    const spinner = ora(`Downloading ${downloadUrl}`).start()

    try {
      const tempDir = await mkdtemp(join(tmpdir(), 'node'))
      const tempFilePath = join(tempDir, 'node.tar.gz')
      const tempFile = createWriteStream(tempFilePath)

      await axios.get(downloadUrl, { responseType: 'stream' })
        .then((response) => {
          return new Promise((res, rej) => {
            response.data.pipe(tempFile).on('finish', () => {
              return res(tempFile)
            }).on('error', (err: Error) => {
              return rej(err)
            })
          })
        })

      spinner.succeed('Download complete.')
      return tempFilePath
    } catch (e) {
      spinner.fail(e.message)
      process.exit(1)
    }
  }

  /**
   * Extract the Node.js tarball
   */
  public async extractNodejs(targetVersion: string, extractConfig: TarOptionsWithAliases) {
    const spinner = ora(`Installing Node.js ${targetVersion}`).start()

    try {
      await extract(extractConfig)
      spinner.succeed(`Installed Node.js ${targetVersion}`)
    } catch (e) {
      spinner.fail(e.message)
      process.exit(1)
    }
  }

  /**
   * Remove npm package
   */
  public async removeNpmPackage(npmInstallPath: string) {
    if (!await pathExists(npmInstallPath)) {
      return
    }

    const spinner = ora(`Cleaning up npm at ${npmInstallPath}...`).start()

    try {
      await remove(npmInstallPath)
      spinner.succeed(`Cleaned up npm at ${npmInstallPath}`)
    } catch (e) {
      spinner.fail(e.message)
    }
  }

  /**
   * Check the current status of the Homebridge UI by calling its API
   */
  private async checkStatus() {
    this.logger.log(`Testing hb-service is running on port ${this.uiPort}...`)

    try {
      const res = await axios.get(`http://localhost:${this.uiPort}/api`)
      if (res.data === 'Hello World!') {
        this.logger.success('Homebridge UI running.')
      } else {
        this.logger.error('Unexpected response.')
        process.exit(1)
      }
    } catch (e) {
      this.logger.error('Homebridge UI not running.')
      process.exit(1)
    }
  }

  /**
   * Parse an NPM package and version string
   * Based on: https://github.com/egoist/parse-package-name
   */
  private parseNpmPackageString(input: string) {
    const m = RE_SCOPED.exec(input) || RE_NON_SCOPED.exec(input)

    if (!m) {
      this.logger.error('Invalid plugin name.')
      process.exit(1)
    }

    return {
      name: m[1] || '',
      version: m[2] || 'latest',
      path: m[3] || '',
    }
  }

  /**
   * Install / Remove a plugin (supported platforms only)
   */
  private async npmPluginManagement(args: any[]) {
    if (!this.enableHbServicePluginManagement) {
      this.logger.error('Plugin management is not supported on your platform using hb-service.')
      process.exit(1)
    }

    if (args.length === 1) {
      this.logger.error('Plugin name required.')
      process.exit(1)
    }

    const action: 'add' | 'remove' = args[0]
    const target = this.parseNpmPackageString(args.at(-1))

    if (!target.name) {
      this.logger.error('Invalid plugin name.')
      process.exit(1)
    }

    if (!RE_PLUGIN_NAME.test(target.name)) {
      this.logger.error('Invalid plugin name.')
      process.exit(1)
    }

    // target.name is regex-validated upstream; target.version isn't —
    // the parser captures anything up to the next slash, so a string
    // like "1.0.0; rm -rf /" would otherwise reach the spawn unchecked.
    // Limit to semver-shaped strings and dist tags (alphanumerics,
    // dots, dashes, semver operators) before going near a spawn.
    const RE_NPM_VERSION_OR_TAG = /^[\w.\-^~>=<*|+]+$/
    if (!RE_NPM_VERSION_OR_TAG.test(target.version)) {
      this.logger.error(`Invalid plugin version "${target.version}".`)
      process.exit(1)
    }

    const cwd = dirname(process.env.UIX_CUSTOM_PLUGIN_PATH)

    if (!await pathExists(cwd)) {
      this.logger.error(`Path does not exist: ${cwd}.`)
    }

    const npmArgs = ['--prefix', cwd, action, action === 'add' ? `${target.name}@${target.version}` : target.name]

    this.logger.log(`CMD: npm ${npmArgs.join(' ')}`)

    try {
      // execFileSync (argv form, no shell) keeps target.name and
      // target.version out of any shell parser even if the validation
      // regexes ever loosen.
      execFileSync('npm', npmArgs, {
        cwd,
        stdio: 'inherit',
      })
      this.logger.success(`Installed ${target.name}@${target.version}.`)
    } catch (e) {
      this.logger.error(`Plugin installation failed as ${e.message}.`)
    }
  }
}

function bootstrap() {
  return new HomebridgeServiceHelper()
}

bootstrap()
