import { execFileSync, execSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { arch } from 'node:os'
import { resolve } from 'node:path'
import process from 'node:process'

import axios from 'axios'
import { pathExists, remove } from 'fs-extra/esm'

import { RE_SERVICE_NAME } from '../../core/regex.constants.js'
import { BasePlatform } from '../base-platform.js'

export class Win32Installer extends BasePlatform {
  /**
   * Installs the Windows 10 Homebridge Service
   */
  public async install() {
    this.checkIsAdmin()
    this.assertSafeServiceName()
    await this.hbService.portCheck()
    await this.hbService.storagePathCheck()
    await this.hbService.configCheck()

    // Download nssm.exe to help create the service
    const nssmPath: string = await this.downloadNssm()

    // Argument arrays — execFileSync handles quoting per-arg so shell
    // metacharacters in `storagePath` / `selfPath` cannot inject extra
    // tokens into the command line.
    const installArgs = [
      'install',
      this.hbService.serviceName,
      process.execPath,
      this.hbService.selfPath,
      'run',
      '-I',
      '-U',
      this.hbService.storagePath,
    ]
    const setUserDirArgs = [
      'set',
      this.hbService.serviceName,
      'AppEnvironmentExtra',
      `:UIX_STORAGE_PATH=${this.hbService.storagePath}`,
    ]

    try {
      execFileSync(nssmPath, installArgs)
      execFileSync(nssmPath, setUserDirArgs)
      await this.configureFirewall()
      await this.start()
      await this.hbService.printPostInstallInstructions()
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger.error('ERROR: Failed Operation')
    }
  }

  /**
   * Removes the Windows 10 Homebridge Service
   */
  public async uninstall() {
    this.checkIsAdmin()
    this.assertSafeServiceName()

    // Stop existing service
    await this.stop()

    try {
      execFileSync('sc', ['delete', this.hbService.serviceName])
      this.hbService.logger.success(`Removed ${this.hbService.serviceName} Service`)
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger.error('ERROR: Failed Operation')
    }
  }

  /**
   * Starts the Windows 10 Homebridge Service
   */
  public async start() {
    this.checkIsAdmin()
    this.assertSafeServiceName()

    try {
      this.hbService.logger.log(`Starting ${this.hbService.serviceName} Service...`)
      execFileSync('sc', ['start', this.hbService.serviceName])
      this.hbService.logger.success(`${this.hbService.serviceName} Started`)
    } catch (e) {
      this.hbService.logger.error(`Failed to start ${this.hbService.serviceName}`)
    }
  }

  /**
   * Stops the Windows 10 Homebridge Service
   */
  public async stop() {
    this.checkIsAdmin()
    this.assertSafeServiceName()

    try {
      this.hbService.logger.log(`Stopping ${this.hbService.serviceName} Service...`)
      execFileSync('sc', ['stop', this.hbService.serviceName])
      this.hbService.logger.success(`${this.hbService.serviceName} Stopped`)
    } catch (e) {
      this.hbService.logger.error(`Failed to stop ${this.hbService.serviceName}`)
    }
  }

  /**
   * Restarts the Windows 10 Homebridge Service
   */
  public async restart() {
    this.checkIsAdmin()
    await this.stop()
    // Await the delay then await start() so the outer promise reflects
    // the real outcome. A fire-and-forget setTimeout would resolve
    // before the service is back up and would swallow any start()
    // failure as an unhandled rejection.
    await new Promise(resolve => setTimeout(resolve, 4000))
    await this.start()
  }

  /**
   * Rebuilds the Node.js modules for Homebridge UI
   */
  public async rebuild(all = false) {
    this.checkIsAdmin()

    try {
      execSync('npm rebuild', {
        cwd: process.env.UIX_BASE_PATH,
        stdio: 'inherit',
      })

      this.hbService.logger.success(`Rebuilt modules in ${process.env.UIX_BASE_PATH} for Node.js ${process.version}.`)
    } catch (e) {
      console.error(e.toString())
      this.hbService.logger.error('ERROR: Failed Operation')
    }
  }

  /**
   * Update Node.js
   */
  public async updateNodejs(job: { target: string, rebuild: boolean }) {
    this.hbService.logger.error('ERROR: This command is not supported on Windows.')
    this.hbService.logger.error(`Please download Node.js v${job.target} from https://nodejs.org/en/download/ and install manually.`)
  }

  /**
   * Defence-in-depth — re-run the `serviceName` regex at the start of each
   * Win32Installer entry point. The CLI guards `--service-name` already, but
   * the value also reaches `execFileSync('sc', [...serviceName])` here; if
   * that upstream check is ever weakened we still refuse to pass an unsafe
   * value to `sc`.
   */
  private assertSafeServiceName() {
    if (!RE_SERVICE_NAME.test(this.hbService.serviceName)) {
      this.hbService.logger.error(`ERROR: Refusing to run — invalid service name "${this.hbService.serviceName}".`)
      process.exit(1)
    }
  }

  /**
   * Checks if the current user is an admin
   */
  private checkIsAdmin() {
    try {
      execSync('fsutil dirty query %systemdrive% >nul')
    } catch (e) {
      this.hbService.logger.error('ERROR: This command must be run as an Administrator')
      this.hbService.logger.error('Node.js command prompt shortcut -> Right Click -> Run as administrator')
      process.exit(1)
    }
  }

  /**
   * Windows Only!
   * Downloads nssm - NSSM - the Non-Sucking Service Manager - https://nssm.cc/
   * This is used to create the Windows Services
   * 
   * https://github.com/homebridge/nssm/releases/download/v2.25.1/nssm_arm64.exe
   * https://github.com/homebridge/nssm/releases/latest/download/nssm_arm64.exe
   */
  private async downloadNssm(): Promise<string> {
    const downloadUrl = `https://github.com/homebridge/nssm/releases/latest/download/nssm_${arch()}.exe`
    const nssmPath = resolve(this.hbService.storagePath, 'nssm.exe')

    if (await pathExists(nssmPath)) {
      return nssmPath
    }

    const nssmFile = createWriteStream(nssmPath)

    this.hbService.logger.log(`Downloading NSSM from ${downloadUrl}`)

    return new Promise((res, rej) => {
      axios({
        method: 'GET',
        url: downloadUrl,
        responseType: 'stream',
      })
        .then((response) => {
          response.data.pipe(nssmFile).on('finish', () => {
            return res(nssmPath)
          }).on('error', (err: any) => {
            return rej(err)
          })
        })
        .catch(async (e) => {
          // Cleanup
          nssmFile.close()
          await remove(nssmPath)
          this.hbService.logger.error(`Failed to download nssm: ${e.message}`)
          process.exit(0)
        })
    })
  }

  /**
   * Ensures the Node.js process is allowed to accept incoming connections
   */
  private async configureFirewall() {
    // Firewall commands
    const cleanFirewallCmd = 'netsh advfirewall firewall Delete rule name="Homebridge"'
    const openFirewallCmd = `netsh advfirewall firewall add rule name="Homebridge" dir=in action=allow program="${process.execPath}"`

    // Try and remove any existing rules so there are not any duplicates
    try {
      execSync(cleanFirewallCmd)
    } catch (e) {
      // This is probably ok, the firewall rule may not exist to remove
    }

    // create a new firewall rule
    try {
      execSync(openFirewallCmd)
    } catch (e) {
      this.hbService.logger.warn('Failed to configure firewall rule for Homebridge.')
      this.hbService.logger.log(e)
    }
  }
}
